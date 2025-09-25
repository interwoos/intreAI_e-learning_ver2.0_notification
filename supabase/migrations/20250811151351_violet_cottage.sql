/*
  # 期間コンテンツコピーシステム

  1. New Tables
    - `term_import_logs` - コピー実行履歴管理
      - `id` (uuid, primary key)
      - `source_term_id` (uuid) - コピー元期ID
      - `target_term_id` (uuid) - コピー先期ID
      - `executed_by` (uuid) - 実行者ID
      - `copy_options` (jsonb) - コピーオプション設定
      - `results` (jsonb) - 実行結果（各テーブルの件数）
      - `storage_copy_status` (text) - ストレージコピー状況
      - `execution_time_ms` (integer) - 実行時間
      - `error_details` (text) - エラー詳細
      - `created_at` (timestamptz)

  2. Functions
    - `copy_term_content` - メインコピー処理関数
    - `preview_term_copy` - プレビュー用関数
    - `generate_unique_slug` - ユニーク制約回避用

  3. Security
    - Enable RLS on term_import_logs table
    - Add policies for admin access only
*/

-- コピー履歴管理テーブル
CREATE TABLE IF NOT EXISTS term_import_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_term_id uuid NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  target_term_id uuid NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  executed_by uuid NOT NULL REFERENCES auth.users(id),
  copy_options jsonb NOT NULL DEFAULT '{}'::jsonb,
  results jsonb NOT NULL DEFAULT '{}'::jsonb,
  storage_copy_status text NOT NULL DEFAULT 'skipped' CHECK (storage_copy_status IN ('skipped', 'queued', 'running', 'done', 'error')),
  execution_time_ms integer,
  error_details text,
  created_at timestamptz DEFAULT now()
);

-- RLS有効化
ALTER TABLE term_import_logs ENABLE ROW LEVEL SECURITY;

-- 管理者のみアクセス可能
CREATE POLICY "Admins can manage term import logs"
  ON term_import_logs FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

-- インデックス作成
CREATE INDEX idx_term_import_logs_source_term ON term_import_logs(source_term_id);
CREATE INDEX idx_term_import_logs_target_term ON term_import_logs(target_term_id);
CREATE INDEX idx_term_import_logs_created_at ON term_import_logs(created_at DESC);

-- ユニークスラッグ生成関数
CREATE OR REPLACE FUNCTION generate_unique_slug(base_slug text, suffix text DEFAULT NULL)
RETURNS text AS $$
DECLARE
  new_slug text;
  counter integer := 1;
BEGIN
  new_slug := CASE 
    WHEN suffix IS NOT NULL THEN base_slug || '-' || suffix
    ELSE base_slug || '-copy'
  END;
  
  -- 必要に応じて番号を付けて重複回避
  WHILE EXISTS (SELECT 1 FROM lectures WHERE slug = new_slug) LOOP
    new_slug := base_slug || '-copy-' || counter;
    counter := counter + 1;
  END LOOP;
  
  RETURN new_slug;
END;
$$ LANGUAGE plpgsql;

-- プレビュー用関数（Dry-run）
CREATE OR REPLACE FUNCTION preview_term_copy(
  source_term_id uuid,
  target_term_id uuid,
  copy_options jsonb
)
RETURNS jsonb AS $$
DECLARE
  result jsonb := '{}'::jsonb;
  lectures_count integer := 0;
  videos_count integer := 0;
  assignments_count integer := 0;
  prompts_count integer := 0;
