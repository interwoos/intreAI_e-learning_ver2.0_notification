// lib/supabaseAdmin.ts
import 'server-only';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/** 環境変数はこの3つを前提：
 *  - NEXT_PUBLIC_SUPABASE_URL
 *  - NEXT_PUBLIC_SUPABASE_ANON_KEY  (※ここでは未使用)
 *  - SUPABASE_SERVICE_ROLE_KEY
 */

function createAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error('[supabaseAdmin] Missing env:', {
      NEXT_PUBLIC_SUPABASE_URL_present: Boolean(url),
      SUPABASE_SERVICE_ROLE_KEY_present: Boolean(serviceKey),
    });
    throw new Error('Supabase admin env missing');
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

/** 推奨：必要な時に呼ぶ（将来的にEdge等でも安全） */
export function getSupabaseAdmin(): SupabaseClient {
  // 必要ならシングルトン化してもOK
  return createAdmin();
}

/** 互換用：既存コードの `import { supabaseAdmin }` を壊さない */
export const supabaseAdmin: SupabaseClient = createAdmin();
