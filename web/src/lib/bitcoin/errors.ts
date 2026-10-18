/** A Bitcoin wallet problem whose message is safe to show the user. */
export class WalletError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
    this.name = 'WalletError';
  }
}
