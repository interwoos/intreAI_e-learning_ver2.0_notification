/*
  # SQLトリガー無効化とコード主導通知への移行

  1. Disable SQL Triggers
    - Drop all automatic notification triggers
    - Remove trigger functions that send emails automatically
    - Keep email_templates and email_queue tables intact

  2. Migration to Code-driven Notifications
    - All notifications will be handled by API routes
    - Enhanced idempotency and retry logic in application code
    - Better control and monitoring capabilities

  3. Cleanup
    - Remove unused notification functions
    - Keep core email infrastructure (templates, queue)
    - Preserve data integrity
*/

-- 1. 既存のトリガーを削除
DROP TRIGGER IF EXISTS on_announcement_created ON announcements;
DROP TRIGGER IF EXISTS on_task_submitted ON user_assignments;
DROP TRIGGER IF EXISTS on_task_cancelled ON user_assignments;
DROP TRIGGER IF EXISTS on_first_login ON profiles;

-- 2. 自動通知関数を削除
DROP FUNCTION IF EXISTS notify_announcement_created();
DROP FUNCTION IF EXISTS notify_task_submitted();
DROP FUNCTION IF EXISTS notify_task_cancelled();
DROP FUNCTION IF EXISTS notify_first_login();

-- 3. 古い通知関数も削除（存在する場合）
DROP FUNCTION IF EXISTS send_deadline_reminders(integer);
DROP FUNCTION IF EXISTS send_overdue_report();

-- 4. email_templatesテーブルに新しいテンプレートを追加（不足分）
INSERT INTO email_templates (template_key, subject_template, body_template, target_role) VALUES
('overdue_list_admin', 
 '【{{term_name}}】未提出課題一覧レポート',
 '未提出課題の一覧をお知らせします。

期: {{term_name}}

未提出課題:
{{overdue_tasks}}

管理画面で詳細をご確認ください。

管理画面: {{admin_url}}',
 'admin')
ON CONFLICT (template_key) DO UPDATE SET
  subject_template = EXCLUDED.subject_template,
  body_template = EXCLUDED.body_template,
  updated_at = now();

-- 5. queue_email関数を改良版に置き換え
CREATE OR REPLACE FUNCTION queue_email(
  template_key_param text,
  to_email_param text,
  variables jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid AS $$
DECLARE
  template_record email_templates%ROWTYPE;
  final_subject text;
  final_body text;
  queue_id uuid;
  var_key text;
  var_value text;
BEGIN
  -- テンプレート取得
  SELECT * INTO template_record
  FROM email_templates
  WHERE template_key = template_key_param;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Email template not found: %', template_key_param;
  END IF;

  -- 変数置換
  final_subject := template_record.subject_template;
  final_body := template_record.body_template;

  -- JSONB変数を順次置換
  FOR var_key, var_value IN SELECT * FROM jsonb_each_text(variables)
  LOOP
    final_subject := replace(final_subject, '{{' || var_key || '}}', var_value);
    final_body := replace(final_body, '{{' || var_key || '}}', var_value);
  END LOOP;

  -- キューに挿入
  INSERT INTO email_queue (to_email, subject, body, template_key, metadata)
  VALUES (to_email_param, final_subject, final_body, template_key_param, variables)
  RETURNING id INTO queue_id;

  RETURN queue_id;
END;
$$ LANGUAGE plpgsql;

-- 6. 確認用ログ
DO $$
BEGIN
  RAISE NOTICE '🔄 SQLトリガー無効化完了';
  RAISE NOTICE '📧 コード主導通知システムに移行';
  RAISE NOTICE '✅ email_templates と email_queue は保持';
  RAISE NOTICE '🤖 今後の通知は /api/jobs/process-queue で処理';
END $$;