import { describe, expect, it } from 'vitest';
import { parseContactInput } from './contact-schema';

describe('contact form validation', () => {
  it('requires a name', () => {
    expect(() => parseContactInput({ name: '   ' }, 'create')).toThrow('Enter a contact name.');
  });

  it('validates email and website', () => {
    expect(() => parseContactInput({ name: 'A', email: 'not-an-email' }, 'create')).toThrow(
      'Enter a valid email address.'
    );
    expect(() => parseContactInput({ name: 'A', website: 'not a site' }, 'create')).toThrow(
      'Enter a valid website address.'
    );
  });

  it('rejects unknown fields', () => {
    expect(() => parseContactInput({ name: 'A', status: 'archived' }, 'create')).toThrow();
  });

  it('drops blanks on create and adds https to websites', () => {
    const input = parseContactInput(
      {
        name: ' Contoso Deli ',
        email: '',
        website: 'www.contoso.example.com',
        address: { line1: '', city: '' },
        isCustomer: true,
      },
      'create'
    );
    expect(input).toMatchObject({
      name: 'Contoso Deli',
      website: 'https://www.contoso.example.com',
      isCustomer: true,
    });
    expect(input.email).toBeUndefined();
    expect(input.address).toBeUndefined();
  });

  it('keeps blanks on update so fields can be cleared', () => {
    const input = parseContactInput(
      { name: 'Contoso', email: '', address: { line1: '', city: 'Leeds' } },
      'update'
    );
    expect(input.email).toBe('');
    expect(input.address).toMatchObject({ line1: '', city: 'Leeds' });
  });
});