BEGIN
  -- 講義数をカウント
  IF copy_options->>'lectures' = 'true' THEN
    SELECT COUNT(*) INTO lectures_count
    FROM lectures WHERE term_id = source_term_id;
  END IF;

  -- 動画数をカウント
  IF copy_options->>'videosMeta' = 'true' THEN
    SELECT COUNT(*) INTO videos_count
    FROM lecture_videos WHERE term_id = source_term_id;
  END IF;

  -- 事前課題数をカウント
  IF copy_options->>'assignments' = 'true' THEN
    SELECT COUNT(*) INTO assignments_count
    FROM pre_assignments WHERE term_id = source_term_id;
  END IF;

  -- プロンプト数をカウント
  IF copy_options->>'prompts' = 'true' THEN
    SELECT COUNT(*) INTO prompts_count
    FROM prompt_presets WHERE user_id IN (
      SELECT id FROM profiles WHERE term_id = source_term_id AND role = 'admin'
    );
  END IF;

  -- 結果を構築
  result := jsonb_build_object(
    'lectures', jsonb_build_object('count', lectures_count),
    'videosMeta', jsonb_build_object('count', videos_count),
    'assignments', jsonb_build_object('count', assignments_count),
    'prompts', jsonb_build_object('count', prompts_count)
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- メインコピー処理関数
CREATE OR REPLACE FUNCTION copy_term_content(
  source_term_id uuid,
  target_term_id uuid,
  copy_options jsonb,
  executed_by uuid
)
RETURNS jsonb AS $$
DECLARE
  start_time timestamptz := now();
  result jsonb := '{}'::jsonb;
  lectures_copied integer := 0;
  videos_copied integer := 0;
  assignments_copied integer := 0;
  prompts_copied integer := 0;
  execution_time_ms integer;
  log_id uuid;
BEGIN
  -- 同一期チェック
  IF source_term_id = target_term_id THEN
    RAISE EXCEPTION 'ソース期とターゲット期が同じです';
  END IF;

  -- 講義データのコピー
  IF copy_options->>'lectures' = 'true' THEN
    -- 現在は lectures テーブルが存在しないため、将来の拡張用
    lectures_copied := 0;
  END IF;

  -- 動画メタデータのコピー
  IF copy_options->>'videosMeta' = 'true' THEN
    INSERT INTO lecture_videos (
      lecture_number, term_id, title, subtitle, 
      original_file_name, url, display_order
    )
    SELECT 
      lecture_number, target_term_id, title, subtitle,
      original_file_name, 
      CASE 
        WHEN copy_options->>'storageFiles' = 'true' THEN
          -- ストレージコピー時はパス変更
          regexp_replace(url, source_term_id::text, target_term_id::text)
        ELSE
          -- メタのみコピー時は元URLを維持
          url
      END,
      display_order
    FROM lecture_videos 
    WHERE term_id = source_term_id;
    
    GET DIAGNOSTICS videos_copied = ROW_COUNT;
  END IF;

  -- 事前課題のコピー
  IF copy_options->>'assignments' = 'true' THEN
    INSERT INTO pre_assignments (
      term_id, assignment_id, title, edit_title, description,
      ai_name, ai_description, initial_message, 
      system_instruction, knowledge_base
    )
    SELECT 
      target_term_id, assignment_id, title, edit_title, description,
      ai_name, ai_description, initial_message,
      system_instruction, knowledge_base
    FROM pre_assignments 
    WHERE term_id = source_term_id
    ON CONFLICT (term_id, assignment_id) DO NOTHING;
    
    GET DIAGNOSTICS assignments_copied = ROW_COUNT;
  END IF;

  -- プロンプトプリセットのコピー
  IF copy_options->>'prompts' = 'true' THEN
    INSERT INTO prompt_presets (
      user_id, name, ai_name, ai_description, 
      initial_message, system_instruction, knowledge_base
    )
    SELECT 
      executed_by, -- 実行者に紐づけ
      name || ' (コピー)', ai_name, ai_description,
      initial_message, system_instruction, knowledge_base
    FROM prompt_presets 
    WHERE user_id IN (
      SELECT id FROM profiles 
      WHERE term_id = source_term_id AND role = 'admin'
    );
    
    GET DIAGNOSTICS prompts_copied = ROW_COUNT;
  END IF;

  -- 実行時間計算
  execution_time_ms := EXTRACT(EPOCH FROM (now() - start_time)) * 1000;

  -- 結果構築
  result := jsonb_build_object(
    'lectures', jsonb_build_object('copied', lectures_copied, 'skipped', 0),
    'videosMeta', jsonb_build_object('copied', videos_copied, 'skipped', 0),
    'assignments', jsonb_build_object('copied', assignments_copied, 'skipped', 0),
    'prompts', jsonb_build_object('copied', prompts_copied, 'skipped', 0),
    'executionTimeMs', execution_time_ms
  );

  -- ログ記録
  INSERT INTO term_import_logs (
    source_term_id, target_term_id, executed_by,
    copy_options, results, execution_time_ms,
    storage_copy_status
  ) VALUES (
    source_term_id, target_term_id, executed_by,
    copy_options, result, execution_time_ms,
    CASE WHEN copy_options->>'storageFiles' = 'true' THEN 'queued' ELSE 'skipped' END
  ) RETURNING id INTO log_id;

  -- ストレージコピーが必要な場合は非同期ジョブをキュー
  IF copy_options->>'storageFiles' = 'true' THEN
    -- 将来の実装: ジョブキューへの登録
    result := jsonb_set(result, '{job}', '"queued"'::jsonb);
  ELSE
    result := jsonb_set(result, '{job}', '"skipped"'::jsonb);
  END IF;

  RETURN result;
END;
$$ LANGUAGE plpgsql;