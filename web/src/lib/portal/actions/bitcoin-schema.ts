import { z } from 'zod';

export const SCRIPT_TYPES = ['pkh', 'sh-wpkh', 'wpkh', 'tr'] as const;

export const addWalletSchema = z.object({
  name: z.string().trim().min(1, 'Give the wallet a name.').max(80),
  orgKey: z
    .string()
    .max(300)
    .regex(/^(xero|bc|demo)\.[\w.-]+$/, 'That is not an organisation Bookie knows.'),
  key: z
    .string()
    .trim()
    .min(100, 'Paste the whole xpub, ypub, zpub or descriptor.')
    .max(4000, 'That is too long for a wallet descriptor.'),
  scriptType: z.enum(SCRIPT_TYPES).optional(),
});

export type AddWalletInput = z.output<typeof addWalletSchema>;
