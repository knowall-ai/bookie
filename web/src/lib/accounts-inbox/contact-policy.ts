export function canUpdateFromMail(field: string, trust: string): boolean {
  return trust === 'trusted' && ['email', 'phone', 'address', 'taxNumber'].includes(field);
}
