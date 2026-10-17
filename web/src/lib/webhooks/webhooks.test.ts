import { afterEach, describe, expect, it } from 'vitest';
import type { OrgRef } from '@/lib/domain/types';
import {
  BUFFER_SIZE,
  BUFFER_TTL_MS,
  bcSourceKey,
  publish,
  recent,
  resetLiveEvents,
  sourceKeyForOrg,
  subscribe,
  xeroSourceKey,
  type LiveEvent,
} from './events';
import { handleXeroWebhook, parseXeroEvents, verifyXeroSignature, xeroSignature } from './xero';
import {
  handleBcWebhook,
  parseBcNotifications,
  parseBcResource,
  signClientState,
  verifyClientState,
} from './bc';
import { webhookConfig } from './config';

/* Fictional webhook key and ids. Signatures were computed independently (Python hmac / openssl). */
const KEY =
  'Ux1wrnPjXHz6dEnHvzbbAo8tR3gAmJ9uMoEmmNwn0B3GmO8KUh6jXg3LDIWxRRL5ZxqYwrKVvTwbXLnBgqGWwA==';
const INTENT =
  '{"events":[],"firstEventSequence":0,"lastEventSequence":0,"entropy":"OCWFRCCBYGVYRJAMWHZB"}';
const INTENT_SIG = '3h3pG/XL8kfUF60tvGLvCRWbBMJVgKbvb2hYGdDyA3U=';
const XERO_TENANT = '11111111-2222-4333-8444-555555555555';
const INVOICE_ID = '0f5a1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b';
const EVENT_BODY = `{"events":[{"resourceUrl":"https://api.xero.com/api.xro/2.0/Invoices/${INVOICE_ID}","resourceId":"${INVOICE_ID}","eventDateUtc":"2026-10-17T09:30:00.000","eventType":"UPDATE","eventCategory":"INVOICE","tenantId":"${XERO_TENANT}","tenantType":"ORGANISATION"}],"firstEventSequence":1,"lastEventSequence":1,"entropy":"ABCDEFGHIJKLMNOPQRST"}`;
const EVENT_SIG = 'mvkyNN90KWP8Ocll/LYQIeMgroCtpzM7qb8bnYAfTTA=';

const xeroRequest = (body: string, signature?: string) =>
  new Request('https://bookie.example.com/api/webhooks/xero', {
    method: 'POST',
    headers: signature ? { 'x-xero-signature': signature } : {},
    body,
  });

afterEach(() => resetLiveEvents());

describe('Xero signature', () => {
  it('matches known HMAC-SHA256 base64 vectors', () => {
    expect(xeroSignature('hello', 'key')).toBe('kwezuRXvtRcf8U2MtV+8x5jGwO8UVtZt7RpqpyOli3s=');
    expect(xeroSignature(INTENT, KEY)).toBe(INTENT_SIG);
    expect(xeroSignature(EVENT_BODY, KEY)).toBe(EVENT_SIG);
  });

  it('accepts only the exact signature for the exact body and key', () => {
    expect(verifyXeroSignature(INTENT, INTENT_SIG, KEY)).toBe(true);
    expect(verifyXeroSignature(`${INTENT} `, INTENT_SIG, KEY)).toBe(false);
    expect(verifyXeroSignature(INTENT, INTENT_SIG, `${KEY}x`)).toBe(false);
    expect(verifyXeroSignature(INTENT, 'AAAA', KEY)).toBe(false);
    expect(verifyXeroSignature(INTENT, null, KEY)).toBe(false);
    expect(verifyXeroSignature(INTENT, INTENT_SIG, undefined)).toBe(false);
  });
});

describe('Xero intent to receive', () => {
  it('answers 200 with an empty body for a correct signature', async () => {
    const response = await handleXeroWebhook(xeroRequest(INTENT, INTENT_SIG), KEY);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });

  it('answers 401 for a wrong or missing signature, or when no key is configured', async () => {
    expect((await handleXeroWebhook(xeroRequest(INTENT, EVENT_SIG), KEY)).status).toBe(401);
    expect((await handleXeroWebhook(xeroRequest(INTENT), KEY)).status).toBe(401);
    expect((await handleXeroWebhook(xeroRequest(INTENT, INTENT_SIG), undefined)).status).toBe(401);
  });

  it('dispatches nothing for a badly signed payload', async () => {
    const seen: LiveEvent[] = [];
    await handleXeroWebhook(xeroRequest(EVENT_BODY, INTENT_SIG), KEY, (e) => seen.push(e));
    expect(seen).toEqual([]);
  });
});

