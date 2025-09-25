/*
  # 課題提出の取り消し・再提出システム

  1. Changes to existing tables
    - Enhance user_assignments table with resubmission tracking
    - Add version tracking and detailed status management

  2. New Tables
    - `submission_events` - 提出履歴イベントテーブル
      - 提出・取り消し・再提出の詳細ログを記録

  3. Functions
    - `handle_submission_action` - 提出・取り消し・再提出の統合処理
    - `get_submission_history` - 提出履歴取得
    - `check_resubmission_policy` - 再提出可能性チェック

  4. Security
    - Enable RLS on submission_events table
    - Add appropriate policies for students and admins

  5. Performance
    - Add indexes for efficient querying
    - Optimize for submission status tracking
*/

-- submission_events テーブル（提出履歴管理）
CREATE TABLE IF NOT EXISTS submission_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  task_id text NOT NULL,
  lecture_id integer REFERENCES lectures(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('submit', 'cancel', 'resubmit')),
  version integer NOT NULL DEFAULT 1,
  reason text DEFAULT '',
  file_url text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- user_assignments テーブルに version カラムを追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_assignments' AND column_name = 'version'
  ) THEN
    ALTER TABLE user_assignments ADD COLUMN version integer DEFAULT 1;
  END IF;
END $$;

-- lectures テーブルに再提出許可フラグを追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lectures' AND column_name = 'allow_resubmission_after_due'
  ) THEN
    ALTER TABLE lectures ADD COLUMN allow_resubmission_after_due boolean DEFAULT false;
  END IF;
END $$;

-- RLS有効化
ALTER TABLE submission_events ENABLE ROW LEVEL SECURITY;

-- submission_events のポリシー
CREATE POLICY "Users can view own submission events"
  ON submission_events FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own submission events"
  ON submission_events FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all submission events"
  ON submission_events FOR SELECT
  TO authenticated
  USING (auth.jwt() ->> 'role' = 'admin');

-- インデックス追加
CREATE INDEX IF NOT EXISTS idx_submission_events_user_task ON submission_events(user_id, task_id);
CREATE INDEX IF NOT EXISTS idx_submission_events_created_at ON submission_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submission_events_action ON submission_events(action);
CREATE INDEX IF NOT EXISTS idx_user_assignments_version ON user_assignments(version);

-- 再提出ポリシーチェック関数
CREATE OR REPLACE FUNCTION check_resubmission_policy(
  target_user_id uuid,
  target_task_id text
)
RETURNS jsonb AS $$
DECLARE
  assignment_record user_assignments%ROWTYPE;
  lecture_record lectures%ROWTYPE;
  current_time timestamptz := now();
  result jsonb;
BEGIN
  -- 課題情報を取得
  SELECT ua.* INTO assignment_record
  FROM user_assignments ua
  WHERE ua.user_id = target_user_id AND ua.task_id = target_task_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'Assignment not found'
    );
  END IF;

  -- 講義情報を取得
  SELECT l.* INTO lecture_record
  FROM lectures l
  WHERE l.id = assignment_record.lecture_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'Lecture not found'
    );
  END IF;

  -- 締切チェック
  IF lecture_record.assignment_deadline_date IS NOT NULL THEN
    DECLARE
      deadline_datetime timestamptz;
    BEGIN
      deadline_datetime := (lecture_record.assignment_deadline_date || ' ' || 
                           COALESCE(lecture_record.assignment_deadline_time, '23:59'))::timestamptz;
      
      IF current_time > deadline_datetime AND NOT lecture_record.allow_resubmission_after_due THEN
        RETURN jsonb_build_object(
          'allowed', false,
          'reason', 'Deadline passed and resubmission not allowed'
        );
      END IF;
    END;
  END IF;

  -- 状態チェック
  IF assignment_record.status NOT IN ('submitted', 'cancelled') THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'Invalid status for resubmission'
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'current_version', assignment_record.version,
    'current_status', assignment_record.status
  );
END;
$$ LANGUAGE plpgsql;

