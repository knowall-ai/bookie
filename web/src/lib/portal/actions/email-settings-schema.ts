import { z } from 'zod';

const address = z.string().trim().toLowerCase().max(320).email('Enter a valid email address.');
export const emailSettingsSchema = z
  .strictObject({
    agents: z
      .array(
        z.strictObject({
          id: z.string().regex(/^[a-z0-9-]{1,32}$/),
          displayName: z.string().trim().min(1).max(40),
          mailbox: address,
          teamsUser: address.optional(),
        })
      )
      .max(10)
      .superRefine((agents, ctx) => {
        if (new Set(agents.map((a) => a.id)).size !== agents.length)
          ctx.addIssue({ code: 'custom', message: 'Each agent id must be unique.' });
        if (new Set(agents.map((a) => a.mailbox)).size !== agents.length)
          ctx.addIssue({ code: 'custom', message: 'Each agent mailbox must be unique.' });
      }),
    sharedMailboxes: z
      .array(
        z.strictObject({
          address,
          agentId: z.string().min(1).optional(),
          label: z.string().trim().max(40).optional(),
          capture: z.boolean().optional(),
        })
      )
      .max(10)
      .superRefine((rows, ctx) => {
        if (new Set(rows.map((row) => row.address)).size !== rows.length)
          ctx.addIssue({ code: 'custom', message: 'Each mailbox address must be unique.' });
        if (rows.filter((row) => row.capture).length > 1)
          ctx.addIssue({ code: 'custom', message: 'Choose at most one bill capture mailbox.' });
      })
      .transform((rows) =>
        rows.map(({ address, label, capture, agentId }) => ({
          address,
          ...(agentId ? { agentId } : {}),
          ...(label ? { label } : {}),
          ...(capture ? { capture: true as const } : {}),
        }))
      ),
  })
  .superRefine(({ agents, sharedMailboxes }, ctx) => {
    sharedMailboxes.forEach((mailbox, index) => {
      if (mailbox.agentId !== undefined && !agents.some((agent) => agent.id === mailbox.agentId))
        ctx.addIssue({
          code: 'custom',
          path: ['sharedMailboxes', index, 'agentId'],
          message: 'Choose a configured agent.',
        });
    });
  });
