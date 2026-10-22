import { z } from 'zod';

const address = z.string().trim().toLowerCase().max(320).email('Enter a valid email address.');
export const emailSettingsSchema = z.strictObject({
  agentAddress: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.union([address, z.literal('')])),
  sharedMailboxes: z
    .array(
      z.strictObject({
        address,
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
      rows.map(({ address, label, capture }) => ({
        address,
        ...(label ? { label } : {}),
        ...(capture ? { capture: true as const } : {}),
      }))
    ),
});
