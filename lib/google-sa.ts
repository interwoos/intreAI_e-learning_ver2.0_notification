// lib/google-sa.ts
import 'server-only';

/** 必須環境変数
 *  - GOOGLE_SERVICE_ACCOUNT_KEY  … SA鍵の RAW JSON（そのまま貼り付け）
 * 任意
 *  - GOOGLE_DELEGATED_USER       … DWDする時のみ (Workspaceでの委任: sub に入る)
 */

type SAKey = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

const DEFAULT_SCOPE = 'https://www.googleapis.com/auth/drive.file';

function normalizePrivateKey(pk: string): string {
  // .env に \n が文字列で入っている場合に実改行へ
  if (pk.includes('\\n') && !pk.includes('\n')) {
    return pk.replace(/\\n/g, '\n');
  }
  return pk;
}

function loadSAKey(): SAKey {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error('[google-sa] Missing env: GOOGLE_SERVICE_ACCOUNT_KEY');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    // JSONそのものが .env に書かれていない（PEMだけ等）の誤設定時
    // もしくはクォート崩れ
    throw new Error('[google-sa] GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON');
  }

  if (!parsed?.client_email || !parsed?.private_key) {
    throw new Error('[google-sa] SA JSON must contain client_email and private_key');
  }

  return {
    client_email: parsed.client_email as string,
    private_key: normalizePrivateKey(parsed.private_key as string),
    token_uri: (parsed.token_uri as string) || 'https://oauth2.googleapis.com/token',
  };
}

export function extractFolderId(folderLink: string): string | null {
  const m = folderLink.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

export async function getAccessTokenFromSA(
  scope: string | string[] = DEFAULT_SCOPE
): Promise<string | null> {
  const key = loadSAKey();
  const scopes = Array.isArray(scope) ? scope.join(' ') : scope;

  const aud = 'https://oauth2.googleapis.com/token';
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'RS256', typ: 'JWT' };
  const claims: Record<string, any> = {
    iss: key.client_email,
    scope: scopes,
    aud,
    exp: now + 3600,
    iat: now,
  };

  const delegated = process.env.GOOGLE_DELEGATED_USER;
  if (delegated) claims.sub = delegated;

  const b64u = (obj: any) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned = `${b64u(header)}.${b64u(claims)}`;

  const crypto = await import('node:crypto');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(unsigned);
  const signature = sign.sign(key.private_key).toString('base64url');
  const assertion = `${unsigned}.${signature}`;

  const resp = await fetch(key.token_uri ?? aud, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    console.error('[google-sa] token error', resp.status, text);
    return null;
  }

  const json = await resp.json().catch(() => null);
  return json?.access_token ?? null;
}
