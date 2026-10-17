# Security policy

Bookie reads and writes companies' accounts in Xero and Business Central, so we take reports seriously.

## Reporting a vulnerability

Email **support@knowall.ai** with "Bookie security" in the subject, plus the details and steps to reproduce. Please don't open a public issue.

We'll acknowledge your report within 3 working days, keep you updated, and credit you when the fix ships (unless you'd rather we didn't).

## Supported versions

Bookie is pre-release. Only the latest `main` gets security fixes.

## Scope

In scope: the web portal and its API routes, the connectors, the Bookie agent configuration and deployment scripts, and the infrastructure templates in this repository.

We're especially interested in:

- any way for one organisation (Microsoft 365 tenant) to see or change another's data, connections or settings;
- reading or forging the sealed connection settings stored in a tenant's SharePoint;
- getting Bookie (chat, voice or the Teams agent) to reveal data the signed-in person can't see, or to write to the books without the person's confirmation;
- bypassing sign-in, or abusing the Xero OAuth or Microsoft admin consent flows.

Out of scope: vulnerabilities in Xero, Business Central, Microsoft 365 or Azure themselves (please report those to the vendor), and denial of service.
