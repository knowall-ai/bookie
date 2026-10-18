import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { ProsePage } from '@/components/site/ProsePage';
import { adminConsentUrl, siteOrigin } from '@/components/site/origin';
import { buttonClass } from '@/components/ui/Button';

export const metadata: Metadata = {
  title: 'Install Bookie for your organisation',
  description:
    'For Microsoft 365 administrators: the delegated permissions Bookie asks for, why it needs each one, and a one-click admin consent to install it for your organisation.',
  alternates: { canonical: '/install' },
};

export const dynamic = 'force-dynamic';

const PERMISSIONS = [
  {
    api: 'Microsoft Graph',
    scope: 'openid, profile, email, offline_access',
    why: 'Sign you in with your work account and keep you signed in.',
  },
  {
    api: 'Microsoft Graph',
    scope: 'User.Read',
    why: 'Read your name, email and organisation so the portal knows who you are.',
  },
  {
    api: 'Dynamics 365 Business Central',
    scope: 'Financials.ReadWrite.All (user_impersonation)',
    why: 'Open Business Central as you, with your own licence and permission sets. Only used if you switch Business Central on.',
  },
  {
    api: 'Microsoft Graph',
    scope: 'Sites.Manage.All',
    why: 'Keep Bookie’s sealed connection settings in a hidden list on your own SharePoint, instead of on our servers.',
  },
  {
    api: 'Microsoft Graph',
    scope: 'User.ReadBasic.All',
    why: 'Find people in your directory (name and email) when a member gives someone access in Settings › People and access.',
  },
  {
    api: 'Microsoft Graph',
    scope: 'Application.Read.All (optional)',
    why: 'Read who is assigned to Bookie in Enterprise applications, so People and access can say when someone can’t sign in yet. Bookie never assigns anyone itself.',
  },
  {
    api: 'Microsoft Graph',
    scope: 'GroupMember.Read.All (optional)',
    why: 'Check group membership for people assigned to Bookie through a group, for the same sign-in hint.',
  },
];

export default async function InstallPage() {
  const consentUrl = adminConsentUrl(await siteOrigin());

  return (
    <ProsePage
      title="Install Bookie for your organisation"
      lead="A Microsoft 365 administrator approves Bookie once, and everyone in your organisation can then sign in with their work account. It takes about a minute."
      aside={
        <div className="card border-brand/30 p-6 lg:sticky lg:top-24">
          <ShieldCheck aria-hidden="true" className="text-brand h-7 w-7" />
          <p className="text-ink mt-3 font-semibold">Ready to install?</p>
          <p className="text-body mt-2 text-sm leading-relaxed">
            You will be asked to sign in as a Global Administrator, Cloud Application Administrator
            or Application Administrator, then shown the permissions below.
          </p>
          <a
            href={consentUrl}
            className={buttonClass('primary', 'md', 'mt-5 h-12 w-full text-base')}
          >
            Install for my organisation
          </a>
          <p className="text-faint mt-4 text-xs leading-relaxed">
            Not an administrator? Send this page to your IT team, or{' '}
            <Link href="/portal" className="text-brand-bright hover:underline">
              sign in
            </Link>{' '}
            if your organisation already uses Bookie.
          </p>
        </div>
      }
    >
      <h2>What Bookie asks for</h2>
      <p>
        Every permission is <strong>delegated</strong>: Bookie acts as the person signed in, with
        their access and nothing more. It has no application permissions and cannot read anything on
        its own.
      </p>
      <div className="border-line my-6 overflow-x-auto rounded-(--radius-card) border">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-surface-2 text-faint text-xs">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                Permission
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Why Bookie needs it
              </th>
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map((p) => (
              <tr key={p.scope} className="border-line border-t align-top">
                <th scope="row" className="px-4 py-3 font-normal">
                  <span className="text-ink block font-semibold">{p.scope}</span>
                  <span className="text-faint block text-xs">{p.api}</span>
                </th>
                <td className="text-body px-4 py-3">{p.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>What happens next</h2>
      <ol>
        <li>Microsoft asks you to review and accept the permissions for your organisation.</li>
        <li>You come back to Bookie and see a confirmation.</li>
        <li>
          Anyone in your organisation can sign in at <Link href="/portal">getbook.ie/portal</Link>{' '}
          and connect Xero, or switch on Business Central.
        </li>
      </ol>

      <h2>Limiting who can use it</h2>
      <p>
        Bookie appears in Microsoft Entra under Enterprise applications. To limit it to certain
        people, set <strong>Assignment required</strong> to Yes and assign the users or groups who
        should have access. Conditional access policies apply to Bookie like any other app.
      </p>

      <h2>Removing Bookie</h2>
      <p>
        Delete Bookie from Enterprise applications and remove the hidden{' '}
        <code>BookieConnections</code> list from your root SharePoint site. Bookie holds no copy of
        your accounts, so nothing else is left behind. See <Link href="/security">security</Link>{' '}
        for the full data-handling story.
      </p>
    </ProsePage>
  );
}
