import 'server-only';
import { DefaultAzureCredential } from '@azure/identity';

/**
 * Bookie's model calls go to KnowAll's (or the self-hoster's) own Azure OpenAI
 * resource. Azure OpenAI does not train on prompts or completions, which keeps
 * us inside Xero's rule that API data must not train AI models.
 */
/** A Responses API input/output item (messages, function calls, reasoning). */
export type ResponseItem = Record<string, unknown> & { type?: string };

export interface ToolDefinition {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface FunctionCall {
  call_id: string;
  name: string;
  arguments: string;
}

let credential: DefaultAzureCredential | undefined;

export async function azureHeaders(): Promise<Record<string, string>> {
  if (process.env.AZURE_OPENAI_API_KEY) return { 'api-key': process.env.AZURE_OPENAI_API_KEY };
  credential ??= new DefaultAzureCredential();
  const token = await credential.getToken('https://cognitiveservices.azure.com/.default');
  return { Authorization: `Bearer ${token.token}` };
}

export function bookieConfigured(): boolean {
  // BOOKIE_DISABLE_AI=1 turns Bookie off (end-to-end tests: no live model calls).
  if (process.env.BOOKIE_DISABLE_AI === '1') return false;
  return !!process.env.AZURE_OPENAI_ENDPOINT;
}

/**
 * One Responses API turn. `store: false` keeps nothing on the Azure side;
 * reasoning is passed back encrypted so multi-step tool use still works.
 */
export async function respond(
  instructions: string,
  input: ResponseItem[],
  tools?: ToolDefinition[]
): Promise<{ output: ResponseItem[]; text: string; calls: FunctionCall[] }> {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  if (!endpoint)
    throw new Error('Bookie is not configured on this server (AZURE_OPENAI_ENDPOINT).');
  const response = await fetch(`${endpoint.replace(/\/$/, '')}/openai/v1/responses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await azureHeaders()) },
    body: JSON.stringify({
      model: process.env.BOOKIE_CHAT_DEPLOYMENT ?? 'gpt-6.1-sol',
      instructions,
      input,
      tools: tools?.length ? tools : undefined,
      store: false,
      include: ['reasoning.encrypted_content'],
      max_output_tokens: 4000,
    }),
    cache: 'no-store',
  });
  const body = (await response.json().catch(() => ({}))) as {
    output?: ResponseItem[];
    error?: { message?: string };
  };
  if (!response.ok || !body.output) {
    throw new Error(`Bookie's model call failed: ${body.error?.message ?? response.status}`);
  }
  const calls: FunctionCall[] = [];
  let text = '';
  for (const item of body.output) {
    if (item.type === 'function_call') {
      calls.push({
        call_id: String(item.call_id),
        name: String(item.name),
        arguments: String(item.arguments ?? ''),
      });
    } else if (item.type === 'message') {
      for (const part of (item.content as { type: string; text?: string }[] | undefined) ?? []) {
        if (part.type === 'output_text' && part.text) text += part.text;
      }
    }
  }
  return { output: body.output, text, calls };
}

/**
 * One structured-output call: the model must answer with JSON matching `schema`.
 * Used to read emailed documents (Accounts inbox). Nothing is stored on the Azure side
 * (`store: false`), and Azure OpenAI doesn't train on it.
 */
export async function respondJson(
  instructions: string,
  input: ResponseItem[],
  schema: { name: string; schema: Record<string, unknown> }
): Promise<string> {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  if (!endpoint)
    throw new Error('Bookie is not configured on this server (AZURE_OPENAI_ENDPOINT).');
  const response = await fetch(`${endpoint.replace(/\/$/, '')}/openai/v1/responses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await azureHeaders()) },
    body: JSON.stringify({
      model: process.env.BOOKIE_CHAT_DEPLOYMENT ?? 'gpt-6.1-sol',
      instructions,
      input,
      text: {
        format: { type: 'json_schema', name: schema.name, schema: schema.schema, strict: true },
      },
      store: false,
      // Room for long invoices (up to 200 lines) without truncating the JSON.
      max_output_tokens: 16000,
    }),
    cache: 'no-store',
  });
  const body = (await response.json().catch(() => ({}))) as {
    output?: ResponseItem[];
    error?: { message?: string };
  };
  if (!response.ok || !body.output) {
    throw new Error(`Bookie's model call failed: ${body.error?.message ?? response.status}`);
  }
  let text = '';
  for (const item of body.output) {
    if (item.type !== 'message') continue;
    for (const part of (item.content as { type: string; text?: string }[] | undefined) ?? []) {
      if (part.type === 'output_text' && part.text) text += part.text;
    }
  }
  return text;
}
