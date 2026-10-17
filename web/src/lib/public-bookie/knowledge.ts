/**
 * Product knowledge for the public helper, taken from the public site only:
 * the home page (how it works, Meet Bookie, data, FAQ), /security, /install,
 * /privacy and /terms. Nothing here is private: everything is already on
 * getbook.ie or in the open-source repository.
 *
 * When the site copy changes, update this file too. knowledge.test.ts checks
 * that every FAQ question below still appears on the home page.
 */

export const SITE_FAQ: { q: string; a: string }[] = [
  {
    q: 'Do I need to move off Xero or Business Central?',
    a: 'No. Bookie sits on top of the system you already use and reads it live through its official API. Your subscription, your data and your accountant’s access all stay exactly where they are. Stop using Bookie and nothing changes in your books.',
  },
  {
    q: 'Who is Bookie for?',
    a: 'Accountants and bookkeepers who look after many organisations, and finance teams who want one clear view across Xero and Business Central. If you already live in Microsoft 365 and Teams, it will feel at home.',
  },
  {
    q: 'Does Bookie store my accounting data?',
    a: 'No. Every page is read live from Xero or Business Central when you open it. The only thing Bookie keeps is your connection settings, sealed with encryption and stored in a hidden SharePoint list in your own Microsoft 365. The security page (/security) has the detail.',
  },
  {
    q: 'Can Bookie change anything in my books?',
    a: 'Only what you can already change, because Bookie acts as you, with your own permissions in Xero or Business Central. Anything that posts to your books, such as approving, voiding or emailing an invoice, asks you to confirm first.',
  },
  {
    q: 'Is my Xero data used to train AI?',
    a: 'Never. Bookie the AI bookkeeper looks up your accounts live, for the question you asked, and forgets the figures afterwards. Xero data is not used to train or fine-tune any model, in line with Xero’s developer terms.',
  },
  {
    q: 'How does Bookie join a Teams call?',
    a: 'With the agent add-on, Bookie has his own Microsoft 365 account in your organisation. Invite him to a meeting like any colleague; he joins, listens, and answers questions about the accounts you have given him access to.',
  },
  {
    q: 'What does it cost?',
    a: 'The portal is open source under the MIT licence: run it yourself for free, or use the hosted portal on the Bookie website. Bookie the AI bookkeeper is a paid add-on, installed in your own Azure subscription or hosted by KnowAll AI on request. Get in touch for pricing.',
  },
  {
    q: 'Which accounting systems are next?',
    a: 'Microsoft Dynamics 365 Finance, and simple books kept in your own SharePoint. Because every system plugs into the same model, new connectors arrive without changing how Bookie looks or works.',
  },
];

