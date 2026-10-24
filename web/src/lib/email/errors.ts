export class MailboxGraphError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    label: string
  ) {
    super(`Graph ${status} ${label}`);
    this.name = 'MailboxGraphError';
  }
}
