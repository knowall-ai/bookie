#!/usr/bin/env node
// mail-trust.mjs: the sender-authentication facts for one email, for bill-capture's "Is it genuine?" step.
//   node mail-trust.mjs --mailbox accounts@knowall.ai --messageId <id>
// Prints JSON: from / sender / reply-to / return-path domains and the SPF, DKIM, DMARC and
// composite-auth results Exchange Online recorded when the message arrived. Reads only; no body,
// no attachments. Uses Bookie's delegated Graph sign-in from Agent Presence.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const mailbox = arg('mailbox') ?? process.env.ACCOUNTS_MAILBOX;
const messageId = arg('messageId');
if (!mailbox || !messageId) {
  console.error('usage: mail-trust.mjs --mailbox <address> --messageId <id>');
  process.exit(2);
}

const presence = process.env.PRESENCE_DIR ?? path.join(process.env.HOME, 'presence');
const { createDelegatedClient } = await import(
  pathToFileURL(path.join(presence, 'scripts/lib/delegated-auth.mjs')).href
);
const client = await createDelegatedClient();
const m = await client
  .api(`/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}`)
  .select('from,sender,replyTo,internetMessageHeaders,receivedDateTime')
  .get();

const domain = (addr) => (addr ?? '').split('@')[1]?.toLowerCase() ?? null;
const headers = m.internetMessageHeaders ?? [];
const all = (name) =>
  headers.filter((h) => h.name.toLowerCase() === name.toLowerCase()).map((h) => h.value);
// Only Exchange Online's own verdicts count: senders can add their own Authentication-Results.
const authResults = all('Authentication-Results').filter((v) => /protection\.outlook\.com/i.test(v));
const auth = authResults.join('; ');
const pick = (re) => auth.match(re)?.[1]?.toLowerCase() ?? 'none';

const result = {
  received: m.receivedDateTime,
  from: m.from?.emailAddress?.address ?? null,
  fromDomain: domain(m.from?.emailAddress?.address),
  senderDomain: domain(m.sender?.emailAddress?.address),
  replyToDomains: [...new Set((m.replyTo ?? []).map((r) => domain(r.emailAddress?.address)))],
  returnPathDomain: domain(all('Return-Path')[0]?.replace(/[<>]/g, '')),
  spf: pick(/spf=(\w+)/i),
  dkim: pick(/dkim=(\w+)/i),
  dkimDomain: pick(/header\.d=([\w.-]+)/i),
  dmarc: pick(/dmarc=(\w+)/i),
  compositeAuth: pick(/compauth=(\w+)/i),
  exchangeVerdictPresent: authResults.length > 0,
};
result.replyToDiffers = result.replyToDomains.some((d) => d && d !== result.fromDomain);
result.authenticated =
  result.dmarc === 'pass' ||
  (result.compositeAuth === 'pass' && (result.dkim === 'pass' || result.spf === 'pass'));
console.log(JSON.stringify(result, null, 2));
