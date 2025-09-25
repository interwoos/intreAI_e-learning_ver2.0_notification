/*
  # 期コピー機能（事前削除＆チャットプロンプト除外）

  1. Functions
    - `copy_term_with_deletion` - メイン期コピー処理関数
    - `preview_term_copy_with_deletion` - プレビュー用関数
    - `delete_term_content` - 期コンテンツ削除関数

  2. Features
    - ターゲット期の既存データを事前削除
    - prompt_presetsテーブルはコピー対象外
    - トランザクション保証（エラー時ロールバック）
    - 外部キー依存関係を考慮した削除順序

  3. Security
    - 管理者のみ実行可能
    - 安全なトランザクション処理
*/

-- 期コンテンツ削除関数（外部キー依存関係を考慮）
CREATE OR REPLACE FUNCTION delete_term_content(target_term_id uuid)
RETURNS jsonb AS $$
DECLARE
  deleted_counts jsonb := '{}'::jsonb;
  videos_deleted integer := 0;
  assignments_deleted integer := 0;
  lectures_deleted integer := 0;
BEGIN
  -- 子テーブルから順に削除（外部キー制約を考慮）
  
  -- 1. lecture_videos（子テーブル）
  DELETE FROM lecture_videos WHERE term_id = target_term_id;
  GET DIAGNOSTICS videos_deleted = ROW_COUNT;
  
  -- 2. user_assignments（子テーブル）
  DELETE FROM user_assignments 
  WHERE lecture_id IN (
    SELECT id FROM lectures WHERE term_id = target_term_id
  );
  
  -- 3. pre_assignments（子テーブル）
  DELETE FROM pre_assignments WHERE term_id = target_term_id;
  GET DIAGNOSTICS assignments_deleted = ROW_COUNT;
  
  -- 4. lectures（親テーブル）
  DELETE FROM lectures WHERE term_id = target_term_id;
  GET DIAGNOSTICS lectures_deleted = ROW_COUNT;
  
  -- 削除件数を記録
  deleted_counts := jsonb_build_object(
    'lectures', lectures_deleted,
    'videos', videos_deleted,
    'assignments', assignments_deleted
  );
  
  RETURN deleted_counts;
END;
$$ LANGUAGE plpgsql;

-- プレビュー用関数（削除対象件数とコピー対象件数を確認）
CREATE OR REPLACE FUNCTION preview_term_copy_with_deletion(
  source_term_id uuid,
  target_term_id uuid
)
RETURNS jsonb AS $$
DECLARE
  result jsonb := '{}'::jsonb;
  source_counts jsonb := '{}'::jsonb;
  target_counts jsonb := '{}'::jsonb;
  lectures_source integer := 0;
  videos_source integer := 0;
  assignments_source integer := 0;
  lectures_target integer := 0;
  videos_target integer := 0;
  assignments_target integer := 0;
BEGIN
  -- ソース期のデータ件数をカウント
  SELECT COUNT(*) INTO lectures_source FROM lectures WHERE term_id = source_term_id;
  SELECT COUNT(*) INTO videos_source FROM lecture_videos WHERE term_id = source_term_id;
  SELECT COUNT(*) INTO assignments_source FROM pre_assignments WHERE term_id = source_term_id;
  
  -- ターゲット期の削除対象件数をカウント
  SELECT COUNT(*) INTO lectures_target FROM lectures WHERE term_id = target_term_id;
  SELECT COUNT(*) INTO videos_target FROM lecture_videos WHERE term_id = target_term_id;
  SELECT COUNT(*) INTO assignments_target FROM pre_assignments WHERE term_id = target_term_id;
  
  -- 結果を構築
  source_counts := jsonb_build_object(
    'lectures', lectures_source,
    'videos', videos_source,
    'assignments', assignments_source
  );
  
  target_counts := jsonb_build_object(
    'lectures', lectures_target,
    'videos', videos_target,
    'assignments', assignments_target
  );
  
  result := jsonb_build_object(
    'source', source_counts,
    'target', target_counts,
    'willDelete', target_counts,
    'willCopy', source_counts
  );
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- メイン期コピー処理関数（事前削除付き）
CREATE OR REPLACE FUNCTION copy_term_with_deletion(
  source_term_id uuid,
  target_term_id uuid,
  executed_by uuid
)
RETURNS jsonb AS $$
DECLARE
  start_time timestamptz := now();
  result jsonb := '{}'::jsonb;
  deleted_counts jsonb;
  lectures_copied integer := 0;
  videos_copied integer := 0;
  assignments_copied integer := 0;
  execution_time_ms integer;
  log_id uuid;
