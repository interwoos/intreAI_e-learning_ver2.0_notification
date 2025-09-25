/*
  # assignment_id曖昧性エラーの修正

  1. 修正内容
    - initialize_pre_assignments_for_term関数の曖昧性解消
    - 全てのカラム参照にテーブル名/エイリアス明示
    - 変数名とカラム名の重複回避

  2. 対応方針
    - テーブル参照: terms.lecture_config, pre_assignments.assignment_id
    - 変数名変更: assignment_id → current_assignment_id
    - JSONB操作: 明示的なカラム参照
*/

-- 既存関数を削除
DROP FUNCTION IF EXISTS initialize_pre_assignments_for_term(uuid);

-- 修正版関数を作成
CREATE OR REPLACE FUNCTION initialize_pre_assignments_for_term(target_term_id uuid)
RETURNS void AS $$
DECLARE
  assignment_ids text[];
  current_assignment_id text;
  lecture_config_data jsonb;
  task_record jsonb;
  task_title text;
BEGIN
  -- 期のlecture_configからタスク情報を取得
  SELECT terms.lecture_config INTO lecture_config_data
  FROM terms 
  WHERE terms.id = target_term_id;

  -- lecture_configが存在しない場合はデフォルトのタスクIDを使用
  IF lecture_config_data IS NULL OR lecture_config_data->'allTasks' IS NULL THEN
    assignment_ids := ARRAY[
      '1-0', '1-1', '1-2',
      '2-0', '2-1', '2-2', '2-3', '2-4',
      '3-0', '3-1', '3-2', '3-3',
      '4-0',
      '5-0', '5-1', '5-2', '5-3', '5-4',
      '6-0', '6-1', '6-2', '6-3',
      '7-0', '7-1', '7-2', '7-3',
      '8-0', '8-1',
      '9-0'
    ];
  ELSE
    -- lecture_configからタスクIDを抽出
    SELECT array_agg(task_data->>'taskId')
    INTO assignment_ids
    FROM jsonb_array_elements(lecture_config_data->'allTasks') AS task_data;
  END IF;

  -- デバッグログ
  RAISE NOTICE '📋 初期化対象期ID: %', target_term_id;
  RAISE NOTICE '📋 タスクID配列: %', assignment_ids;

  -- 各タスクIDに対してレコードを挿入
  FOREACH current_assignment_id IN ARRAY assignment_ids
  LOOP
    -- タスクタイトルを取得（lecture_configから）
    task_title := '';
    
    IF lecture_config_data IS NOT NULL THEN
      SELECT task_data->>'title' INTO task_title
      FROM jsonb_array_elements(lecture_config_data->'allTasks') AS task_data
      WHERE task_data->>'taskId' = current_assignment_id
      LIMIT 1;
    END IF;

    -- レコード挿入
    INSERT INTO pre_assignments (
      term_id, 
      assignment_id, 
      title
    )
    VALUES (
      target_term_id, 
      current_assignment_id, 
      COALESCE(task_title, '')
    )
    ON CONFLICT (term_id, assignment_id) DO NOTHING;
    
    RAISE NOTICE '✅ 挿入完了: % - %', current_assignment_id, COALESCE(task_title, '(タイトルなし)');
  END LOOP;

  RAISE NOTICE '🎉 事前課題初期化完了: % 件のタスク', array_length(assignment_ids, 1);
END;
$$ LANGUAGE plpgsql;