describe('Xero events', () => {
  it('reduces a signed delivery to ids and files it under the Xero tenant', async () => {
    const response = await handleXeroWebhook(xeroRequest(EVENT_BODY, EVENT_SIG), KEY);
    expect(response.status).toBe(200);
    expect(
      recent(xeroSourceKey(XERO_TENANT), undefined, Date.parse('2026-10-17T09:31:00Z'))
    ).toEqual([
      {
        key: `xero:${XERO_TENANT}`,
        entity: 'invoice',
        id: INVOICE_ID,
        event: 'update',
        at: '2026-10-17T09:30:00.000Z',
      },
    ]);
  });

  it('keeps INVOICE/CONTACT CREATE/UPDATE only, with valid GUIDs', () => {
    const events = parseXeroEvents({
      events: [
        {
          eventCategory: 'CONTACT',
          eventType: 'CREATE',
          tenantId: XERO_TENANT,
          resourceId: INVOICE_ID,
        },
        {
          eventCategory: 'SUBSCRIPTION',
          eventType: 'UPDATE',
          tenantId: XERO_TENANT,
          resourceId: INVOICE_ID,
        },
        {
          eventCategory: 'INVOICE',
          eventType: 'DELETE',
          tenantId: XERO_TENANT,
          resourceId: INVOICE_ID,
        },
        {
          eventCategory: 'INVOICE',
          eventType: 'UPDATE',
          tenantId: 'not-a-guid',
          resourceId: INVOICE_ID,
        },
        {
          eventCategory: 'INVOICE',
          eventType: 'UPDATE',
          tenantId: XERO_TENANT,
          resourceId: '../x',
        },
      ],
    });
    expect(events.map((e) => [e.entity, e.event])).toEqual([['contact', 'create']]);
  });
});

/* Business Central */

const SECRET = 'test-secret-for-bookie-webhooks';
const ENTRA_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const ENTRA_B = 'bbbbbbbb-2222-4222-8222-222222222222';
const COMPANY = 'c0c0c0c0-3333-4333-8333-333333333333';
const RECORD = 'd1d1d1d1-4444-4444-8444-444444444444';

const bcRequest = (url: string, init?: RequestInit) =>
  new Request(`https://bookie.example.com/api/webhooks/bc${url}`, init);

describe('BC validation handshake', () => {
  it('echoes validationToken as plain text with 200 (POST and GET)', async () => {
    const post = await handleBcWebhook(
      bcRequest('?validationToken=abc-123', { method: 'POST' }),
      SECRET
    );
    expect(post.status).toBe(200);
    expect(post.headers.get('content-type')).toMatch(/^text\/plain/);
    expect(post.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await post.text()).toBe('abc-123');
    const get = await handleBcWebhook(bcRequest('?validationToken=xyz'), SECRET);
    expect(await get.text()).toBe('xyz');
  });

  it('refuses the handshake when live updates are not configured', async () => {
    const response = await handleBcWebhook(bcRequest('?validationToken=abc'), undefined);
    expect(response.status).toBe(503);
  });
});

describe('BC clientState', () => {
  it('round-trips tenant and environment, and rejects tampering', () => {
    const state = signClientState(ENTRA_A, 'Sandbox', SECRET);
    expect(state.length).toBeLessThan(2048);
    expect(verifyClientState(state, SECRET)).toEqual({ tenantId: ENTRA_A, environment: 'Sandbox' });
    expect(verifyClientState(state, 'other-secret')).toBeUndefined();
    const forged = state.replace(ENTRA_A, ENTRA_B);
    expect(verifyClientState(forged, SECRET)).toBeUndefined();
    expect(verifyClientState(undefined, SECRET)).toBeUndefined();
    expect(verifyClientState('someClientState', SECRET)).toBeUndefined();
  });
});

describe('BC notifications', () => {
  const notification = (changeType: string, resource: string, tenant = ENTRA_A) => ({
    subscriptionId: 'sub-1',
    clientState: signClientState(tenant, 'Production', SECRET),
    expirationDateTime: '2026-10-20T07:52:31Z',
    resource,
    changeType,
    lastModifiedDateTime: '2026-10-17T12:54:20.467Z',
  });

  it('parses resource paths', () => {
    expect(parseBcResource(`api/v2.0/companies(${COMPANY})/purchaseInvoices(${RECORD})`)).toEqual({
      companyId: COMPANY,
      resource: 'purchaseInvoices',
      id: RECORD,
    });
    expect(parseBcResource(`/api/v2.0/companies(${COMPANY})/items(${RECORD})`)).toBeUndefined();
  });

  it('maps created/updated/deleted/collection under the signing tenant', () => {
    const events = parseBcNotifications(
      {
        value: [
          notification('updated', `api/v2.0/companies(${COMPANY})/salesInvoices(${RECORD})`),
          notification('created', `api/v2.0/companies(${COMPANY})/customers(${RECORD})`),
          notification(
            'collection',
            `/api/v2.0/companies(${COMPANY})/purchaseInvoices?$filter=lastDateTimeModified%20gt%202026-10-17T11:00:00Z`
          ),
          {
            ...notification('updated', `api/v2.0/companies(${COMPANY})/salesInvoices(${RECORD})`),
            clientState: 'forged',
          },
        ],
      },
      SECRET
    );
    const key = bcSourceKey(ENTRA_A, 'Production', COMPANY);
    expect(events).toEqual([
      {
        key,
        entity: 'invoice',
        invoiceType: 'sales',
        id: RECORD,
        event: 'update',
        at: '2026-10-17T12:54:20.467Z',
      },
      {
        key,
        entity: 'contact',
        invoiceType: undefined,
        id: `c:${RECORD}`,
        event: 'create',
        at: '2026-10-17T12:54:20.467Z',
      },
      {
        key,
        entity: 'invoice',
        invoiceType: 'purchase',
        id: undefined,
        event: 'collection',
        at: '2026-10-17T12:54:20.467Z',
      },
    ]);
  });

  it('acknowledges with 202 even when nothing can be attributed (BC drops subscriptions on 4xx)', async () => {
    const seen: LiveEvent[] = [];
    const response = await handleBcWebhook(
      bcRequest('', { method: 'POST', body: '﻿{"value":[{"clientState":"nope"}]}' }),
      SECRET,
      (e) => seen.push(e)
    );
    expect(response.status).toBe(202);
    expect(seen).toEqual([]);
  });
});

