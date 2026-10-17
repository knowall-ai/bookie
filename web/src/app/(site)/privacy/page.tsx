import type { Metadata } from 'next';
import Link from 'next/link';
import { ProsePage } from '@/components/site/ProsePage';

export const metadata: Metadata = {
  title: 'Privacy',
  description:
    'What personal data Bookie processes, why, where it is kept and your rights. Bookie reads your accounts live and does not store them.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <ProsePage
      title="Privacy"
      lead="Bookie is designed to hold as little about you as possible. This notice explains what we process when you use getbook.ie and Bookie the AI bookkeeper."
      updated="17 October 2026"
    >
      <h2>Who we are</h2>
      <p>
        Bookie is provided by KnowAll AI Ltd, a company registered in the United Kingdom
        (&ldquo;KnowAll AI&rdquo;, &ldquo;we&rdquo;). For the portal at getbook.ie we are the
        controller of the account data described below. For the accounting data you view through
        Bookie, your organisation remains the controller and we act as its processor.
      </p>

      <h2>What we process</h2>
      <ul>
        <li>
          <strong>Your sign-in details</strong> from Microsoft Entra ID: name, work email, user id
          and organisation (tenant) id. Used to sign you in and to keep each organisation&rsquo;s
          data separate.
        </li>
        <li>
          <strong>Connection settings</strong>: which Xero organisations are connected and the
          tokens needed to reach them. These are encrypted and stored in your own Microsoft 365, not
          on our servers.
        </li>
        <li>
          <strong>Accounting data</strong> from Xero or Business Central, read live when you open a
          page or ask Bookie a question. It is shown to you and then discarded. We do not keep a
          copy.
        </li>
        <li>
          <strong>Conversations with Bookie the AI bookkeeper</strong>, if your organisation uses
          the agent add-on: your questions, his answers and your stated preferences, kept so he can
          remember context. Ledger figures are looked up afresh each time rather than stored.
        </li>
        <li>
          <strong>Questions to Bookie&rsquo;s public helper</strong> on this website, typed or
          spoken: sent to Azure OpenAI to answer them, and not stored or logged by us (we log only
          counts and errors). The helper cannot see anyone&rsquo;s accounts, so please don&rsquo;t
          share personal or financial details with it.
        </li>
        <li>
          <strong>Technical logs</strong>: request times, errors and IP addresses, kept for up to 30
          days to keep the service secure and working.
        </li>
      </ul>

      <h2>What we do not do</h2>
      <ul>
        <li>We do not sell personal data or use it for advertising.</li>
        <li>We do not use tracking or advertising cookies. The only cookies are for sign-in.</li>
        <li>
          We never use data from Xero or Business Central to train or fine-tune AI models, ours or
          anyone else&rsquo;s.
        </li>
      </ul>

      <h2>Our legal basis</h2>
      <p>
        We process account and log data to provide the service you or your organisation asked for
        (contract) and to keep it secure (legitimate interests). Accounting data is processed on
        your organisation&rsquo;s instructions.
      </p>

      <h2>Who else is involved</h2>
      <p>
        Bookie runs on Microsoft Azure, connects to Xero and Microsoft Business Central, and uses
        OpenAI models through Azure OpenAI for Bookie the AI bookkeeper. The full list, with what
        each one does, is on the <Link href="/security">security page</Link>. Where data leaves the
        UK or EEA, it is protected by the standard contractual clauses or an adequacy decision.
      </p>

      <h2>How long we keep it</h2>
      <p>
        Sign-in details last as long as your session. Technical logs are kept for up to 30 days.
        Connection settings live in your tenant and are removed when you delete them there. Bookie
        conversation memory is kept until your organisation removes the agent or asks us to delete
        it.
      </p>

      <h2>Your rights</h2>
      <p>
        You can ask to see, correct or delete personal data we hold about you, object to how we use
        it, or ask us to restrict it. If your request is about your organisation&rsquo;s accounting
        data, please contact your organisation first, as it controls that data. You can also
        complain to the Information Commissioner&rsquo;s Office (ico.org.uk).
      </p>

      <h2>Contact</h2>
      <p>
        Questions about privacy or a request about your data: contact KnowAll AI through{' '}
        <a href="https://knowall.ai" rel="noreferrer">
          knowall.ai
        </a>
        . We will reply within one month.
      </p>

      <h2>Changes</h2>
      <p>
        If we change this notice we will update the date at the top. Significant changes will be
        announced in the portal before they take effect.
      </p>
    </ProsePage>
  );
}