export const KNOWLEDGE = `
# What Bookie is
Bookie is a familiar, Xero-style accounting portal over Xero or Microsoft Dynamics 365 Business Central, made by KnowAll AI Ltd, a UK company. You switch between every client's books with one Microsoft sign-in, and you can ask Bookie the AI bookkeeper what the numbers mean. It is open source under the MIT licence: https://github.com/knowall-ai/bookie.

# How it works: three steps
1. Install for your Microsoft 365 organisation. An administrator approves Bookie once, for everyone (about a minute). It asks for sign-in, your profile, Business Central as you, and permission to keep its settings in your own SharePoint. Nothing else.
2. Connect Xero or Business Central. Business Central already knows you from your Microsoft sign-in, so you just switch it on. For Xero, approve each organisation on Xero's own consent screen.
3. Open your books: invoices, bills, contacts, bank accounts and reports, laid out the way you know them from Xero, for every organisation you have access to.
No migration and no new accounting system.

# Built for people who keep more than one set of books
- Every organisation you can reach in Xero or Business Central sits in one menu; switch clients in a click.
- One sign-in: your work Microsoft account. Multi-factor authentication and conditional access come from your own Microsoft 365.
- Xero and Business Central clients appear side by side in the same list and the same layout.
- Xero's vocabulary: Draft, Awaiting approval, Awaiting payment, Paid; the same tabs, columns and totals as Xero.

# Xero and Business Central
Bookie reads each system through its official API and shows it in one familiar layout. Coming next: Microsoft Dynamics 365 Finance, and simple books kept in lists in your own SharePoint.

# Bookie the AI bookkeeper
- In the portal, by chat or voice: he sees the organisation you have open and answers from the live figures.
- On Teams calls, with his own Microsoft 365 account (the agent add-on): invite him to the month-end call and he joins, listens and answers when asked.
- Advice, not just numbers: why margin dropped, who to chase first, what is waiting to be reconciled. He explains and shows his working.
- He can be wrong. His answers are information, not professional accounting, tax or legal advice.

# The agent add-on and pricing
- The portal is free and open source: self-host it, or use the hosted portal on the Bookie website.
- Bookie the agent is a paid add-on, provided under a separate order with KnowAll AI. KnowAll AI installs him in the customer's own Azure subscription, so his account, memory and voice stay in their tenant; or KnowAll AI hosts him on request, with an isolated instance per customer.
- There is no published price for the add-on. For pricing or a demo, contact KnowAll AI at https://knowall.ai.

# Installing (for Microsoft 365 administrators): /install
- A Global Administrator, Cloud Application Administrator or Application Administrator gives admin consent once.
- Every permission is delegated (Bookie acts as the signed-in person, nothing more; no application permissions):
  - Microsoft Graph openid, profile, email, offline_access: sign in and stay signed in.
  - Microsoft Graph User.Read: your name, email and organisation.
  - Dynamics 365 Business Central Financials.ReadWrite.All (user_impersonation): open Business Central as you, only if you switch it on.
  - Microsoft Graph Sites.Manage.All: keep Bookie's sealed connection settings in a hidden list on your own SharePoint.
- Then anyone in the organisation signs in at /portal on the Bookie website and connects Xero or switches on Business Central.
- To limit who can use it: in Microsoft Entra, Enterprise applications, set Assignment required to Yes and assign users or groups. Conditional access applies.
- To remove it: delete Bookie from Enterprise applications and delete the hidden BookieConnections list on the root SharePoint site.

# Security and data handling: /security
- Bookie is stateless: every figure is read live from Xero or Business Central when you open the page, shown, and discarded. No ledger database, no nightly sync.
- Connection settings (which Xero organisations are connected and Xero's refresh token, whether Business Central is on) are sealed per tenant with authenticated encryption and stored in a hidden SharePoint list in your own Microsoft 365. They are unreadable without KnowAll AI's master key, which stays in Azure Key Vault.
- Tenant isolation: everything is tied to the Microsoft Entra tenant in your verified sign-in and re-checked on every request. Links cannot be edited to reach someone else's books.
- You act as you: delegated permissions; anything that changes the books asks you to confirm first.
- Xero data is never used to train or fine-tune AI models.
- Sign-in is Microsoft Entra ID. All traffic is HTTPS with HSTS. No third-party tracking or advertising cookies.
- Subprocessors: Microsoft Azure (hosting, Key Vault, Entra sign-in), your own Microsoft 365 (settings, Business Central), Xero (its official API), and OpenAI models via Azure OpenAI (only for Bookie the AI bookkeeper; not the public OpenAI service; prompts are not used to train models).
- Report a vulnerability privately through GitHub security advisories on the repository, not in a public issue.

# Privacy: /privacy
- KnowAll AI is controller of portal account data; for accounting data the customer's organisation is controller and KnowAll AI is processor.
- Processed: sign-in details, connection settings (in the customer's tenant), accounting data read live and discarded, conversations with the agent add-on (questions, answers, preferences; not ledger figures), technical logs (times, errors, IP addresses) kept up to 30 days.
- No selling of data, no advertising, no tracking cookies. Privacy requests: contact KnowAll AI through https://knowall.ai; replies within one month. Complaints may go to the ICO.

# Terms: /terms
- Hosted portal is provided as is unless agreed in writing; governed by the law of England and Wales. Self-hosting from source: the MIT licence applies instead.
- Customers remain responsible for their accounts, tax returns and filings, and should check anything before confirming it.

# Useful links on this site
- Get started / install: /install
- Sign in (existing customers): /portal
- Security: /security, Privacy: /privacy, Terms: /terms
- Source code: https://github.com/knowall-ai/bookie
- Contact KnowAll AI, pricing and demos: https://knowall.ai

# Frequently asked questions
${SITE_FAQ.map((f) => `Q: ${f.q}\nA: ${f.a}`).join('\n\n')}
`.trim();