-- 統合提出処理関数
CREATE OR REPLACE FUNCTION handle_submission_action(
  target_user_id uuid,
  target_task_id text,
  action_type text,
  reason_text text DEFAULT '',
  file_url_text text DEFAULT ''
)
RETURNS jsonb AS $$
DECLARE
  assignment_record user_assignments%ROWTYPE;
  new_version integer;
  result jsonb;
BEGIN
  -- 現在の課題状況を取得
  SELECT * INTO assignment_record
  FROM user_assignments
  WHERE user_id = target_user_id AND task_id = target_task_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Assignment not found'
    );
  END IF;

  -- アクション実行
  CASE action_type
    WHEN 'submit' THEN
      -- 初回提出
      new_version := CASE 
        WHEN assignment_record.version IS NULL THEN 1
        ELSE assignment_record.version
      END;
      
      UPDATE user_assignments
      SET 
        completed = true,
        completed_at = now(),
        status = 'submitted',
        submission_count = COALESCE(submission_count, 0) + 1,
        last_submitted_at = now(),
        version = new_version,
        updated_at = now()
      WHERE user_id = target_user_id AND task_id = target_task_id;
      
      -- イベント記録
      INSERT INTO submission_events (user_id, task_id, lecture_id, action, version, file_url)
      VALUES (target_user_id, target_task_id, assignment_record.lecture_id, 'submit', new_version, file_url_text);
      
      result := jsonb_build_object(
        'success', true,
        'action', 'submitted',
        'version', new_version,
        'message', '課題を提出しました'
      );

    WHEN 'cancel' THEN
      -- 提出取り消し
      IF assignment_record.status NOT IN ('submitted', 'resubmitted') THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'Cannot cancel non-submitted assignment'
        );
      END IF;
      
      UPDATE user_assignments
      SET 
        completed = false,
        completed_at = NULL,
        status = 'cancelled',
        last_cancelled_at = now(),
        updated_at = now()
      WHERE user_id = target_user_id AND task_id = target_task_id;
      
      -- イベント記録
      INSERT INTO submission_events (user_id, task_id, lecture_id, action, version, reason)
      VALUES (target_user_id, target_task_id, assignment_record.lecture_id, 'cancel', assignment_record.version, reason_text);
      
      result := jsonb_build_object(
        'success', true,
        'action', 'cancelled',
        'message', '提出を取り消しました。再編集が可能です。'
      );

    WHEN 'resubmit' THEN
      -- 再提出
      DECLARE
        policy_check jsonb;
      BEGIN
        policy_check := check_resubmission_policy(target_user_id, target_task_id);
        
        IF NOT (policy_check->>'allowed')::boolean THEN
          RETURN jsonb_build_object(
            'success', false,
            'error', policy_check->>'reason'
          );
        END IF;
        
        new_version := assignment_record.version + 1;
        
        UPDATE user_assignments
        SET 
          completed = true,
          completed_at = now(),
          status = 'resubmitted',
          submission_count = COALESCE(submission_count, 0) + 1,
          last_submitted_at = now(),
          version = new_version,
          updated_at = now()
        WHERE user_id = target_user_id AND task_id = target_task_id;
        
        -- イベント記録
        INSERT INTO submission_events (user_id, task_id, lecture_id, action, version, file_url)
        VALUES (target_user_id, target_task_id, assignment_record.lecture_id, 'resubmit', new_version, file_url_text);
        
        result := jsonb_build_object(
          'success', true,
          'action', 'resubmitted',
          'version', new_version,
          'message', format('課題を再提出しました（v%s）', new_version)
        );
      END;

    ELSE
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Invalid action type'
      );
  END CASE;

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 提出履歴取得関数
CREATE OR REPLACE FUNCTION get_submission_history(
  target_user_id uuid,
  target_task_id text
)
RETURNS TABLE (
  id uuid,
  action text,
  version integer,
  reason text,
  file_url text,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    se.id,
    se.action,
    se.version,
    se.reason,
    se.file_url,
    se.created_at
  FROM submission_events se
  WHERE se.user_id = target_user_id 
    AND se.task_id = target_task_id
  ORDER BY se.created_at DESC;
END;
$$ LANGUAGE plpgsql;