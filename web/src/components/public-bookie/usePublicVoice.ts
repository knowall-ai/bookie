'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PUBLIC_LIMITS } from '@/lib/public-bookie/shared';

export type PublicVoiceState = 'idle' | 'connecting' | 'live' | 'error';

/**
 * Voice with Bookie's public helper over WebRTC, the same shape as the
 * portal's useBookieVoice but with no tools and no credentials in the
 * browser: the server places the call from our SDP offer and returns the
 * answer. The data channel is used only to start the greeting and to read
 * Bookie's captions; the visitor's speech is not transcribed.
 */
export function usePublicVoice(getPass: () => Promise<string>, onCaption: (text: string) => void) {
  const [state, setState] = useState<PublicVoiceState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const mic = useRef<MediaStream | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    pc.current?.getSenders().forEach((s) => s.track?.stop());
    pc.current?.close();
    mic.current?.getTracks().forEach((t) => t.stop());
    pc.current = null;
    mic.current = null;
    if (audio.current) audio.current.srcObject = null;
    setSpeaking(false);
    setMuted(false);
    setSecondsLeft(null);
    setState((s) => (s === 'error' ? s : 'idle'));
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(async () => {
    setError(null);
    setState('connecting');
    try {
      // Ask for the microphone first, so a refusal doesn't use up a call.
      mic.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      const pass = await getPass();

      const connection = new RTCPeerConnection();
      pc.current = connection;
      audio.current ??= new Audio();
      audio.current.autoplay = true;
      connection.ontrack = (e) => {
        if (audio.current) audio.current.srcObject = e.streams[0];
      };
      mic.current.getTracks().forEach((track) => connection.addTrack(track, mic.current!));

      const channel = connection.createDataChannel('oai-events');
      channel.onopen = () => {
        setState('live');
        // Bookie's instructions (set by the server) tell him how to greet.
        channel.send(JSON.stringify({ type: 'response.create' }));
      };
      channel.onmessage = (message) => {
        const event = JSON.parse(message.data as string) as { type: string; transcript?: string };
        if (event.type === 'output_audio_buffer.started') setSpeaking(true);
        if (event.type === 'output_audio_buffer.stopped') setSpeaking(false);
        if (event.type === 'response.output_audio_transcript.done' && event.transcript) {
          onCaption(event.transcript);
        }
      };

      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      const res = await fetch('/api/public/voice/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-bookie-pass': pass },
        body: JSON.stringify({ sdp: offer.sdp }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        sdp?: string;
        maxSeconds?: number;
        error?: string;
      };
      if (!res.ok || !body.sdp) throw new Error(body.error ?? 'Bookie could not pick up.');
      await connection.setRemoteDescription({ type: 'answer', sdp: body.sdp });
      connection.onconnectionstatechange = () => {
        if (['failed', 'closed', 'disconnected'].includes(connection.connectionState)) stop();
      };

      const ends = Date.now() + (body.maxSeconds ?? PUBLIC_LIMITS.voiceMaxSeconds) * 1000;
      setSecondsLeft(Math.round((ends - Date.now()) / 1000));
      timer.current = setInterval(() => {
        const left = Math.max(0, Math.round((ends - Date.now()) / 1000));
        setSecondsLeft(left);
        if (left === 0) stop();
      }, 1000);
    } catch (err) {
      stop();
      setError(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Bookie needs your microphone for a call. Allow it in your browser, or type instead.'
          : err instanceof Error
            ? err.message
            : 'The call could not start. You can type instead.'
      );
      setState('error');
    }
  }, [getPass, onCaption, stop]);

  const toggleMute = useCallback(() => {
    setMuted((was) => {
      mic.current?.getAudioTracks().forEach((t) => (t.enabled = was));
      return !was;
    });
  }, []);

  return { state, error, muted, speaking, secondsLeft, start, stop, toggleMute };
}
