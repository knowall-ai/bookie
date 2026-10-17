import { describe, expect, it } from 'vitest';
import { bookieInstructions } from './prompt';

const user = { name: 'Alex Example', userType: 'Member' as const };

describe('portal Bookie prompt', () => {
  it('never names the product by a domain', () => {
    for (const mode of ['chat', 'voice', 'insights'] as const) {
      expect(bookieInstructions(undefined, user, mode)).not.toMatch(/getbook/i);
    }
  });

  it('tells voice never to read a web address aloud', () => {
    expect(bookieInstructions(undefined, user, 'voice')).toMatch(
      /Never say a web address, domain name or URL aloud/
    );
    expect(bookieInstructions(undefined, user, 'chat')).not.toMatch(/URL aloud/);
  });
});
