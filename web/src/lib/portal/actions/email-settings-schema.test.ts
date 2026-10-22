import { describe, expect, it } from 'vitest';
import { emailSettingsSchema } from './email-settings-schema';
const valid = { agentAddress: '', sharedMailboxes: [] };
describe('email settings schema', () => {
  it('normalises addresses, labels and false capture flags', () => {
    expect(
      emailSettingsSchema.parse({
        agentAddress: ' BOOKIE@EXAMPLE.COM ',
        sharedMailboxes: [{ address: ' HELLO@EXAMPLE.COM ', label: ' Enquiries ', capture: false }],
      })
    ).toEqual({
      agentAddress: 'bookie@example.com',
      sharedMailboxes: [{ address: 'hello@example.com', label: 'Enquiries' }],
    });
    expect(emailSettingsSchema.parse(valid)).toEqual(valid);
  });
  it.each([
    { ...valid, agentAddress: 'invalid' },
    { ...valid, accountsMailbox: 'legacy@example.com' },
    { ...valid, sharedMailboxes: [{ address: '' }] },
    { ...valid, sharedMailboxes: [{ address: 'a@example.com', extra: true }] },
    { ...valid, sharedMailboxes: [{ address: 'a@example.com', label: 'x'.repeat(41) }] },
    { ...valid, sharedMailboxes: [{ address: 'a@example.com' }, { address: ' A@EXAMPLE.COM ' }] },
    {
      ...valid,
      sharedMailboxes: [
        { address: 'a@example.com', capture: true },
        { address: 'b@example.com', capture: true },
      ],
    },
    {
      ...valid,
      sharedMailboxes: Array.from({ length: 11 }, (_, i) => ({ address: `a${i}@example.com` })),
    },
  ])('rejects invalid settings %#', (input) => {
    expect(emailSettingsSchema.safeParse(input).success).toBe(false);
  });
  it('accepts ten mailboxes with one capture target', () => {
    expect(
      emailSettingsSchema.safeParse({
        ...valid,
        sharedMailboxes: Array.from({ length: 10 }, (_, i) => ({
          address: `a${i}@example.com`,
          capture: i === 0,
        })),
      }).success
    ).toBe(true);
  });
});
