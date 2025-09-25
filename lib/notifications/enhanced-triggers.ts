// 強化されたトリガー関数（冪等性対応）
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { enqueueEmailWithIdempotency } from './idempotency';

/**
 * 検証モード用のメールアドレス置き換え
 */
function getTestEmailOverride(originalEmail: string): string {
  const testMode = process.env.EMAIL_TEST_MODE === 'true';
  const testEmails = process.env.EMAIL_TEST_ADDRESSES;
  
  console.log('📧 検証モード確認:', {
    testMode,
    testEmails,
    originalEmail: originalEmail.substring(0, 10) + '...'
  });
  
  if (!testMode || !testEmails) {
    console.log('📧 通常モード: 元のメールアドレスを使用');
    return originalEmail; // 通常モード
  }
  
  // 検証用メールアドレスリスト（カンマ区切り）
  const testEmailList = testEmails.split(',').map(email => email.trim()).filter(Boolean);
  
  if (testEmailList.length === 0) {
    console.log('📧 検証用メールアドレスが空: 元のメールアドレスを使用');
    return originalEmail;
  }
  
  // 元のメールアドレスのハッシュ値で検証用メールを決定（一貫性保持）
  const hash = originalEmail.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  
  const index = Math.abs(hash) % testEmailList.length;
  const testEmail = testEmailList[index];
  
  console.log(`📧 検証モード置換: ${originalEmail} → ${testEmail}`, {
    hash,
    index,
    testEmailList
  });
  return testEmail;
}

/**
 * テンプレート取得とレンダリング
 */
async function renderEmailTemplate(
  templateKey: string,
  variables: Record<string, any>
): Promise<{ subject: string; body: string } | null> {
  try {
    const { data: template, error } = await supabaseAdmin
      .from('email_templates')
      .select('subject_template, body_template')
      .eq('template_key', templateKey)
      .single();

    if (error || !template) {
      console.error('❌ テンプレート取得エラー:', error);
      return null;
    }

    // 変数置換
    let subject = template.subject_template;
    let body = template.body_template;

    Object.entries(variables).forEach(([key, value]) => {
      const placeholder = `{{${key}}}`;
      const replacement = String(value || '');
      subject = subject.replace(new RegExp(placeholder, 'g'), replacement);
      body = body.replace(new RegExp(placeholder, 'g'), replacement);
    });

    return { subject, body };
  } catch (error) {
    console.error('❌ テンプレートレンダリング例外:', error);
    return null;
  }
}

/**
 * アナウンス通知（冪等性対応）
 */
export async function notifyAnnouncement(announcement: {
  id: string;
  title: string;
  content: string;
  term_id: string | null;
}): Promise<{ success: boolean; sent: number; skipped: number }> {
  try {
    console.log('📢 アナウンス通知開始:', announcement.title);

    // 期名を取得
    let termName = '全期共通';
    if (announcement.term_id) {
      const { data: term } = await supabaseAdmin
        .from('terms')
        .select('name')
        .eq('id', announcement.term_id)
        .single();
      termName = term?.name || termName;
    }

    // 対象学生を取得
    let studentsQuery = supabaseAdmin
      .from('profiles')
      .select('email, full_name')
      .eq('role', 'student')
      .not('email', 'is', null);

    if (announcement.term_id) {
      studentsQuery = studentsQuery.eq('term_id', announcement.term_id);
    }

    const { data: students, error: studentsError } = await studentsQuery;

    if (studentsError || !students) {
      console.error('❌ 学生取得エラー:', studentsError);
      return { success: false, sent: 0, skipped: 0 };
    }

    console.log('👥 対象学生数:', students.length);

    let sent = 0;
    let skipped = 0;

    // 各学生にメール送信
    for (const student of students) {
      const actualEmail = getTestEmailOverride(student.email);
      
      const variables = {
        student_name: student.full_name || '受講生',
        term_name: termName,
        announcement_title: announcement.title,
        announcement_content: announcement.content,
        mypage_url: process.env.APP_BASE_URL ? `${process.env.APP_BASE_URL}/mypage` : 'http://localhost:3000/mypage'
      };

      const rendered = await renderEmailTemplate('announcement_student', variables);
      if (!rendered) continue;

      const result = await enqueueEmailWithIdempotency({
        templateKey: 'announcement_student',
        toEmail: actualEmail,
        subject: rendered.subject,
        body: rendered.body,
        metadata: {
          announcement_id: announcement.id,
          original_email: student.email, // 元のメールアドレスを記録
          actual_email: actualEmail,     // 実際の送信先を記録
          term_id: announcement.term_id
        }
      });

      if (result.success) {
        if (result.skipped) {
          skipped++;
        } else {
          sent++;
        }
      }
    }

    console.log('✅ アナウンス通知完了:', { sent, skipped });
    return { success: true, sent, skipped };

  } catch (error) {
    console.error('❌ アナウンス通知例外:', error);
    return { success: false, sent: 0, skipped: 0 };
  }
}

/**
 * 課題提出通知（管理者向け、冪等性対応）
 */
