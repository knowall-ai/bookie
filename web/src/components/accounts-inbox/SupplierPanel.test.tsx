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
      diffs={['address', 'email', 'phone'].map((field) => ({
        field,
        label: field,
        proposed: 'Printed value',
      }))}
    />
  );
  expect(html.match(/disabled=""/g)).toHaveLength(4);
  expect(html.match(/Only from an email Exchange verified/g)).toHaveLength(3);
  expect(html).not.toContain('checked=""');
});
