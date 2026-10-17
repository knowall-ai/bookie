import 'server-only';
import type { AuthContext } from '@/lib/auth/context';
import { getAuthContext } from '@/lib/auth/context';
import { getConnector } from '@/lib/connectors/registry';
import { isConnectorError, type AccountingConnector } from '@/lib/connectors/types';
import type { AttachmentFile } from '@/lib/domain/types';
import {
  canPreviewInline,
  isAttachmentEntity,
  normaliseContentType,
  safeFileName,
} from '@/lib/attachments';

/**
 * The authenticated attachment proxy behind `/api/orgs/[org]/attachments/...`.
 * Every request re-resolves the org through `getConnector` (which re-checks it
 * against the signed-in user's own orgs), and nothing is ever cached.
 */

export interface ProxyDeps {
  auth: () => Promise<AuthContext | null>;
  connector: (auth: AuthContext, orgKey: string) => Promise<AccountingConnector>;
}

const defaultDeps: ProxyDeps = { auth: getAuthContext, connector: getConnector };

const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache' };

function json(error: string, status: number) {
  return Response.json({ error }, { status, headers: NO_STORE });
}

/** Headers for serving third-party file bytes from our own origin, safely. */
export function fileHeaders(file: AttachmentFile, download: boolean): Record<string, string> {
  const type = normaliseContentType(file.contentType);
  // Only PDFs and common images render inline; anything else (HTML, SVG...) downloads.
  const inline = !download && canPreviewInline(type);
  const name = safeFileName(file.fileName);
  return {
    'Content-Type': inline && type ? type : 'application/octet-stream',
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${name}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    'Content-Length': String(file.bytes.byteLength),
    'X-Content-Type-Options': 'nosniff',
    // Previews load in an iframe on our own pages only.
    'X-Frame-Options': 'SAMEORIGIN',
    'Content-Security-Policy': "frame-ancestors 'self'",
    ...NO_STORE,
  };
}

async function serve(
  orgParam: string,
  download: boolean,
  load: (connector: AccountingConnector) => Promise<AttachmentFile | undefined>,
  deps: ProxyDeps
): Promise<Response> {
  const auth = await deps.auth();
  if (!auth) return json('Sign in required.', 401);
  try {
    const connector = await deps.connector(auth, decodeURIComponent(orgParam));
    const file = await load(connector);
    if (!file) return json('Not available for this organisation.', 404);
    return new Response(file.bytes, { headers: fileHeaders(file, download) });
  } catch (error) {
    if (isConnectorError(error)) {
      // Foreign or unknown orgs and documents all look the same: not found.
      const status = error.status === 403 || error.status === 404 ? 404 : error.status;
      return json(status === 404 ? 'Not found.' : error.message, status >= 400 ? status : 502);
    }
    console.error('[bookie] attachment proxy failed', error);
    return json('Could not load the file.', 500);
  }
}

export function attachmentResponse(
  params: { org: string; entity: string; id: string; attachmentId: string; download: boolean },
  deps: ProxyDeps = defaultDeps
): Promise<Response> {
  const { entity } = params;
  return serve(
    params.org,
    params.download,
    async (connector) => {
      const mod = connector.attachments;
      if (!isAttachmentEntity(entity) || !mod?.entities.includes(entity)) return undefined;
      return mod.download(
        entity,
        decodeURIComponent(params.id),
        decodeURIComponent(params.attachmentId)
      );
    },
    deps
  );
}

export function inboxFileResponse(
  params: { org: string; fileId: string; download: boolean },
  deps: ProxyDeps = defaultDeps
): Promise<Response> {
  return serve(
    params.org,
    params.download,
    async (connector) => connector.capture?.inboxFile(decodeURIComponent(params.fileId)),
    deps
  );
}
