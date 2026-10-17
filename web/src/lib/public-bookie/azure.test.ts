import { describe, expect, it } from 'vitest';
import { isTampering, publicVoiceSession } from './azure';

const INSTRUCTIONS = 'the real instructions';

describe('publicVoiceSession', () => {
  it('has no tools and no function calling', () => {
    const session = publicVoiceSession({
      endpoint: 'https://x.openai.azure.com',
      chatDeployment: 'c',
      voiceDeployment: 'v',
      voice: 'cedar',
    });
    expect(session.tools).toEqual([]);
    expect(session.tool_choice).toBe('none');
    expect(session.audio.output.voice).toBe('cedar');
  });
});

describe('isTampering (sideband guard)', () => {
  it('flags a session update that changes instructions or adds tools', () => {
    expect(
      isTampering({ type: 'session.updated', session: { instructions: 'HACKED' } }, INSTRUCTIONS)
    ).toBe(true);
    expect(
      isTampering(
        { type: 'session.updated', session: { instructions: INSTRUCTIONS, tools: [{}] } },
        INSTRUCTIONS
      )
    ).toBe(true);
    expect(
      isTampering(
        { type: 'session.updated', session: { instructions: INSTRUCTIONS, tools: [] } },
        INSTRUCTIONS
      )
    ).toBe(false);
  });

  it('flags system messages, typed messages and function items', () => {
    const item = (i: object) => ({ type: 'conversation.item.added', item: i });
    expect(isTampering(item({ role: 'system', type: 'message' }), INSTRUCTIONS)).toBe(true);
    expect(
      isTampering(
        item({ role: 'user', type: 'message', content: [{ type: 'input_text' }] }),
        INSTRUCTIONS
      )
    ).toBe(true);
    expect(isTampering(item({ type: 'function_call_output' }), INSTRUCTIONS)).toBe(true);
  });

  it('lets normal speech through', () => {
    expect(
      isTampering(
        {
          type: 'conversation.item.added',
          item: { role: 'user', type: 'message', content: [{ type: 'input_audio' }] },
        },
        INSTRUCTIONS
      )
    ).toBe(false);
    expect(
      isTampering(
        {
          type: 'conversation.item.added',
          item: { role: 'assistant', type: 'message', content: [] },
        },
        INSTRUCTIONS
      )
    ).toBe(false);
    expect(isTampering({ type: 'response.done' }, INSTRUCTIONS)).toBe(false);
  });
});
