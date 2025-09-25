// 通知システムのユーティリティ関数
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export interface NotificationEvent {
  type: 'announcement' | 'deadline_reminder' | 'task_submitted' | 'task_cancelled' | 'first_login' | 'overdue_report';
  data: Record<string, any>;
}

/**
 * メール送信キューにメールを追加
 */
export async function queueEmail(
  templateKey: string,
  toEmail: string,
  variables: Record<string, any> = {}
): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin
      .rpc('queue_email', {
        template_key_param: templateKey,
        to_email_param: toEmail,
        variables: variables
      });

    if (error) {
      console.error('❌ メールキュー追加エラー:', error);
      return null;
    }

    console.log('✅ メールキュー追加成功:', data);
    return data;
  } catch (error) {
    console.error('❌ メールキュー追加例外:', error);
    return null;
  }
}

/**
 * 送信待ちメールを処理
 */
export async function processPendingEmails(): Promise<{ sent: number; failed: number }> {
  try {
    const response = await fetch('/api/notifications/send-emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    const result = await response.json();
    
    if (result.success) {
      return { sent: result.sent, failed: result.failed };
    } else {
      console.error('❌ メール送信処理エラー:', result.error);
      return { sent: 0, failed: 0 };
    }
  } catch (error) {
    console.error('❌ メール送信処理例外:', error);
    return { sent: 0, failed: 0 };
  }
}

/**
 * 締切リマインドを送信
 */
export async function sendDeadlineReminders(daysBefore: number = 3): Promise<number> {
  try {
    const response = await fetch('/api/notifications/deadline-reminders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ days_before: daysBefore })
    });

    const result = await response.json();
    
    if (result.success) {
      return result.sent;
    } else {
      console.error('❌ 締切リマインド送信エラー:', result.error);
      return 0;
    }
  } catch (error) {
    console.error('❌ 締切リマインド送信例外:', error);
    return 0;
  }
}

/**
 * 未提出一覧レポートを送信
 */
export async function sendOverdueReport(): Promise<number> {
  try {
    const response = await fetch('/api/notifications/overdue-report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    const result = await response.json();
    
    if (result.success) {
      return result.sent;
    } else {
      console.error('❌ 未提出一覧送信エラー:', result.error);
      return 0;
    }
  } catch (error) {
    console.error('❌ 未提出一覧送信例外:', error);
    return 0;
  }
}

/**
 * 初回ログイン記録
 */
export async function recordFirstLogin(userId: string): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({
        first_login_at: new Date().toISOString()
      })
      .eq('id', userId)
      .is('first_login_at', null); // 初回のみ更新

    if (error) {
      console.error('❌ 初回ログイン記録エラー:', error);
      return false;
    }

    console.log('✅ 初回ログイン記録完了:', userId);
    return true;
  } catch (error) {
    console.error('❌ 初回ログイン記録例外:', error);
    return false;
  }
}

/**
 * メールテンプレート取得
 */
export async function getEmailTemplate(templateKey: string): Promise<{
  subject_template: string;
  body_template: string;
} | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('email_templates')
      .select('subject_template, body_template')
      .eq('template_key', templateKey)
      .single();

    if (error) {
      console.error('❌ テンプレート取得エラー:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('❌ テンプレート取得例外:', error);
    return null;
  }
}

/**
 * 変数置換
 */
export function replaceVariables(template: string, variables: Record<string, any>): string {
  let result = template;
  
  Object.entries(variables).forEach(([key, value]) => {
    const placeholder = `{{${key}}}`;
    result = result.replace(new RegExp(placeholder, 'g'), String(value || ''));
  });
  
  return result;
}

/**
 * メール送信状況の取得
 */
export async function getEmailQueueStatus(): Promise<{
  pending: number;
  sent: number;
  failed: number;
}> {
  try {
    const { data, error } = await supabaseAdmin
      .from('email_queue')
      .select('status')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()); // 24時間以内

    if (error) {
      console.error('❌ メール送信状況取得エラー:', error);
      return { pending: 0, sent: 0, failed: 0 };
    }

    const counts = { pending: 0, sent: 0, failed: 0 };
    data.forEach(item => {
      counts[item.status as keyof typeof counts]++;
    });

    return counts;
  } catch (error) {
    console.error('❌ メール送信状況取得例外:', error);
    return { pending: 0, sent: 0, failed: 0 };
  }
}