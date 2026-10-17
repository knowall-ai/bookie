import type { Metadata } from 'next';
import Link from 'next/link';
import { ProsePage } from '@/components/site/ProsePage';
import { GITHUB_URL } from '@/components/site/ui';

export const metadata: Metadata = {
  title: 'Terms of use',
  description:
    'The terms for using Bookie at getbook.ie and the Bookie AI bookkeeper add-on, by KnowAll AI Ltd.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <ProsePage
      title="Terms of use"
      lead="Plain terms for using Bookie. If you run Bookie yourself from the source code, the MIT licence applies instead of these terms."
      updated="17 October 2026"
    >
      <h2>The agreement</h2>
      <p>
        These terms are between you (and the organisation you sign in for) and KnowAll AI Ltd. By
        installing or signing in to Bookie at getbook.ie you agree to them. If you use Bookie on
        behalf of an organisation, you confirm you are allowed to accept them for it.
      </p>

      <h2>What Bookie is</h2>
      <p>
        Bookie is a portal for viewing and working with your books in Xero or Microsoft Dynamics 365
        Business Central. It reads and writes those systems as you, using your own permissions. Your
        books stay in Xero or Business Central: Bookie does not replace them, and your agreements
        with Xero and Microsoft continue to apply.
      </p>

      <h2>Your responsibilities</h2>
      <ul>
        <li>Keep your Microsoft 365 account secure, and only connect books you are entitled to.</li>
        <li>
          Check anything Bookie posts to your books before you confirm it. You remain responsible
          for your accounts, tax returns and filings.
        </li>
        <li>
          Do not use Bookie to break the law, to access other organisations&rsquo; data, or to
          disrupt the service.
        </li>
      </ul>

      <h2>Bookie the AI bookkeeper</h2>
      <p>
        Bookie the AI bookkeeper explains your accounts and offers suggestions. He can be wrong. His
        answers are information, not professional accounting, tax or legal advice, and should be
        checked by a qualified person before you rely on them. The agent is a paid add-on provided
        under a separate order with KnowAll AI.
      </p>

      <h2>Open source</h2>
      <p>
        Bookie&rsquo;s source code is published under the MIT licence on{' '}
        <a href={GITHUB_URL} rel="noreferrer">
          GitHub
        </a>
        . The licence governs your use of the code. These terms govern the service we run at
        getbook.ie.
      </p>

      <h2>Availability and changes</h2>
      <p>
        We work to keep Bookie available and secure, but provide the hosted portal &ldquo;as
        is&rdquo; without a guaranteed service level unless agreed in writing. We may change or
        retire features, and will give reasonable notice of significant changes.
      </p>

      <h2>Liability</h2>
      <p>
        Nothing in these terms limits liability that cannot be limited by law. Otherwise, KnowAll AI
        is not liable for indirect or consequential loss, or for loss caused by data in, or changes
        made to, your Xero or Business Central books. Our total liability for the free portal is
        limited to £100; for paid services, to the fees paid in the twelve months before the claim.
      </p>

      <h2>Ending</h2>
      <p>
        You can stop at any time by removing Bookie from your Microsoft 365 organisation. We may
        suspend access that breaks these terms or puts other customers at risk.
      </p>

      <h2>Privacy and law</h2>
      <p>
        Our <Link href="/privacy">privacy notice</Link> explains how we handle personal data. These
        terms are governed by the law of England and Wales, and its courts have jurisdiction.
      </p>
    </ProsePage>
  );
}
