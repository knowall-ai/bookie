import type { Metadata } from 'next';
import Link from 'next/link';
import { ProsePage } from '@/components/site/ProsePage';
import { GITHUB_URL } from '@/components/site/ui';

export const metadata: Metadata = {
  title: 'Security and data handling',
  description:
    'How Bookie handles your accounting data: read live and never stored, connection settings sealed and kept in your own Microsoft 365, strict tenant isolation, and no AI training on Xero data.',
  alternates: { canonical: '/security' },
};

const SUBPROCESSORS = [
  {
    name: 'Microsoft Azure',
    what: 'Hosts the Bookie web app and the Key Vault that holds the master sealing key. Microsoft Entra ID handles sign-in.',
    where: 'Azure region of the deployment',
  },
  {
    name: 'Microsoft 365 (your tenant)',
    what: 'Your sealed connection settings live in a hidden SharePoint list in your own Microsoft 365. Business Central is read through Microsoft’s API as you.',
    where: 'Wherever your tenant is hosted',
  },
  {
    name: 'Xero',
    what: 'Your Xero organisations are read and, when you ask, updated through Xero’s official API.',
    where: 'As set by Xero',
  },
  {
    name: 'OpenAI models via Azure OpenAI',
    what: 'Used only by Bookie the AI bookkeeper, to understand questions and write answers. Runs in Azure OpenAI, not the public OpenAI service, and prompts are not used to train models.',
    where: 'Azure region of your deployment',
  },
];

export default function SecurityPage() {
  return (
    <ProsePage
      title="Security and data handling"
      lead="Bookie is built so that there is as little of your data in our hands as possible. Here is exactly what it touches, where it goes, and what it keeps."
      updated="17 October 2026"
      aside={
        <div className="card p-5 text-sm">
          <p className="text-ink font-semibold">Check it yourself</p>
          <p className="text-body mt-2 leading-relaxed">
            Bookie is open source. Everything on this page can be verified in the code.
          </p>
          <a href={GITHUB_URL} rel="noreferrer" className="text-brand-bright mt-3 inline-block">
            View the source on GitHub
          </a>
          <p className="text-ink mt-6 font-semibold">Found a vulnerability?</p>
          <p className="text-body mt-2 leading-relaxed">
            Please report it privately through GitHub security advisories on the repository, rather
            than in a public issue.
          </p>
        </div>
      }
    >
      <h2>Bookie does not store your accounts</h2>
      <p>
        Bookie is stateless. Every invoice, bill, contact, bank line and report is read live from
        Xero or Business Central at the moment you open the page, shown to you, and discarded. There
        is no Bookie database of your ledger, no nightly sync and no copy to leak.
      </p>
      <p>
        Short-lived access tokens are held in memory only, and every cache entry is keyed by your
        Microsoft 365 tenant, so one organisation&rsquo;s token can never be used for another.
      </p>

      <h2>Connection settings are sealed, and kept in your tenant</h2>
      <p>
        The only things Bookie needs to remember are how to reach your books: which Xero
        organisations you connected and the refresh token Xero issued, and whether Business Central
        is switched on. These settings are:
      </p>
      <ul>
        <li>
          <strong>Sealed per tenant</strong> with authenticated encryption, using a key derived for
          your organisation alone.
        </li>
        <li>
          <strong>Stored in your own Microsoft 365</strong>, in a hidden list called{' '}
          <code>BookieConnections</code> on your organisation&rsquo;s root SharePoint site. You can
          see it, audit it and delete it.
        </li>
        <li>
          <strong>Unreadable without our master key</strong>, which never leaves Azure Key Vault in
          KnowAll AI&rsquo;s tenant. Neither half is useful on its own.
        </li>
      </ul>
      <p>
        To disconnect completely, remove Bookie from Enterprise applications in Microsoft Entra and
        delete the <code>BookieConnections</code> list.
      </p>

      <h2>Tenant isolation</h2>
      <p>
        Everything Bookie does is tied to the Microsoft Entra tenant in your verified sign-in, never
        to anything in the address bar or the request. When you open an organisation, Bookie checks
        again on every request that it belongs to your tenant and that you have access to it. Links
        cannot be edited to reach someone else&rsquo;s books.
      </p>

      <h2>You act as you</h2>
      <p>
        Bookie uses delegated permissions. In Business Central it acts with your own licence and
        permission sets; in Xero, with the access granted when the organisation was connected.
        Bookie cannot do anything you could not already do. Anything that changes your books, such
        as approving, voiding, deleting or emailing a document, or recording a payment, asks you to
        confirm first.
      </p>

      <h2>Bookie the AI bookkeeper</h2>
      <p>
        The agent add-on looks up figures live for each question, through the same permissions. It
        remembers conversations and preferences, not your ledger. Data from the Xero API is never
        used to train or fine-tune AI models, by us or by anyone else, as Xero&rsquo;s developer
        terms require.
      </p>
      <p>
        When installed in your own Azure subscription, Bookie&rsquo;s Microsoft 365 account, memory
        and voice all run in your tenant. If KnowAll AI hosts him for you, each customer gets an
        isolated instance.
      </p>

      <h2>Sign-in and permissions</h2>
      <p>
        Sign-in is Microsoft Entra ID, so your multi-factor authentication, conditional access and
        account lifecycle apply as normal. The permissions Bookie asks for are listed on the{' '}
        <Link href="/install">install page</Link>.
      </p>

      <h2>Subprocessors</h2>
      <p>These services process data when you use Bookie:</p>
      <div className="not-prose border-line my-6 overflow-x-auto rounded-(--radius-card) border">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-surface-2 text-faint text-xs">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                Service
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                What it does
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Location
              </th>
            </tr>
          </thead>
          <tbody>
            {SUBPROCESSORS.map((s) => (
              <tr key={s.name} className="border-line border-t align-top">
                <th scope="row" className="text-ink px-4 py-3 font-semibold">
                  {s.name}
                </th>
                <td className="text-body px-4 py-3">{s.what}</td>
                <td className="text-muted px-4 py-3">{s.where}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Transport and browser security</h2>
      <p>
        All traffic is HTTPS with HSTS. Pages are served with headers that block framing and content
        sniffing, and the portal sets no third-party tracking or advertising cookies.
      </p>
    </ProsePage>
  );
}
