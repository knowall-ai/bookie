import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/lib/portal/actions/accounts-inbox', () => ({
  createSupplierFromMail: vi.fn(),
  updateSupplierFromMail: vi.fn(),
}));
import { SupplierPanel } from './SupplierPanel';
it('disables unverified address, email and phone boxes with the Exchange explanation', () => {
  const html = renderToStaticMarkup(
    <SupplierPanel
      orgKey="demo.contoso"
      messageId="message"
      attachmentId="att"
      source="Demo"
      trust="unverified"
      status="matched"
      name="Contoso"
      reason="Name matches"
      canUpdate
      diffs={['address', 'email', 'phone', 'taxNumber'].map((field) => ({
        field,
        label: field,
        proposed: 'Printed value',
      }))}
    />
  );
  expect(html.match(/disabled=""/g)).toHaveLength(5);
  expect(html.match(/Only from an email Exchange verified/g)).toHaveLength(4);
  expect(html).not.toContain('checked=""');
});

it.each(['trusted', 'unverified'])(
  'shows only permitted new supplier details for %s mail',
  (trust) => {
    const html = renderToStaticMarkup(
      <SupplierPanel
        orgKey="demo.contoso"
        messageId="message"
        attachmentId="att"
        source="Demo"
        trust={trust}
        status="none"
        reason="No match"
        canCreate
        proposed={[
          { label: 'Email', value: 'orders@example.com', source: 'from the sender' },
          { label: 'Phone', value: '01234567890', source: 'from the PDF' },
          { label: 'Company number', value: '12345678', source: 'from the PDF' },
        ]}
      />
    );
    expect(html.includes('orders@example.com')).toBe(trust === 'trusted');
    expect(html.includes('01234567890')).toBe(trust === 'trusted');
    expect(html).toContain('12345678');
    expect(html.includes('Only from an email Exchange verified')).toBe(trust !== 'trusted');
  }
);