export async function notifyTaskSubmitted(submission: {
  user_id: string;
  task_id: string;
  completed_at: string;
  sheet_link: string;
}): Promise<{ success: boolean; sent: number; skipped: number }> {
  try {
    console.log('📝 課題提出通知開始:', submission.task_id);

    // 学生情報取得
    const { data: student, error: studentError } = await supabaseAdmin
      .from('profiles')
      .select(`
        full_name, 
        company, 
        term_id,
        terms (name)
      `)
      .eq('id', submission.user_id)
      .single();

    if (studentError || !student) {
      console.error('❌ 学生情報取得エラー:', studentError);
      return { success: false, sent: 0, skipped: 0 };
    }

    // 課題情報取得
    const { data: task, error: taskError } = await supabaseAdmin
      .from('pre_assignments')
      .select('title, edit_title')
      .eq('assignment_id', submission.task_id)
      .eq('term_id', student.term_id)
      .single();

    // 管理者一覧取得
    const { data: admins, error: adminsError } = await supabaseAdmin
      .from('profiles')
      .select('email, full_name')
      .eq('role', 'admin')
      .not('email', 'is', null);

    if (adminsError || !admins) {
      console.error('❌ 管理者取得エラー:', adminsError);
      return { success: false, sent: 0, skipped: 0 };
    }

    let sent = 0;
    let skipped = 0;

    // 各管理者にメール送信
    for (const admin of admins) {
      const actualEmail = getTestEmailOverride(admin.email);
      
      const variables = {
        student_name: student.full_name || '受講生',
        company_name: student.company || '会社名未設定',
        term_name: (student.terms as any)?.name || '期未設定',
        task_title: task?.edit_title || task?.title || submission.task_id,
        submitted_at: new Date(submission.completed_at).toLocaleString('ja-JP'),
        sheet_link: submission.sheet_link,
        admin_url: process.env.APP_BASE_URL ? `${process.env.APP_BASE_URL}/admin` : 'http://localhost:3000/admin'
      };

      const rendered = await renderEmailTemplate('task_submitted_admin', variables);
      if (!rendered) continue;

      const result = await enqueueEmailWithIdempotency({
        templateKey: 'task_submitted_admin',
        toEmail: actualEmail,
        subject: rendered.subject,
        body: rendered.body,
        metadata: {
          submission_user_id: submission.user_id,
          task_id: submission.task_id,
          submitted_at: submission.completed_at,
          original_email: admin.email,
          actual_email: actualEmail
        }
      });

      if (result.success) {
        if (result.skipped) {
          skipped++;
        } else {
          sent++;
        }
      }
    }

    console.log('✅ 課題提出通知完了:', { sent, skipped });
    return { success: true, sent, skipped };

  } catch (error) {
    console.error('❌ 課題提出通知例外:', error);
    return { success: false, sent: 0, skipped: 0 };
  }
}

/**
 * 初回ログイン通知（管理者向け、冪等性対応）
 */
export async function notifyFirstLogin(user: {
  id: string;
  full_name: string;
  company: string;
  term_id: string;
  first_login_at: string;
}): Promise<{ success: boolean; sent: number; skipped: number }> {
  try {
    console.log('🔑 初回ログイン通知開始:', user.full_name);

    // 期名取得
    const { data: term } = await supabaseAdmin
      .from('terms')
      .select('name')
      .eq('id', user.term_id)
      .single();

    // 管理者一覧取得
    const { data: admins, error: adminsError } = await supabaseAdmin
      .from('profiles')
      .select('email, full_name')
      .eq('role', 'admin')
      .not('email', 'is', null);

    if (adminsError || !admins) {
      console.error('❌ 管理者取得エラー:', adminsError);
      return { success: false, sent: 0, skipped: 0 };
    }

    let sent = 0;
    let skipped = 0;

    // 各管理者にメール送信
    for (const admin of admins) {
      const actualEmail = getTestEmailOverride(admin.email);
      
      const variables = {
        student_name: user.full_name || '受講生',
        company_name: user.company || '会社名未設定',
        term_name: term?.name || '期未設定',
        login_at: new Date(user.first_login_at).toLocaleString('ja-JP'),
        admin_url: process.env.APP_BASE_URL ? `${process.env.APP_BASE_URL}/admin` : 'http://localhost:3000/admin'
      };

      const rendered = await renderEmailTemplate('first_login_admin', variables);
      if (!rendered) continue;

      const result = await enqueueEmailWithIdempotency({
        templateKey: 'first_login_admin',
        toEmail: actualEmail,
        subject: rendered.subject,
        body: rendered.body,
        metadata: {
          user_id: user.id,
          login_at: user.first_login_at,
          original_email: admin.email,
          actual_email: actualEmail
        }
      });

      if (result.success) {
        if (result.skipped) {
          skipped++;
        } else {
          sent++;
        }
      }
    }

    console.log('✅ 初回ログイン通知完了:', { sent, skipped });
    return { success: true, sent, skipped };

  } catch (error) {
    console.error('❌ 初回ログイン通知例外:', error);
    return { success: false, sent: 0, skipped: 0 };
  }
}