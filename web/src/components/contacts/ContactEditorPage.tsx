import { notFound } from 'next/navigation';
import { orgContext } from '@/lib/portal/context';
import { isConnectorError } from '@/lib/connectors/types';
import { saveContact } from '@/lib/portal/actions/contacts';
import type { ContactInput } from '@/lib/domain/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { ContactForm } from './ContactForm';

export async function ContactEditorPage({
  orgParam,
  id,
  role,
}: {
  orgParam: string;
  id?: string;
  role?: string;
}) {
  const { connector, base, org } = await orgContext(orgParam);
  const mod = connector.contacts;
  if (!mod || !(id ? mod.update : mod.create)) notFound();

  const existing = id
    ? await mod.get(decodeURIComponent(id)).catch((error) => {
        if (isConnectorError(error) && (error.status === 404 || error.status === 400)) notFound();
        throw error;
      })
    : undefined;
  const listPath = `${base}/contacts`;
  const orgKey = org.key;
  const contactId = existing?.id;

  async function save(input: ContactInput) {
    'use server';
    return saveContact(orgKey, contactId, input);
  }

  const detailPath = existing ? `${listPath}/${encodeURIComponent(existing.id)}` : undefined;
  return (
    <>
      <div className="mx-auto max-w-4xl">
        <PageHeader
          title={existing ? `Edit ${existing.name}` : 'New contact'}
          crumbs={[
            { label: 'Contacts', href: listPath },
            ...(existing ? [{ label: existing.name, href: detailPath }] : []),
          ]}
        />
      </div>
      <ContactForm
        isNew={!existing}
        initial={
          existing ?? {
            isCustomer: role !== 'supplier',
            isSupplier: role === 'supplier',
          }
        }
        save={save}
        cancelHref={detailPath ?? listPath}
        savedHref={`${listPath}/{id}`}
      />
    </>
  );
}
