#!/usr/bin/env node
// accounts-subscription.mjs: a Microsoft Graph change-notification subscription on the shared
// accounts mailbox's Inbox (ACCOUNTS_MAILBOX), so a supplier invoice wakes Bookie within seconds.
// Optional (ACCOUNTS_MAILBOX_WAKE=webhook): the poll gate (accounts-inbox-gate.sh) is the
// default wake and keeps working without this.
//
// Signs in exactly like Presence's manage.js: Bookie's own DELEGATED token from the MSAL cache
// that `node ~/presence/scripts/graph.mjs login` wrote, via Presence's scripts/lib/delegated-auth.mjs.
// Delegated access to accounts@ comes from the FullAccess grant (deploy/10) plus the
// Mail.ReadWrite.Shared scope on Bookie's Graph app. No client secret is used.
//
// VERIFY on first install: (1) Graph accepts a delegated subscription on a shared mailbox's
// messages (if it answers 403, use the poll gate, or deploy/10 option B with an app-only
// subscription); (2) the Presence Graph adapter turns a notification for this resource into a
// wake. The notification carries CLIENT_STATE and goes to WEBHOOK_URL like Bookie's own.
//
// Usage: node accounts-subscription.mjs create|renew|list|delete
// Env:   ACCOUNTS_MAILBOX, WEBHOOK_URL, CLIENT_STATE (graph-subscriptions.env), PRESENCE_DIR
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { homedir } from 'node:os';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const MAILBOX = process.env.ACCOUNTS_MAILBOX;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const CLIENT_STATE = process.env.CLIENT_STATE;
const PRESENCE_DIR = process.env.PRESENCE_DIR || join(homedir(), 'presence');
const EXPIRY_MIN = 4200; // Graph's ceiling for mail is 4230 minutes
const SCOPES = ['https://graph.microsoft.com/Mail.ReadWrite.Shared'];

function fail(msg) {
  console.error(`[accounts-subscription] ${msg}`);
  process.exit(1);
}

for (const [k, v] of Object.entries({ ACCOUNTS_MAILBOX: MAILBOX, WEBHOOK_URL, CLIENT_STATE })) {
  if (!v) fail(`${k} is not set`);
}

const resource = `/users/${MAILBOX}/mailFolders('Inbox')/messages`;
const expiry = () => new Date(Date.now() + EXPIRY_MIN * 60_000).toISOString();

async function token() {
  const lib = await import(pathToFileURL(join(PRESENCE_DIR, 'scripts/lib/delegated-auth.mjs')).href);
  return lib.acquireDelegatedToken({ scopes: SCOPES });
}

async function graph(method, path, body) {
  const res = await fetch(`${GRAPH}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

// Ours = same resource (case-insensitive) and same notification URL.
async function mine() {
  const all = (await graph('GET', '/subscriptions'))?.value ?? [];
  return all.filter(
    (s) => s.resource?.toLowerCase() === resource.toLowerCase().replace(/^\//, '') ||
           s.resource?.toLowerCase() === resource.toLowerCase(),
  ).filter((s) => s.notificationUrl === WEBHOOK_URL);
}

async function create() {
  const live = (await mine()).filter((s) => new Date(s.expirationDateTime) > new Date());
  if (live.length) {
    console.log(`exists: ${live[0].id} until ${live[0].expirationDateTime}`);
    return;
  }
  const s = await graph('POST', '/subscriptions', {
    changeType: 'created',
    notificationUrl: WEBHOOK_URL,
    resource,
    expirationDateTime: expiry(),
    clientState: CLIENT_STATE,
  });
  console.log(`created: ${s.id} until ${s.expirationDateTime}`);
}

async function renew() {
  const subs = await mine();
  if (!subs.length) return create();
  for (const s of subs) {
    try {
      const r = await graph('PATCH', `/subscriptions/${s.id}`, { expirationDateTime: expiry() });
      console.log(`renewed: ${s.id} until ${r.expirationDateTime}`);
    } catch (e) {
      console.error(`renew of ${s.id} failed (${e.message}); recreating`);
      await graph('DELETE', `/subscriptions/${s.id}`).catch(() => {});
      await create();
    }
  }
}

async function list() {
  for (const s of await mine()) console.log(`${s.id}  ${s.changeType}  until ${s.expirationDateTime}`);
}

async function remove() {
  for (const s of await mine()) {
    await graph('DELETE', `/subscriptions/${s.id}`);
    console.log(`deleted: ${s.id}`);
  }
}

const commands = { create, renew, list, delete: remove };
const cmd = process.argv[2];
if (!commands[cmd]) fail('usage: accounts-subscription.mjs create|renew|list|delete');
commands[cmd]().catch((e) => fail(e.message));
