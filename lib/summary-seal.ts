/**
 * 要約管理システム セキュリティ仕様書
 * HMAC署名トークン方式による要約データの封印・検証
 */

import { createHmac } from 'crypto';

// 署名付き要約データの型定義
export interface SealedSummary {
  v: 1; // バージョン
  uid: string; // ユーザーID
  taskId: string; // タスクID
  summary: string; // 要約本文
  ts: number; // タイムスタンプ
}

// 設定
const TOKEN_PREFIX = 'SS1'; // トークンプレフィックス

/**
 * Base64URL エンコード（URLセーフ）
 */
function base64urlEncode(data: string | Buffer): string {
  const base64 = Buffer.from(data).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Base64URL デコード
 */
function base64urlDecode(encoded: string): Buffer | null {
  try {
    // URLセーフ文字を標準Base64に戻す
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    // パディング追加
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
    return Buffer.from(padded, 'base64');
  } catch {
    return null;
  }
}

/**
 * HMAC-SHA256 署名生成（統一版：直接base64url）
 */
function generateHmac(secret: string, payload: string): string {
  const hmac = createHmac('sha256', secret).update(payload).digest();
  return base64urlEncode(hmac);
}

/**
 * 要約データを署名付きトークンに封印
 */
export function sealSummary(
  secret: string,
  data: { uid: string; taskId: string; summary: string }
): string {
  if (!secret) {
    throw new Error('SUMMARY_SECRET is required');
  }

  // 入力検証
  if (!data.uid || !data.taskId) {
    throw new Error('uid and taskId are required');
  }

  // ペイロード構築
  const payload: SealedSummary = {
    v: 1,
    uid: data.uid,
    taskId: data.taskId,
    summary: data.summary,
    ts: Date.now()
  };

  // JSON → Base64URL
  const payloadJson = JSON.stringify(payload);
  const payloadEncoded = base64urlEncode(payloadJson);

  // HMAC署名生成（統一：直接base64url）
  const signatureEncoded = generateHmac(secret, payloadEncoded);

  // トークン組み立て
  return `${TOKEN_PREFIX}.${payloadEncoded}.${signatureEncoded}`;
}

/**
 * 署名付きトークンを検証・復号
 */
export function unsealSummary(
  secret: string,
  token: string
): SealedSummary | null {
  if (!secret || !token) {
    return null;
  }

  try {
    // トークン形式チェック
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) {
      return null;
    }

    const [prefix, payloadEncoded, signatureEncoded] = parts;

    // 署名検証（統一：直接base64url）
    const expectedSignatureEncoded = generateHmac(secret, payloadEncoded);

    if (signatureEncoded !== expectedSignatureEncoded) {
      // 署名不一致（改ざん検出）
      return null;
    }

    // ペイロード復号
    const payloadBuffer = base64urlDecode(payloadEncoded);
    if (!payloadBuffer) {
      return null;
    }

    const payloadJson = payloadBuffer.toString('utf8');
    const payload = JSON.parse(payloadJson) as SealedSummary;

    // 型・必須項目チェック
    if (
      payload.v !== 1 ||
      typeof payload.uid !== 'string' ||
      typeof payload.taskId !== 'string' ||
      typeof payload.summary !== 'string' ||
      typeof payload.ts !== 'number'
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * タスクID形式検証
 */
export function isValidTaskId(taskId: string): boolean {
  // 英数字、ピリオド、ハイフン、アンダースコア、コロンのみ許可（1-64文字）
  const pattern = /^[A-Za-z0-9._:-]{1,64}$/;
  return pattern.test(taskId);
}

/**
 * デバッグ用：トークン詳細情報取得
 */
export function debugToken(secret: string, token: string): any {
  if (!secret || !token) {
    return { error: 'Missing secret or token' };
  }

  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { error: 'Invalid token format', parts: parts.length };
    }

    const [prefix, payloadEncoded, signatureEncoded] = parts;
    
    if (prefix !== TOKEN_PREFIX) {
      return { error: 'Invalid prefix', expected: TOKEN_PREFIX, actual: prefix };
    }

    // ペイロード復号を試行
    const payloadBuffer = base64urlDecode(payloadEncoded);
    if (!payloadBuffer) {
      return { error: 'Payload decode failed' };
    }

    let payload;
    try {
      payload = JSON.parse(payloadBuffer.toString('utf8'));
    } catch (jsonError) {
      return { error: 'JSON parse failed', jsonError: jsonError.message };
    }

    // 署名検証
    const expectedSignature = generateHmac(secret, payloadEncoded);
    const signatureMatch = signatureEncoded === expectedSignature;

    return {
      valid: signatureMatch,
      payload,
      signatureMatch,
      expectedSignature: expectedSignature.slice(0, 16) + '...',
      actualSignature: signatureEncoded.slice(0, 16) + '...'
    };
  } catch (error) {
    return { error: 'Debug failed', details: error.message };
  }
}