/*
  # 通知システムの実装

  1. Changes to existing tables
    - Add `due_date` (date) to pre_assignments table
    - Add `first_login_at` (timestamptz) to profiles table

  2. New Tables
    - `email_templates` - メールテンプレート管理
      - `id` (uuid, primary key)
      - `template_key` (text, unique) - テンプレート識別子
      - `subject_template` (text) - 件名テンプレート
      - `body_template` (text) - 本文テンプレート
      - `target_role` (text) - 対象ロール（student/admin）
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `email_queue` - メール送信キュー
      - `id` (uuid, primary key)
      - `to_email` (text) - 送信先メールアドレス
      - `subject` (text) - 件名
      - `body` (text) - 本文
      - `template_key` (text) - 使用テンプレート
      - `status` (enum) - 送信状況（pending/sent/failed）
      - `metadata` (jsonb) - 追加情報
      - `created_at` (timestamptz)
      - `sent_at` (timestamptz)
      - `error_message` (text)

  3. Security
    - Enable RLS on new tables
    - Add policies for admin access

  4. Functions
    - Email queue management functions
    - Notification trigger functions
*/

-- 1. 既存テーブルにカラム追加
ALTER TABLE pre_assignments 
  ADD COLUMN IF NOT EXISTS due_date date;

ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS first_login_at timestamptz;

-- 2. メールテンプレートテーブル
CREATE TABLE IF NOT EXISTS email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text UNIQUE NOT NULL,
  subject_template text NOT NULL,
  body_template text NOT NULL,
  target_role text NOT NULL CHECK (target_role IN ('student', 'admin')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. メール送信キューテーブル
CREATE TYPE email_status AS ENUM ('pending', 'sent', 'failed');

CREATE TABLE IF NOT EXISTS email_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  template_key text,
  status email_status DEFAULT 'pending',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  sent_at timestamptz,
  error_message text
);

-- 4. RLS有効化
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_queue ENABLE ROW LEVEL SECURITY;

-- 5. ポリシー作成
CREATE POLICY "Admins can manage email templates"
  ON email_templates FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Admins can view email queue"
  ON email_queue FOR SELECT
  TO authenticated
  USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "System can insert email queue"
  ON email_queue FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "System can update email queue"
  ON email_queue FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 6. updated_atトリガー
CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 7. インデックス作成
CREATE INDEX idx_email_templates_template_key ON email_templates(template_key);
CREATE INDEX idx_email_templates_target_role ON email_templates(target_role);
CREATE INDEX idx_email_queue_status ON email_queue(status);
CREATE INDEX idx_email_queue_created_at ON email_queue(created_at DESC);
CREATE INDEX idx_email_queue_to_email ON email_queue(to_email);
CREATE INDEX idx_pre_assignments_due_date ON pre_assignments(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX idx_profiles_first_login_at ON profiles(first_login_at) WHERE first_login_at IS NOT NULL;

-- 8. 初期メールテンプレート挿入
INSERT INTO email_templates (template_key, subject_template, body_template, target_role) VALUES
-- 学生向けテンプレート
('announcement_student', 
 '【{{term_name}}】重要なお知らせ: {{announcement_title}}',
 'こんにちは、{{student_name}}さん

{{term_name}}より重要なお知らせがあります。

件名: {{announcement_title}}

内容:
{{announcement_content}}

ご確認をお願いいたします。

マイページ: {{mypage_url}}'),

('deadline_reminder', 
 '【{{term_name}}】課題締切のお知らせ: {{task_title}}',
 'こんにちは、{{student_name}}さん

課題の締切が近づいています。

課題: {{task_title}}
締切日: {{due_date}}

まだ提出がお済みでない場合は、お早めにご提出ください。

課題ページ: {{task_url}}'),

('overdue_reminder',
 '【{{term_name}}】課題未提出のお知らせ',
 'こんにちは、{{student_name}}さん

以下の課題の締切が過ぎていますが、まだ提出されていません。

{{overdue_tasks}}

お早めにご提出をお願いいたします。

マイページ: {{mypage_url}}'),

-- 管理者向けテンプレート
('task_submitted_admin',
 '【{{term_name}}】課題提出通知: {{student_name}}さん',
 '課題が提出されました。

学生: {{student_name}}（{{company_name}}）
課題: {{task_title}}
提出日時: {{submitted_at}}

課題シート: {{sheet_link}}

管理画面: {{admin_url}}'),

('task_cancelled_admin',
 '【{{term_name}}】課題取消通知: {{student_name}}さん',
 '提出済み課題が取り消されました。

学生: {{student_name}}（{{company_name}}）
課題: {{task_title}}
取消日時: {{cancelled_at}}

管理画面: {{admin_url}}'),

('first_login_admin',
 '【{{term_name}}】初回ログイン通知: {{student_name}}さん',
 '受講生が初回ログインしました。

学生: {{student_name}}（{{company_name}}）
ログイン日時: {{login_at}}

管理画面: {{admin_url}}')

ON CONFLICT (template_key) DO NOTHING;

-- 9. メール送信用関数
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

-- 10. 通知トリガー関数

-- アナウンス作成時の通知
CREATE OR REPLACE FUNCTION notify_announcement_created()
RETURNS TRIGGER AS $$
DECLARE
  student_record RECORD;
  term_name text;
BEGIN
  -- 期名を取得
  IF NEW.term_id IS NOT NULL THEN
    SELECT name INTO term_name FROM terms WHERE id = NEW.term_id;
  ELSE
    term_name := '全期共通';
  END IF;

  -- 対象学生にメール送信
  FOR student_record IN
    SELECT p.email, p.full_name
    FROM profiles p
    WHERE (NEW.term_id IS NULL OR p.term_id = NEW.term_id)
      AND p.role = 'student'
      AND p.email IS NOT NULL
  LOOP
    PERFORM queue_email(
      'announcement_student',
      student_record.email,
      jsonb_build_object(
        'student_name', student_record.full_name,
        'term_name', term_name,
        'announcement_title', NEW.title,
        'announcement_content', NEW.content,
        'mypage_url', 'https://yourapp.com/mypage'
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 課題提出時の管理者通知
CREATE OR REPLACE FUNCTION notify_task_submitted()
RETURNS TRIGGER AS $$
DECLARE
  student_record RECORD;
  task_record RECORD;
  admin_record RECORD;
BEGIN
  -- 提出完了時のみ実行
  IF NEW.completed = true AND (OLD.completed IS NULL OR OLD.completed = false) THEN
    -- 学生情報取得
    SELECT p.full_name, p.company, p.term_id, t.name as term_name
    INTO student_record
    FROM profiles p
    LEFT JOIN terms t ON p.term_id = t.id
    WHERE p.id = NEW.user_id;

    -- 課題情報取得
    SELECT pa.title, pa.edit_title
    INTO task_record
    FROM pre_assignments pa
    WHERE pa.assignment_id = NEW.task_id
      AND pa.term_id = student_record.term_id;

    -- 管理者にメール送信
    FOR admin_record IN
      SELECT p.email, p.full_name
      FROM profiles p
      WHERE p.role = 'admin'
        AND p.email IS NOT NULL
    LOOP
      PERFORM queue_email(
        'task_submitted_admin',
        admin_record.email,
        jsonb_build_object(
          'student_name', student_record.full_name,
          'company_name', student_record.company,
          'term_name', student_record.term_name,
          'task_title', COALESCE(task_record.edit_title, task_record.title, NEW.task_id),
          'submitted_at', NEW.completed_at::text,
          'sheet_link', NEW.sheet_link,
          'admin_url', 'https://yourapp.com/admin'
        )
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 課題取消時の管理者通知
CREATE OR REPLACE FUNCTION notify_task_cancelled()
RETURNS TRIGGER AS $$
DECLARE
  student_record RECORD;
  task_record RECORD;
  admin_record RECORD;
BEGIN
  -- 取消時のみ実行（completed: true → false）
  IF OLD.completed = true AND NEW.completed = false THEN
    -- 学生情報取得
    SELECT p.full_name, p.company, p.term_id, t.name as term_name
    INTO student_record
    FROM profiles p
    LEFT JOIN terms t ON p.term_id = t.id
    WHERE p.id = NEW.user_id;

    -- 課題情報取得
    SELECT pa.title, pa.edit_title
    INTO task_record
    FROM pre_assignments pa
    WHERE pa.assignment_id = NEW.task_id
      AND pa.term_id = student_record.term_id;

    -- 管理者にメール送信
    FOR admin_record IN
      SELECT p.email, p.full_name
      FROM profiles p
      WHERE p.role = 'admin'
        AND p.email IS NOT NULL
    LOOP
      PERFORM queue_email(
        'task_cancelled_admin',
        admin_record.email,
        jsonb_build_object(
          'student_name', student_record.full_name,
          'company_name', student_record.company,
          'term_name', student_record.term_name,
          'task_title', COALESCE(task_record.edit_title, task_record.title, NEW.task_id),
          'cancelled_at', NEW.last_cancelled_at::text,
          'admin_url', 'https://yourapp.com/admin'
        )
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 初回ログイン時の管理者通知
CREATE OR REPLACE FUNCTION notify_first_login()
RETURNS TRIGGER AS $$
DECLARE
  admin_record RECORD;
  term_name text;
BEGIN
  -- 初回ログイン時のみ実行
  IF OLD.first_login_at IS NULL AND NEW.first_login_at IS NOT NULL THEN
    -- 期名取得
    SELECT name INTO term_name FROM terms WHERE id = NEW.term_id;

    -- 管理者にメール送信
    FOR admin_record IN
      SELECT p.email, p.full_name
      FROM profiles p
      WHERE p.role = 'admin'
        AND p.email IS NOT NULL
    LOOP
      PERFORM queue_email(
        'first_login_admin',
        admin_record.email,
        jsonb_build_object(
          'student_name', NEW.full_name,
          'company_name', NEW.company,
          'term_name', term_name,
          'login_at', NEW.first_login_at::text,
          'admin_url', 'https://yourapp.com/admin'
        )
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 11. トリガー作成
CREATE TRIGGER on_announcement_created
  AFTER INSERT ON announcements
  FOR EACH ROW
  EXECUTE FUNCTION notify_announcement_created();

CREATE TRIGGER on_task_submitted
  AFTER UPDATE ON user_assignments
  FOR EACH ROW
  EXECUTE FUNCTION notify_task_submitted();

CREATE TRIGGER on_task_cancelled
  AFTER UPDATE ON user_assignments
  FOR EACH ROW
  EXECUTE FUNCTION notify_task_cancelled();

CREATE TRIGGER on_first_login
  AFTER UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION notify_first_login();

-- 12. 締切リマインド用関数
CREATE OR REPLACE FUNCTION send_deadline_reminders(days_before integer DEFAULT 3)
RETURNS integer AS $$
DECLARE
  reminder_record RECORD;
  sent_count integer := 0;
  term_name text;
BEGIN
  FOR reminder_record IN
    SELECT 
      ua.user_id, 
      p.full_name, 
      p.email, 
      p.term_id,
      pa.assignment_id,
      pa.title, 
      pa.edit_title,
      pa.due_date
    FROM user_assignments ua
    JOIN profiles p ON p.id = ua.user_id
    JOIN pre_assignments pa ON pa.assignment_id = ua.task_id AND pa.term_id = p.term_id
    WHERE pa.due_date = CURRENT_DATE + INTERVAL '%s day' % days_before
      AND COALESCE(ua.completed, false) = false
      AND p.role = 'student'
      AND p.email IS NOT NULL
  LOOP
    -- 期名取得
    SELECT name INTO term_name FROM terms WHERE id = reminder_record.term_id;

    -- リマインドメール送信
    PERFORM queue_email(
      'deadline_reminder',
      reminder_record.email,
      jsonb_build_object(
        'student_name', reminder_record.full_name,
        'term_name', term_name,
        'task_title', COALESCE(reminder_record.edit_title, reminder_record.title, reminder_record.assignment_id),
        'due_date', reminder_record.due_date::text,
        'task_url', 'https://yourapp.com/lecture/' || split_part(reminder_record.assignment_id, '-', 1)
      )
    );
    
    sent_count := sent_count + 1;
  END LOOP;

  RETURN sent_count;
END;
$$ LANGUAGE plpgsql;

-- 13. 未提出一覧送信用関数
CREATE OR REPLACE FUNCTION send_overdue_report()
RETURNS integer AS $$
DECLARE
  term_record RECORD;
  admin_record RECORD;
  overdue_tasks text;
  sent_count integer := 0;
BEGIN
  -- 期ごとに未提出一覧を作成
  FOR term_record IN
    SELECT DISTINCT t.id, t.name
    FROM terms t
    JOIN pre_assignments pa ON pa.term_id = t.id
    WHERE pa.due_date < CURRENT_DATE
  LOOP
    -- 未提出タスク一覧を作成
    SELECT string_agg(
      format('- %s（%s）: %s', 
        p.full_name, 
        p.company, 
        COALESCE(pa.edit_title, pa.title, pa.assignment_id)
      ), 
      E'\n'
    ) INTO overdue_tasks
    FROM user_assignments ua
    JOIN profiles p ON p.id = ua.user_id
    JOIN pre_assignments pa ON pa.assignment_id = ua.task_id AND pa.term_id = p.term_id
    WHERE pa.term_id = term_record.id
      AND pa.due_date < CURRENT_DATE
      AND COALESCE(ua.completed, false) = false
      AND p.role = 'student';

    -- 未提出者がいる場合のみ送信
    IF overdue_tasks IS NOT NULL THEN
      -- 管理者にメール送信
      FOR admin_record IN
        SELECT p.email, p.full_name
        FROM profiles p
        WHERE p.role = 'admin'
          AND p.email IS NOT NULL
      LOOP
        PERFORM queue_email(
          'overdue_reminder',
          admin_record.email,
          jsonb_build_object(
            'term_name', term_record.name,
            'overdue_tasks', overdue_tasks,
            'admin_url', 'https://yourapp.com/admin'
          )
        );
        
        sent_count := sent_count + 1;
      END LOOP;
    END IF;
  END LOOP;

  RETURN sent_count;
END;
$$ LANGUAGE plpgsql;