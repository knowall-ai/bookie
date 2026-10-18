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

const orgKey = addWalletSchema.shape.orgKey;
/** A sealed wallet's UUID, the demo wallet, or `bc~{bank account id}`. */
const walletId = z
  .string()
  .max(80)
  .regex(/^[\w~-]+$/, 'Unknown wallet.');
const accountCode = z
  .string()
  .trim()
  .min(1, 'Choose an account.')
  .max(20)
  .regex(/^[\w./ -]+$/, 'Unknown account.');

export const draftJournalSchema = z.object({
  orgKey,
  walletId,
  txids: z
    .array(z.string().regex(/^[0-9a-f]{64}$/, 'Unknown transaction.'))
    .min(1, 'Choose at least one transaction.')
    .max(200, 'Draft up to 200 transactions at a time.')
    .transform((ids) => [...new Set(ids)]),
  counterAccount: accountCode,
  feeAccount: accountCode.optional(),
});

export const postJournalSchema = z.object({
  orgKey,
  walletId,
  batchId: z
    .string()
    .max(80)
    .regex(/^[\w-]+$/, 'Unknown journal batch.'),
});
