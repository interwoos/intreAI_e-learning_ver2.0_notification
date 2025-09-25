// 冪等性管理ユーティリティ
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * 安定化JSON文字列化（キーソート）
 */
export function stableStringify(obj: any): string {
  if (obj === null || obj === undefined) return '';
  if (typeof obj !== 'object') return String(obj);
  
  const sorted: any = {};
  Object.keys(obj).sort().forEach(key => {
    sorted[key] = obj[key];
  });
  
  return JSON.stringify(sorted);
}

/**
 * 冪等キー生成
 */
export function generateIdempotencyKey(
  templateKey: string, 
  toEmail: string, 
  metadata: any = {}
): string {
  const metadataStr = stableStringify(metadata);
  const hash = crypto.createHash('sha256')
    .update(`${templateKey}|${toEmail}|${metadataStr}`)
    .digest('hex');
  return hash.substring(0, 16); // 16文字に短縮
}

/**
 * 冪等性チェック（重複送信防止）
 */
export async function checkIdempotency(
  templateKey: string,
  toEmail: string,
  metadata: any = {}
): Promise<{ isDuplicate: boolean; existingId?: string }> {
  try {
    // 同一条件の pending/processing/sent が存在するかチェック
    const { data: existing, error } = await supabaseAdmin
      .from('email_queue')
      .select('id, status, created_at')
      .eq('template_key', templateKey)
      .eq('to_email', toEmail)
      .in('status', ['pending', 'processing', 'sent'])
      .contains('metadata', metadata) // jsonb @> operator
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('❌ 冪等性チェックエラー:', error);
      return { isDuplicate: false };
    }

    if (existing && existing.length > 0) {
      console.log('🔄 重複送信をスキップ:', {
        templateKey,
        toEmail: toEmail.substring(0, 10) + '...',
        existingStatus: existing[0].status,
        existingId: existing[0].id
      });
      return { 
        isDuplicate: true, 
        existingId: existing[0].id 
      };
    }

    return { isDuplicate: false };
  } catch (error) {
    console.error('❌ 冪等性チェック例外:', error);
    return { isDuplicate: false };
  }
}

/**
 * 冪等性を考慮したメールキュー投入
 */
export async function enqueueEmailWithIdempotency({
  templateKey,
  toEmail,
  subject,
  body,
  metadata = {}
}: {
  templateKey: string;
  toEmail: string;
  subject: string;
  body: string;
  metadata?: any;
}): Promise<{ success: boolean; queueId?: string; skipped?: boolean }> {
  try {
    // 冪等性チェック
    const { isDuplicate, existingId } = await checkIdempotency(templateKey, toEmail, metadata);
    
    if (isDuplicate) {
      return { 
        success: true, 
        skipped: true, 
        queueId: existingId 
      };
    }

    // キューに投入
    const { data, error } = await supabaseAdmin
      .from('email_queue')
      .insert({
        to_email: toEmail,
        subject,
        body,
        template_key: templateKey,
        status: 'pending',
        metadata
      })
      .select('id')
      .single();

    if (error) {
      console.error('❌ メールキュー投入エラー:', error);
      return { success: false };
    }

    console.log('✅ メールキュー投入成功:', {
      templateKey,
      toEmail: toEmail.substring(0, 10) + '...',
      queueId: data.id
    });

    return { 
      success: true, 
      queueId: data.id 
    };
  } catch (error) {
    console.error('❌ メールキュー投入例外:', error);
    return { success: false };
  }
}

/**
 * 失敗メールの再送準備
 */
export async function retryFailedEmails(
  ids?: string[],
  templateKey?: string
): Promise<{ success: boolean; retryCount: number }> {
  try {
    let query = supabaseAdmin
      .from('email_queue')
      .update({ 
        status: 'pending',
        picked_at: null,
        error_message: null
      })
      .eq('status', 'failed');

    if (ids && ids.length > 0) {
      query = query.in('id', ids);
    } else if (templateKey) {
      query = query.eq('template_key', templateKey);
    } else {
      // 1時間以上前の失敗のみ再送対象
      query = query.lt('failed_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());
    }

    const { data, error } = await query.select('id');

    if (error) {
      console.error('❌ 失敗メール再送準備エラー:', error);
      return { success: false, retryCount: 0 };
    }

    const retryCount = data?.length || 0;
    console.log('✅ 失敗メール再送準備完了:', retryCount, '件');

    return { success: true, retryCount };
  } catch (error) {
    console.error('❌ 失敗メール再送準備例外:', error);
    return { success: false, retryCount: 0 };
  }
}