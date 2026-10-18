import { z } from 'zod';
import type { BankAccountInput, Currency } from '@/lib/domain/types';
import type { NewBankAccountRules } from '@/lib/connectors/types';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || undefined);

/** The shape every source accepts; `bankAccountProblem` then applies the source's own rules. */
export const bankAccountSchema = z.object({
  name: z.string().trim().min(1, 'Enter an account name.').max(150),
  code: optionalText(20).refine((v) => !v || /^[A-Za-z0-9.-]+$/.test(v), {
    message: 'Codes use letters, numbers, dots and dashes only.',
  }),
  accountNumber: optionalText(255),
  iban: optionalText(50).refine((v) => !v || /^[A-Za-z]{2}[0-9]{2}[A-Za-z0-9 ]+$/.test(v), {
    message: 'Enter the IBAN as it appears on the bank statement, starting with the country code.',
  }),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, 'Choose a currency.')
    .transform((v) => v.toUpperCase()),
  type: z.enum(['bank', 'credit-card', 'paypal']).optional(),
});

/** What the account number is called for each kind of account, as Xero labels it. */
export function accountNumberLabel(type: BankAccountInput['type']): string {
  if (type === 'credit-card') return 'Last 4 digits of the card';
  if (type === 'paypal') return 'PayPal email address';
  return 'Account number';
}

/**
 * The source's own rules (lengths, required fields, kinds) and the currencies
 * the books actually have. Returns the first problem, or undefined when the
 * input can be sent.
 */
export function bankAccountProblem(
  input: BankAccountInput,
  rules: NewBankAccountRules,
  currencies: Currency[]
): string | undefined {
  if (input.name.length > rules.nameMaxLength) {
    return `Account names are at most ${rules.nameMaxLength} characters.`;
  }
  if (!input.code && !rules.codeOptional) return 'Enter a code.';
  if (input.code && input.code.length > rules.codeMaxLength) {
    return `Codes are at most ${rules.codeMaxLength} characters.`;
  }
  const type = input.type ?? 'bank';
  if (!rules.types.includes(type)) return 'Choose an account type.';
  if (rules.accountNumberRequired && !input.accountNumber) {
    return type === 'credit-card'
      ? 'Enter the last 4 digits of the card.'
      : type === 'paypal'
        ? 'Enter the PayPal email address.'
        : 'Enter the account number.';
  }
  if (input.accountNumber && input.accountNumber.length > rules.accountNumberMaxLength) {
    return `Account numbers are at most ${rules.accountNumberMaxLength} characters.`;
  }
  if (input.iban && !rules.iban) return 'This organisation has no IBAN field on bank accounts.';
  const known = currencies.some((c) => c.code.toUpperCase() === input.currency.toUpperCase());
  if (!known) return `${input.currency} isn't set up in this organisation's books.`;
  return undefined;
}
