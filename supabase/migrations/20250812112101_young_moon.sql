/*
  # 生成列を使った正確なトークン数カウントシステム

  1. Generated Columns
    - `message_date_utc` (date) - UTC日付の生成列
    - インデックス作成可能な固定値として保存

  2. Token Tracking Columns
    - `input_tokens` (integer) - 入力トークン数
    - `output_tokens` (integer) - 出力トークン数  
    - `total_tokens` (integer) - 合計トークン数
    - `token_calculation_method` (text) - 計算方法

  3. Performance Indexes
    - 生成列を使った高速インデックス
    - 集計クエリ最適化

  4. Views
    - 日次トークン集計ビュー
    - 期別日次トークン集計ビュー
*/

-- 1. トークン追跡カラムを追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_history' AND column_name = 'input_tokens'
  ) THEN
    ALTER TABLE chat_history ADD COLUMN input_tokens integer DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_history' AND column_name = 'output_tokens'
  ) THEN
    ALTER TABLE chat_history ADD COLUMN output_tokens integer DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_history' AND column_name = 'total_tokens'
  ) THEN
    ALTER TABLE chat_history ADD COLUMN total_tokens integer DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_history' AND column_name = 'token_calculation_method'
  ) THEN
    ALTER TABLE chat_history ADD COLUMN token_calculation_method text DEFAULT 'estimated';
  END IF;
END $$;

-- 2. 生成列を追加（UTC日付）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_history' AND column_name = 'message_date_utc'
  ) THEN
    ALTER TABLE chat_history 
    ADD COLUMN message_date_utc date 
    GENERATED ALWAYS AS ((message_timestamp AT TIME ZONE 'UTC')::date) STORED;
  END IF;
END $$;

-- 3. 既存データのデフォルト値設定
UPDATE chat_history 
SET 
  input_tokens = 0,
  output_tokens = 0,
  total_tokens = 0,
  token_calculation_method = 'estimated'
WHERE input_tokens IS NULL 
   OR output_tokens IS NULL 
   OR total_tokens IS NULL 
   OR token_calculation_method IS NULL;

-- 4. 生成列を使った高速インデックス
CREATE INDEX IF NOT EXISTS idx_chat_history_message_date_utc
  ON chat_history(message_date_utc);

CREATE INDEX IF NOT EXISTS idx_chat_history_user_date_tokens
  ON chat_history(user_id, message_date_utc, total_tokens);

CREATE INDEX IF NOT EXISTS idx_chat_history_model_tokens
  ON chat_history(model, total_tokens) WHERE model IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_history_role_tokens
  ON chat_history(role, total_tokens) WHERE role = 'assistant';

CREATE INDEX IF NOT EXISTS idx_chat_history_date_role_tokens
  ON chat_history(message_date_utc, role, total_tokens) WHERE role = 'assistant';

-- 5. 日次トークン集計ビュー（生成列使用）
DROP VIEW IF EXISTS daily_token_usage;
CREATE OR REPLACE VIEW daily_token_usage AS
SELECT 
  message_date_utc AS usage_date,
  model,
  COUNT(*) AS message_count,
  COUNT(DISTINCT user_id) AS unique_users,
  SUM(input_tokens) AS total_input_tokens,
  SUM(output_tokens) AS total_output_tokens,
  SUM(total_tokens) AS total_tokens,
  AVG(total_tokens) AS avg_tokens_per_message
FROM chat_history
WHERE role = 'assistant' AND total_tokens > 0
GROUP BY message_date_utc, model
ORDER BY usage_date DESC, model;

-- 6. 期別日次トークン集計ビュー（生成列使用）
DROP VIEW IF EXISTS daily_token_usage_by_term;
CREATE OR REPLACE VIEW daily_token_usage_by_term AS
SELECT 
  ch.message_date_utc AS usage_date,
  p.term_id,
  t.name AS term_name,
  ch.model,
  COUNT(*) AS message_count,
  COUNT(DISTINCT ch.user_id) AS unique_users,
  SUM(ch.input_tokens) AS total_input_tokens,
  SUM(ch.output_tokens) AS total_output_tokens,
  SUM(ch.total_tokens) AS total_tokens,
  AVG(ch.total_tokens) AS avg_tokens_per_message
FROM chat_history ch
JOIN profiles p ON ch.user_id = p.id
LEFT JOIN terms t ON p.term_id = t.id
WHERE ch.role = 'assistant' AND ch.total_tokens > 0
GROUP BY ch.message_date_utc, p.term_id, t.name, ch.model
ORDER BY usage_date DESC, term_name, ch.model;

-- 7. トークン集計用の便利関数
CREATE OR REPLACE FUNCTION get_daily_token_stats(
  start_date date,
  end_date date,
  target_term_id uuid DEFAULT NULL
)
RETURNS TABLE (
  usage_date date,
  total_tokens bigint,
  message_count bigint,
  unique_users bigint
) AS $$
BEGIN
  IF target_term_id IS NULL THEN
    -- 全体集計
    RETURN QUERY
    SELECT 
      ch.message_date_utc,
      SUM(ch.total_tokens)::bigint,
      COUNT(*)::bigint,
      COUNT(DISTINCT ch.user_id)::bigint
    FROM chat_history ch
    WHERE ch.role = 'assistant' 
      AND ch.total_tokens > 0
      AND ch.message_date_utc BETWEEN start_date AND end_date
    GROUP BY ch.message_date_utc
    ORDER BY ch.message_date_utc DESC;
  ELSE
    -- 期別集計
    RETURN QUERY
    SELECT 
      ch.message_date_utc,
      SUM(ch.total_tokens)::bigint,
      COUNT(*)::bigint,
      COUNT(DISTINCT ch.user_id)::bigint
    FROM chat_history ch
    JOIN profiles p ON ch.user_id = p.id
    WHERE ch.role = 'assistant' 
      AND ch.total_tokens > 0
      AND p.term_id = target_term_id
      AND ch.message_date_utc BETWEEN start_date AND end_date
    GROUP BY ch.message_date_utc
    ORDER BY ch.message_date_utc DESC;
  END IF;
END;
$$ LANGUAGE plpgsql;