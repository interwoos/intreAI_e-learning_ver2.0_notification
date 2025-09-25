/*
  # 課題提出システムの修正

  1. 既存データの修正
    - user_assignments テーブルの status カラムが存在しない場合の対応
    - 既存の completed フラグから status への移行

  2. 課題シートリンクの修正
    - sheet_link が空の場合のデフォルト値設定
    - 課題シートボタンの表示制御

  3. 提出状況の正常化
    - 既存の completed=true レコードを status='submitted' に変換
    - submission_count の初期化
*/

-- user_assignments テーブルに必要なカラムが存在するかチェックして追加
DO $$
BEGIN
  -- status カラムの追加
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_assignments' AND column_name = 'status'
  ) THEN
    ALTER TABLE user_assignments ADD COLUMN status text DEFAULT 'not_submitted';
    RAISE NOTICE '✅ status カラムを追加しました';
  END IF;

  -- submission_count カラムの追加
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_assignments' AND column_name = 'submission_count'
  ) THEN
    ALTER TABLE user_assignments ADD COLUMN submission_count integer DEFAULT 0;
    RAISE NOTICE '✅ submission_count カラムを追加しました';
  END IF;

  -- last_submitted_at カラムの追加
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_assignments' AND column_name = 'last_submitted_at'
  ) THEN
    ALTER TABLE user_assignments ADD COLUMN last_submitted_at timestamptz;
    RAISE NOTICE '✅ last_submitted_at カラムを追加しました';
  END IF;

  -- last_cancelled_at カラムの追加
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_assignments' AND column_name = 'last_cancelled_at'
  ) THEN
    ALTER TABLE user_assignments ADD COLUMN last_cancelled_at timestamptz;
    RAISE NOTICE '✅ last_cancelled_at カラムを追加しました';
  END IF;
END $$;

-- 既存データの移行（completed=true → status='submitted'）
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
WHERE status IS NULL OR status = 'not_submitted';

-- submission_history テーブルが存在しない場合は作成
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

-- 提出状況管理用の関数（既存の場合は置き換え）
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

-- 課題シートリンクが空の場合のデフォルト値を設定
UPDATE user_assignments 
SET sheet_link = COALESCE(sheet_link, '#')
WHERE sheet_link IS NULL OR sheet_link = '';

-- 課題シートリンクの検証関数
CREATE OR REPLACE FUNCTION validate_sheet_link(link text)
RETURNS boolean AS $$
BEGIN
  RETURN link IS NOT NULL 
    AND link != '' 
    AND link != '#' 
    AND (link LIKE 'https://docs.google.com/spreadsheets/%' OR link LIKE 'https://drive.google.com/%');
END;
$$ LANGUAGE plpgsql;