/*
  # 課題提出状況管理システム アップデート

  1. Changes to existing tables
    - Add submission management columns to user_assignments table
    - `submission_count` (integer) - 提出回数（初回=1、再提出=2以上）
    - `last_submitted_at` (timestamptz) - 最終提出日時
    - `last_cancelled_at` (timestamptz) - 最終取り消し日時
    - `status` (text) - 提出状況（not_submitted/submitted/cancelled）

  2. New Tables
    - `submission_history` - 提出履歴テーブル
      - 提出・取り消しの詳細ログを記録

  3. Security
    - Enable RLS on submission_history table
    - Add appropriate policies

  4. Performance
    - Add indexes for efficient querying
*/

-- user_assignments テーブルに新しいカラムを追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_assignments' AND column_name = 'submission_count'
  ) THEN
    ALTER TABLE user_assignments ADD COLUMN submission_count integer DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_assignments' AND column_name = 'last_submitted_at'
  ) THEN
    ALTER TABLE user_assignments ADD COLUMN last_submitted_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_assignments' AND column_name = 'last_cancelled_at'
  ) THEN
    ALTER TABLE user_assignments ADD COLUMN last_cancelled_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_assignments' AND column_name = 'status'
  ) THEN
    ALTER TABLE user_assignments ADD COLUMN status text DEFAULT 'not_submitted';
  END IF;
END $$;

-- 既存データの移行（completed=true → status='submitted', submission_count=1）
UPDATE user_assignments 
SET 
  status = CASE 
    WHEN completed = true THEN 'submitted'
    ELSE 'not_submitted'
  END,
  submission_count = CASE 
    WHEN completed = true THEN 1
    ELSE 0
  END,
  last_submitted_at = CASE 
    WHEN completed = true THEN completed_at
    ELSE NULL
  END
WHERE status = 'not_submitted'; -- 重複実行を防ぐ

-- 提出履歴テーブルを作成
CREATE TABLE IF NOT EXISTS submission_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  task_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('submit', 'cancel')),
  submission_count integer NOT NULL,
  timestamp timestamptz DEFAULT now(),
  notes text DEFAULT ''
);

-- RLS有効化
ALTER TABLE submission_history ENABLE ROW LEVEL SECURITY;

-- submission_history のポリシー
CREATE POLICY "Users can view own submission history"
  ON submission_history FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all submission history"
  ON submission_history FOR SELECT
  TO authenticated
  USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "System can insert submission history"
  ON submission_history FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR auth.jwt() ->> 'role' = 'admin');

-- インデックス追加
CREATE INDEX IF NOT EXISTS idx_user_assignments_status ON user_assignments(status);
CREATE INDEX IF NOT EXISTS idx_user_assignments_submission_count ON user_assignments(submission_count);
CREATE INDEX IF NOT EXISTS idx_submission_history_user_task ON submission_history(user_id, task_id);
CREATE INDEX IF NOT EXISTS idx_submission_history_timestamp ON submission_history(timestamp DESC);

-- 提出状況管理用の関数
CREATE OR REPLACE FUNCTION toggle_task_submission(
  target_user_id uuid,
  target_task_id text,
  action_type text
)
RETURNS jsonb AS $$
DECLARE
  current_assignment user_assignments%ROWTYPE;
  new_submission_count integer;
  result jsonb;
BEGIN
  -- 現在の課題状況を取得
  SELECT * INTO current_assignment
  FROM user_assignments
  WHERE user_id = target_user_id AND task_id = target_task_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Assignment not found'
    );
  END IF;

  -- アクション実行
  IF action_type = 'submit' THEN
    -- 提出処理
    new_submission_count := current_assignment.submission_count + 1;
    
    UPDATE user_assignments
    SET 
      completed = true,
      completed_at = now(),
      status = 'submitted',
      submission_count = new_submission_count,
      last_submitted_at = now(),
      updated_at = now()
    WHERE user_id = target_user_id AND task_id = target_task_id;
    
    -- 履歴記録
    INSERT INTO submission_history (user_id, task_id, action, submission_count)
    VALUES (target_user_id, target_task_id, 'submit', new_submission_count);
    
    result := jsonb_build_object(
      'success', true,
      'action', 'submitted',
      'submission_count', new_submission_count,
      'message', CASE 
        WHEN new_submission_count = 1 THEN '課題を提出しました'
        ELSE format('課題を再提出しました（%s回目）', new_submission_count)
      END
    );
    
  ELSIF action_type = 'cancel' THEN
    -- 取り消し処理
    IF current_assignment.status != 'submitted' THEN
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
    
    -- 履歴記録
    INSERT INTO submission_history (user_id, task_id, action, submission_count)
    VALUES (target_user_id, target_task_id, 'cancel', current_assignment.submission_count);
    
    result := jsonb_build_object(
      'success', true,
      'action', 'cancelled',
      'message', '提出を取り消しました。再編集が可能です。'
    );
    
  ELSE
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid action type'
    );
  END IF;

  RETURN result;
END;
$$ LANGUAGE plpgsql;