BEGIN
  -- 同一期チェック
  IF source_term_id = target_term_id THEN
    RAISE EXCEPTION 'ソース期とターゲット期が同じです';
  END IF;
  
  -- ソース期とターゲット期の存在確認
  IF NOT EXISTS (SELECT 1 FROM terms WHERE id = source_term_id) THEN
    RAISE EXCEPTION 'ソース期が見つかりません: %', source_term_id;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM terms WHERE id = target_term_id) THEN
    RAISE EXCEPTION 'ターゲット期が見つかりません: %', target_term_id;
  END IF;
  
  -- 1. ターゲット期の既存データを削除
  deleted_counts := delete_term_content(target_term_id);
  
  -- 2. ソース期からデータをコピー
  
  -- 2-1. lectures テーブルのコピー
  INSERT INTO lectures (
    id, term_id, lecture_number, schedule, mode, 
    assignment_deadline_date, assignment_deadline_time,
    time_schedule, roles, materials_link, folder, remarks
  )
  SELECT 
    gen_random_uuid(), target_term_id, lecture_number, schedule, mode,
    assignment_deadline_date, assignment_deadline_time,
    time_schedule, roles, materials_link, folder, remarks
  FROM lectures 
  WHERE term_id = source_term_id;
  
  GET DIAGNOSTICS lectures_copied = ROW_COUNT;
  
  -- 2-2. lecture_videos テーブルのコピー
  INSERT INTO lecture_videos (
    lecture_number, term_id, title, subtitle, 
    original_file_name, url, display_order
  )
  SELECT 
    lecture_number, target_term_id, title, subtitle,
    original_file_name, url, display_order
  FROM lecture_videos 
  WHERE term_id = source_term_id;
  
  GET DIAGNOSTICS videos_copied = ROW_COUNT;
  
  -- 2-3. pre_assignments テーブルのコピー
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
  WHERE term_id = source_term_id;
  
  GET DIAGNOSTICS assignments_copied = ROW_COUNT;
  
  -- 2-4. user_assignments の再生成（新しい lecture_id に対応）
  INSERT INTO user_assignments (user_id, lecture_id, task_id, sheet_link, completed)
  SELECT 
    p.id as user_id,
    l.id as lecture_id,
    pa.assignment_id as task_id,
    '' as sheet_link,
    false as completed
  FROM profiles p
  CROSS JOIN lectures l
  CROSS JOIN pre_assignments pa
  WHERE p.term_id = target_term_id
    AND p.role = 'student'
    AND l.term_id = target_term_id
    AND pa.term_id = target_term_id
    AND pa.assignment_id LIKE l.lecture_number || '-%'
  ON CONFLICT (user_id, lecture_id, task_id) DO NOTHING;
  
  -- 実行時間計算
  execution_time_ms := EXTRACT(EPOCH FROM (now() - start_time)) * 1000;
  
  -- 結果構築
  result := jsonb_build_object(
    'deleted', deleted_counts,
    'copied', jsonb_build_object(
      'lectures', lectures_copied,
      'videos', videos_copied,
      'assignments', assignments_copied
    ),
    'executionTimeMs', execution_time_ms,
    'excludedTables', jsonb_build_array('prompt_presets')
  );
  
  -- ログ記録
  INSERT INTO term_import_logs (
    source_term_id, target_term_id, executed_by,
    copy_options, results, execution_time_ms,
    storage_copy_status
  ) VALUES (
    source_term_id, target_term_id, executed_by,
    jsonb_build_object('mode', 'overwrite', 'excludePrompts', true),
    result, execution_time_ms,
    'skipped'
  ) RETURNING id INTO log_id;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 期上書きコピー用のAPI関数（安全性チェック付き）
CREATE OR REPLACE FUNCTION safe_copy_term_with_deletion(
  source_term_id uuid,
  target_term_id uuid,
  executed_by uuid,
  confirmation_token text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  result jsonb;
  expected_token text;
BEGIN
  -- 安全性チェック：確認トークンの検証
  expected_token := encode(digest(source_term_id::text || target_term_id::text, 'sha256'), 'hex');
  
  IF confirmation_token IS NULL OR confirmation_token != expected_token THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Confirmation token required for destructive operation',
      'confirmationToken', expected_token
    );
  END IF;
  
  -- 実行者の管理者権限チェック
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = executed_by AND role = 'admin'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Admin privileges required'
    );
  END IF;
  
  -- メイン処理実行
  result := copy_term_with_deletion(source_term_id, target_term_id, executed_by);
  
  RETURN jsonb_build_object(
    'success', true,
    'data', result
  );
END;
$$ LANGUAGE plpgsql;