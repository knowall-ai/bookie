'use client';

import { useCallback, useRef, useState } from 'react';

export type VoiceState = 'idle' | 'connecting' | 'live' | 'ending' | 'error';

interface RealtimeEvent {
  type: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  transcript?: string;
  delta?: string;
  error?: { message?: string };
}

/**
 * In-browser voice with Bookie over WebRTC. The server mints a short-lived
 * secret; audio goes browser <-> Azure OpenAI directly; tool calls are sent
 * back to our server and run as the signed-in user.
 */
export function useBookieVoice(
  orgKey: string | undefined,
  onTranscript: (role: 'assistant' | 'user', text: string) => void
) {
  const [state, setState] = useState<VoiceState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const pc = useRef<RTCPeerConnection | null>(null);
  const mic = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    setState('ending');
    pc.current?.getSenders().forEach((s) => s.track?.stop());
    pc.current?.close();
    mic.current?.getTracks().forEach((t) => t.stop());
    pc.current = null;
    mic.current = null;
    if (audio.current) audio.current.srcObject = null;
    setSpeaking(false);
    setState('idle');
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setState('connecting');
    try {
      const session = await fetch('/api/bookie/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgKey }),
      });
      const {
        clientSecret,
        callsUrl,
        error: sessionError,
      } = (await session.json()) as {
        clientSecret?: string;
        callsUrl?: string;
        error?: string;
      };
      if (!session.ok || !clientSecret || !callsUrl)
        throw new Error(sessionError ?? 'Could not start the call.');

      const connection = new RTCPeerConnection();
      pc.current = connection;
      audio.current ??= new Audio();
      audio.current.autoplay = true;
      connection.ontrack = (e) => {
        if (audio.current) audio.current.srcObject = e.streams[0];
      };
      mic.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      mic.current.getTracks().forEach((track) => connection.addTrack(track, mic.current!));

      const channel = connection.createDataChannel('oai-events');
      const sendEvent = (event: unknown) =>
        channel.readyState === 'open' && channel.send(JSON.stringify(event));
      channel.onopen = () => {
        setState('live');
        sendEvent({
          type: 'response.create',
          response: {
            instructions:
              'Greet the caller briefly by first name and ask what they would like to know about their books.',
          },
        });
      };
      channel.onmessage = async (message) => {
        const event = JSON.parse(message.data as string) as RealtimeEvent;
        switch (event.type) {
          case 'output_audio_buffer.started':
            setSpeaking(true);
            break;
          case 'output_audio_buffer.stopped':
            setSpeaking(false);
            break;
          case 'response.output_audio_transcript.done':
            if (event.transcript) onTranscript('assistant', event.transcript);
            break;
          case 'conversation.item.input_audio_transcription.completed':
            if (event.transcript) onTranscript('user', event.transcript);
            break;
          case 'response.function_call_arguments.done': {
            const result = await fetch('/api/bookie/tool', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                orgKey,
                name: event.name,
                arguments: event.arguments ?? '{}',
              }),
            })
              .then((r) => r.json() as Promise<{ output?: string; error?: string }>)
              .catch(() => ({ error: 'Lookup failed.' }) as { output?: string; error?: string });
            sendEvent({
              type: 'conversation.item.create',
              item: {
                type: 'function_call_output',
                call_id: event.call_id,
                output: result.output ?? JSON.stringify({ error: result.error }),
              },
            });
            sendEvent({ type: 'response.create' });
            break;
          }
          case 'error':
            console.warn('[bookie voice]', event.error?.message);
            break;
        }
      };

      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      const answer = await fetch(callsUrl, {
        method: 'POST',
        body: offer.sdp,
        headers: { Authorization: `Bearer ${clientSecret}`, 'Content-Type': 'application/sdp' },
      });
      if (!answer.ok) throw new Error('Bookie could not pick up. Please try again.');
      await connection.setRemoteDescription({ type: 'answer', sdp: await answer.text() });
      connection.onconnectionstatechange = () => {
        if (['failed', 'closed', 'disconnected'].includes(connection.connectionState)) stop();
      };
    } catch (err) {
      stop();
      const message =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Bookie needs your microphone. Allow it in your browser and try again.'
          : err instanceof Error
            ? err.message
            : 'The call could not start.';
      setError(message);
      setState('error');
    }
  }, [orgKey, onTranscript, stop]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    mic.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  }, [muted]);

  return { state, error, muted, speaking, start, stop, toggleMute };
}
