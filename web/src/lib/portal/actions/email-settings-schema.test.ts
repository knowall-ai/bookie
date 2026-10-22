import { describe, expect, it } from 'vitest';
import { emailSettingsSchema } from './email-settings-schema';
const valid = { agents: [], sharedMailboxes: [] };
describe('email settings schema', () => {
  it('normalises addresses, labels and false capture flags', () => {
    expect(
      emailSettingsSchema.parse({
        agents: [
          {
            id: 'ava',
            displayName: ' Ava ',
            mailbox: ' AVA@EXAMPLE.COM ',
            teamsUser: ' AVA.TEAMS@EXAMPLE.COM ',
          },
        ],
        sharedMailboxes: [{ address: ' HELLO@EXAMPLE.COM ', label: ' Enquiries ', capture: false }],
      })
    ).toEqual({
      agents: [
        {
          id: 'ava',
          displayName: 'Ava',
          mailbox: 'ava@example.com',
          teamsUser: 'ava.teams@example.com',
        },
      ],
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

const agent = { id: 'ava', displayName: 'Ava', mailbox: 'ava@example.com' };
it.each([
  [{ ...agent, id: 'Ava' }],
  [{ ...agent, id: 'a'.repeat(33) }],
  [{ ...agent, displayName: ' ' }],
  [{ ...agent, displayName: 'a'.repeat(41) }],
  [{ ...agent, mailbox: 'invalid' }],
  [{ ...agent, teamsUser: 'invalid' }],
  [{ ...agent, extra: true }],
  [agent, { ...agent, mailbox: 'other@example.com' }],
  [agent, { ...agent, id: 'other', mailbox: ' AVA@EXAMPLE.COM ' }],
  Array.from({ length: 11 }, (_, i) => ({ ...agent, id: String(i), mailbox: `a${i}@example.com` })),
])('rejects invalid agent list %#', (...agents) => {
  expect(emailSettingsSchema.safeParse({ agents, sharedMailboxes: [] }).success).toBe(false);
});
it('validates per-mailbox agent references and accepts ten agents', () => {
  expect(
    emailSettingsSchema.parse({
      agents: [agent],
      sharedMailboxes: [{ address: 'hello@example.com', agentId: 'ava', capture: true }],
    }).sharedMailboxes[0].agentId
  ).toBe('ava');
  for (const agentId of ['missing', '']) {
    expect(
      emailSettingsSchema.safeParse({
        agents: [agent],
        sharedMailboxes: [{ address: 'hello@example.com', agentId }],
      }).success
    ).toBe(false);
  }
  expect(
    emailSettingsSchema.safeParse({
      agents: Array.from({ length: 10 }, (_, i) => ({
        ...agent,
        id: String(i),
        mailbox: `a${i}@example.com`,
      })),
      sharedMailboxes: [],
    }).success
  ).toBe(true);
});
