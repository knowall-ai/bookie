export function canUpdateFromMail(field: string, trust: string): boolean {
  return (
    field === 'taxNumber' || (trust === 'trusted' && ['email', 'phone', 'address'].includes(field))
  );
}
