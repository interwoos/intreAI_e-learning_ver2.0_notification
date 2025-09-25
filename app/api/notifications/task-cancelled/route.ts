import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { enqueueEmailWithIdempotency } from '@/lib/notifications/idempotency';

/**
 * 検証モード用のメールアドレス置き換え
 */
function getTestEmailOverride(originalEmail: string): string {
  const testMode = process.env.EMAIL_TEST_MODE === 'true';
  const testEmails = process.env.EMAIL_TEST_ADDRESSES;
  
  if (!testMode || !testEmails) {
    return originalEmail;
  }
  
  const testEmailList = testEmails.split(',').map(email => email.trim()).filter(Boolean);
  
  if (testEmailList.length === 0) {
    return originalEmail;
  }
  
  const hash = originalEmail.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  
  const index = Math.abs(hash) % testEmailList.length;
  const testEmail = testEmailList[index];
  
  console.log(`📧 検証モード: ${originalEmail} → ${testEmail}`);
  return testEmail;
}

export async function POST(request: Request) {
  try {
    const { userId, taskId, cancelledAt } = await request.json();

    if (!userId || !taskId || !cancelledAt) {
      return NextResponse.json(
        { error: '必要なパラメータが不足しています' },
        { status: 400 }
      );
    }

    console.log('🗑️ 課題取消通知API呼び出し:', { userId, taskId });

    // 認証チェック（システムまたは管理者）
    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
      
      if (authError || !user) {
        return NextResponse.json({ error: '認証が無効です' }, { status: 401 });
      }
    }

    // 学生情報取得
    const { data: student, error: studentError } = await supabaseAdmin
      .from('profiles')
      .select(`
        full_name, 
        company, 
        term_id,
        terms (name)
      `)
      .eq('id', userId)
      .single();

    if (studentError || !student) {
      console.error('❌ 学生情報取得エラー:', studentError);
      return NextResponse.json({
        success: false,
        error: '学生情報の取得に失敗しました'
      }, { status: 404 });
    }

    // 課題情報取得
    const { data: task, error: taskError } = await supabaseAdmin
      .from('pre_assignments')
      .select('title, edit_title')
      .eq('assignment_id', taskId)
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
      return NextResponse.json({
        success: false,
        error: '管理者情報の取得に失敗しました'
      }, { status: 500 });
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
        task_title: task?.edit_title || task?.title || taskId,
        cancelled_at: new Date(cancelledAt).toLocaleString('ja-JP'),
        admin_url: process.env.APP_BASE_URL ? `${process.env.APP_BASE_URL}/admin` : 'http://localhost:3000/admin'
      };

      // テンプレート取得とレンダリング
      const { data: template, error: templateError } = await supabaseAdmin
        .from('email_templates')
        .select('subject_template, body_template')
        .eq('template_key', 'task_cancelled_admin')
        .single();

      if (templateError || !template) {
        console.error('❌ テンプレート取得エラー:', templateError);
        continue;
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

      const result = await enqueueEmailWithIdempotency({
        templateKey: 'task_cancelled_admin',
        toEmail: actualEmail,
        subject,
        body,
        metadata: {
          user_id: userId,
          task_id: taskId,
          cancelled_at: cancelledAt,
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

    console.log('✅ 課題取消通知完了:', { sent, skipped });
    return NextResponse.json({
      success: true,
      sent,
      skipped,
      message: `${sent}件送信、${skipped}件スキップ`
    });

  } catch (error) {
    console.error('❌ 課題取消通知API例外:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : '不明なエラー'
    }, { status: 500 });
  }
}