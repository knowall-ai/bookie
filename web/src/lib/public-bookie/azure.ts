import 'server-only';
import { DefaultAzureCredential } from '@azure/identity';
import type { PublicAzureConfig } from './config';
import { publicBookieInstructions } from './prompt';
import { PUBLIC_LIMITS } from './shared';

/**
 * Azure OpenAI calls for the public helper, on the public resource only.
 * No tools are ever sent: `tools: []` and `tool_choice: 'none'` on every
 * session and response.
 */
let credential: DefaultAzureCredential | undefined;

async function authHeaders(config: PublicAzureConfig): Promise<Record<string, string>> {
  if (config.apiKey) return { 'api-key': config.apiKey };
  credential ??= new DefaultAzureCredential();
  const token = await credential.getToken('https://cognitiveservices.azure.com/.default');
  return { Authorization: `Bearer ${token.token}` };
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** One stateless text turn (Responses API, `store: false`, no tools). */
export async function publicChat(config: PublicAzureConfig, turns: ChatTurn[]): Promise<string> {
  const response = await fetch(`${config.endpoint}/openai/v1/responses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders(config)) },
    body: JSON.stringify({
      model: config.chatDeployment,
      instructions: publicBookieInstructions('chat'),
      input: turns.map((t) => ({ role: t.role, content: t.content })),
      tools: [],
      tool_choice: 'none',
      store: false,
      reasoning: { effort: 'low' },
      max_output_tokens: 1200,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(45_000),
  });
  const body = (await response.json().catch(() => ({}))) as {
    output?: { type?: string; content?: { type: string; text?: string }[] }[];
    error?: { code?: string };
  };
  if (!response.ok || !body.output) {
    throw new UpstreamError(response.status, body.error?.code);
  }
  let text = '';
  for (const item of body.output) {
    if (item.type !== 'message') continue;
    for (const part of item.content ?? []) {
      if (part.type === 'output_text' && part.text) text += part.text;
    }
  }
  return text;
}

export class UpstreamError extends Error {
  constructor(
    readonly status: number,
    readonly code?: string
  ) {
    super(`Azure OpenAI ${status}${code ? ` ${code}` : ''}`);
  }
}

// ---- Voice ----------------------------------------------------------------

/** The session every public call gets. The browser never sees or sets it. */
export function publicVoiceSession(config: PublicAzureConfig) {
  return {
    type: 'realtime',
    model: config.voiceDeployment,
    instructions: publicBookieInstructions('voice'),
    tools: [],
    tool_choice: 'none',
    max_output_tokens: 1024,
    audio: { output: { voice: config.voice } },
  };
}

/**
 * Starts a WebRTC call on behalf of the browser. The server mints a 30-second
 * client secret, uses it itself to post the browser's SDP offer, and returns
 * only the SDP answer: the secret never reaches the browser, so it cannot be
 * reused to open more calls. The call id lets the server watch and end it.
 */
export async function startVoiceCall(
  config: PublicAzureConfig,
  offerSdp: string
): Promise<{ answerSdp: string; callId: string }> {
  const minted = await fetch(`${config.endpoint}/openai/v1/realtime/client_secrets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders(config)) },
    body: JSON.stringify({
      expires_after: { anchor: 'created_at', seconds: 30 },
      session: publicVoiceSession(config),
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  const secret = (await minted.json().catch(() => ({}))) as {
    value?: string;
    error?: { code?: string };
  };
  if (!minted.ok || !secret.value) throw new UpstreamError(minted.status, secret.error?.code);

  const call = await fetch(`${config.endpoint}/openai/v1/realtime/calls`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret.value}`, 'Content-Type': 'application/sdp' },
    body: offerSdp,
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  const answerSdp = await call.text();
  const callId = call.headers.get('location')?.split('/').pop();
  if (!call.ok || !callId || !answerSdp.startsWith('v=')) throw new UpstreamError(call.status);
  return { answerSdp, callId };
}

export async function hangUp(config: PublicAzureConfig, callId: string): Promise<void> {
  await fetch(`${config.endpoint}/openai/v1/realtime/calls/${encodeURIComponent(callId)}/hangup`, {
    method: 'POST',
    headers: await authHeaders(config),
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
}

interface SidebandEvent {
  type: string;
  session?: { instructions?: string; tools?: unknown[] };
  item?: { role?: string; type?: string; content?: { type?: string }[] };
}

/**
 * Decides whether a server event seen on the sideband means the browser has
 * tampered with the call over its data channel. The widget only ever sends
 * audio, so any of these is someone poking at the session by hand:
 *  - a session update that changes the instructions or adds tools;
 *  - a system message, a typed (input_text) message or a function call output;
 *  - a function call (there are no tools, so there should never be one).
 */
export function isTampering(event: SidebandEvent, instructions: string): boolean {
  if (event.type === 'session.updated') {
    return (
      (event.session?.instructions !== undefined && event.session.instructions !== instructions) ||
      (event.session?.tools?.length ?? 0) > 0
    );
  }
  if (event.type === 'conversation.item.added' || event.type === 'conversation.item.created') {
    const item = event.item;
    if (!item) return false;
    if (item.type === 'function_call' || item.type === 'function_call_output') return true;
    if (item.role === 'system') return true;
    if (item.role === 'user' && item.content?.some((c) => c.type !== 'input_audio')) return true;
  }
  return false;
}

const MAX_RESPONSES_PER_CALL = 40;

/**
 * Watches a call from the server side ("sideband") and ends it when:
 * the time limit is reached, the browser tampers with the session, or it has
 * produced too many responses. Resolves with the reason when the call ends.
 */
export function superviseCall(config: PublicAzureConfig, callId: string): Promise<string> {
  const instructions = publicBookieInstructions('voice');
  return new Promise((resolve) => {
    let finished = false;
    let responses = 0;
    let ws: WebSocket | undefined;
    const finish = (reason: string) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try {
        ws?.close();
      } catch {
        // Already closed.
      }
      if (reason !== 'ended') void hangUp(config, callId);
      resolve(reason);
    };
    const timer = setTimeout(() => finish('time-limit'), PUBLIC_LIMITS.voiceMaxSeconds * 1000);

    authHeaders(config)
      .then((headers) => {
        const url = `${config.endpoint.replace(/^https/, 'wss')}/openai/v1/realtime?call_id=${encodeURIComponent(callId)}`;
        // Node's WebSocket (undici) accepts headers; browsers' does not, but this runs on the server.
        ws = new WebSocket(url, { headers } as unknown as string[]);
        ws.onmessage = (message) => {
          let event: SidebandEvent;
          try {
            event = JSON.parse(String(message.data)) as SidebandEvent;
          } catch {
            return;
          }
          if (isTampering(event, instructions)) return finish('tampering');
          if (event.type === 'response.done' && ++responses > MAX_RESPONSES_PER_CALL) {
            finish('too-many-responses');
          }
        };
        let failed = false;
        // The sideband closes when the visitor hangs up. If it failed instead, keep the timer.
        ws.onclose = () => (failed ? undefined : finish('ended'));
        ws.onerror = () => {
          failed = true;
        };
      })
      .catch(() => {
        // Time limit still applies.
      });
  });
}
