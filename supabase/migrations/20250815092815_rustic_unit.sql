/*
  # user_assignmentsテーブルのスキーマ修正

  1. Changes to existing tables
    - Add missing columns to user_assignments table
    - `status` (text) - 提出状況（submitted/resubmitted/cancelled）
    - `submission_count` (integer) - 提出回数
    - `last_submitted_at` (timestamptz) - 最終提出日時
    - `last_cancelled_at` (timestamptz) - 最終取り消し日時

  2. Data Migration
    - 既存データの初期化
    - completed=true のレコードを status='submitted' に変換

  3. Performance
    - 適切なインデックス追加
    - 検索性能の向上

  4. Constraints
    - status値の制約追加
    - データ整合性の確保
*/

-- 1) 必要カラムを追加（存在すればスキップ）
ALTER TABLE public.user_assignments
  ADD COLUMN IF NOT EXISTS status text
    CHECK (status IN ('submitted', 'resubmitted', 'cancelled')),
  ADD COLUMN IF NOT EXISTS submission_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_cancelled_at timestamptz;

-- 2) completedとcompleted_atカラムが存在しない場合は追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_assignments' AND column_name = 'completed'
  ) THEN
    ALTER TABLE public.user_assignments ADD COLUMN completed boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_assignments' AND column_name = 'completed_at'
  ) THEN
    ALTER TABLE public.user_assignments ADD COLUMN completed_at timestamptz;
  END IF;
END $$;

-- 3) 既存データの初期化
UPDATE public.user_assignments
SET status = 'submitted',
    submission_count = 1,
    last_submitted_at = completed_at
WHERE status IS NULL AND completed IS TRUE;

-- 4) 未完了データの初期化
UPDATE public.user_assignments
SET status = NULL,
    submission_count = 0
WHERE status IS NULL AND (completed IS FALSE OR completed IS NULL);

-- 5) パフォーマンス向上のためのインデックス
CREATE INDEX IF NOT EXISTS idx_user_assignments_status 
ON public.user_assignments(status);

CREATE INDEX IF NOT EXISTS idx_user_assignments_user_task 
ON public.user_assignments(user_id, task_id);

CREATE INDEX IF NOT EXISTS idx_user_assignments_submission_count 
ON public.user_assignments(submission_count);

-- 6) 同一ユーザー×課題を一意に（重複防止）
CREATE UNIQUE INDEX IF NOT EXISTS user_assignments_user_task_key
  ON public.user_assignments(user_id, task_id);

-- 7) データ整合性確認用のビュー
CREATE OR REPLACE VIEW user_assignments_status_summary AS
SELECT 
  status,
  COUNT(*) as count,
  COUNT(CASE WHEN completed = true THEN 1 END) as completed_count,
  COUNT(CASE WHEN completed = false OR completed IS NULL THEN 1 END) as not_completed_count
FROM public.user_assignments
GROUP BY status
ORDER BY status;

-- 8) 確認用クエリ（ログ出力）
DO $$
DECLARE
  status_summary RECORD;
BEGIN
  RAISE NOTICE '📊 user_assignments テーブル状況:';
  
  FOR status_summary IN 
    SELECT status, count FROM user_assignments_status_summary
  LOOP
    RAISE NOTICE '  - %: % 件', COALESCE(status_summary.status, 'NULL'), status_summary.count;
  END LOOP;
  
  RAISE NOTICE '✅ user_assignments スキーマ修正完了';
END $$;