describe('Event buffer tenant isolation', () => {
  const org = (key: string, kind: OrgRef['kind']): OrgRef => ({
    key,
    kind,
    name: 'Contoso',
    sourceLabel: '',
  });

  it('derives keys from the org and the signed-in tenant, never request input', () => {
    const bc = org(`bc.Production.${COMPANY}`, 'business-central');
    expect(sourceKeyForOrg(bc, ENTRA_A)).toBe(bcSourceKey(ENTRA_A, 'Production', COMPANY));
    expect(sourceKeyForOrg(bc, ENTRA_B)).not.toBe(sourceKeyForOrg(bc, ENTRA_A));
    expect(sourceKeyForOrg(org(`xero.conn-1.${XERO_TENANT}`, 'xero'), ENTRA_A)).toBe(
      xeroSourceKey(XERO_TENANT)
    );
    expect(sourceKeyForOrg(org('demo.contoso', 'demo'), ENTRA_A)).toBe('demo:demo.contoso');
  });

  it("never shows one tenant's BC events to another tenant with the same company id", async () => {
    await handleBcWebhook(
      bcRequest('', {
        method: 'POST',
        body: JSON.stringify({
          value: [
            {
              clientState: signClientState(ENTRA_A, 'Production', SECRET),
              resource: `api/v2.0/companies(${COMPANY})/salesInvoices(${RECORD})`,
              changeType: 'updated',
              lastModifiedDateTime: new Date().toISOString(),
            },
          ],
        }),
      }),
      SECRET
    );
    const bc = org(`bc.Production.${COMPANY}`, 'business-central');
    expect(recent(sourceKeyForOrg(bc, ENTRA_A)!)).toHaveLength(1);
    expect(recent(sourceKeyForOrg(bc, ENTRA_B)!)).toHaveLength(0);
  });

  it('notifies only listeners of the same key', () => {
    const a: LiveEvent[] = [];
    const b: LiveEvent[] = [];
    const stopA = subscribe('xero:a', (e) => a.push(e));
    subscribe('xero:b', (e) => b.push(e));
    publish({
      key: 'xero:a',
      entity: 'invoice',
      id: '1',
      event: 'update',
      at: new Date().toISOString(),
    });
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(0);
    stopA();
    publish({
      key: 'xero:a',
      entity: 'invoice',
      id: '2',
      event: 'update',
      at: new Date().toISOString(),
    });
    expect(a).toHaveLength(1);
  });

  it('is a short-lived ring buffer: newest first, capped, expired after the TTL', () => {
    const now = Date.parse('2026-10-17T12:00:00Z');
    for (let i = 0; i < BUFFER_SIZE + 5; i++) {
      publish(
        {
          key: 'xero:t',
          entity: 'invoice',
          id: String(i),
          event: 'update',
          at: new Date(now + i).toISOString(),
        },
        now + i
      );
    }
    const events = recent('xero:t', undefined, now + 100);
    expect(events).toHaveLength(BUFFER_SIZE);
    expect(events[0].id).toBe(String(BUFFER_SIZE + 4));
    expect(recent('xero:t', undefined, now + BUFFER_TTL_MS + 1000)).toHaveLength(0);
    expect(recent('xero:t', new Date(now + BUFFER_SIZE + 2).toISOString(), now + 100)).toHaveLength(
      2
    );
  });
});

describe('webhook config', () => {
  it('builds the BC notification URL only for a public HTTPS address', () => {
    expect(webhookConfig({ BOOKIE_PUBLIC_URL: 'https://getbook.ie/' }).bcNotificationUrl).toBe(
      'https://getbook.ie/api/webhooks/bc'
    );
    expect(
      webhookConfig({ NEXTAUTH_URL: 'http://localhost:3103' }).bcNotificationUrl
    ).toBeUndefined();
    expect(
      webhookConfig({ BOOKIE_PUBLIC_URL: 'https://localhost' }).bcNotificationUrl
    ).toBeUndefined();
    expect(webhookConfig({ BOOKIE_LIVE_FEED: 'OFF' }).liveFeedOff).toBe(true);
  });
});
