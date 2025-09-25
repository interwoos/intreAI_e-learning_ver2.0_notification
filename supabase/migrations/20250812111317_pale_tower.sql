/*
  # トークン使用量追跡システム

  1. Changes to existing tables
    - Add token tracking columns to chat_history table
    - `input_tokens` (integer) - 入力トークン数
    - `output_tokens` (integer) - 出力トークン数  
    - `total_tokens` (integer) - 合計トークン数
    - `token_calculation_method` (text) - 計算方法（'api'/'estimated'）

  2. Performance
    - Add indexes for token aggregation queries
    - Optimize for daily/monthly reporting

  3. Data Migration
    - Set default values for existing records
    - Ensure backward compatibility
*/

-- chat_historyテーブルにトークン追跡カラムを追加
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

-- トークン集計用のインデックス
CREATE INDEX IF NOT EXISTS idx_chat_history_tokens_date 
ON chat_history(message_timestamp::date, total_tokens);

CREATE INDEX IF NOT EXISTS idx_chat_history_tokens_user_date 
ON chat_history(user_id, message_timestamp::date, total_tokens);

CREATE INDEX IF NOT EXISTS idx_chat_history_tokens_model 
ON chat_history(model, total_tokens) WHERE model IS NOT NULL;

-- 日次トークン集計用のビュー
CREATE OR REPLACE VIEW daily_token_usage AS
SELECT 
  message_timestamp::date as usage_date,
  model,
  COUNT(*) as message_count,
  COUNT(DISTINCT user_id) as unique_users,
  SUM(input_tokens) as total_input_tokens,
  SUM(output_tokens) as total_output_tokens,
  SUM(total_tokens) as total_tokens,
  AVG(total_tokens) as avg_tokens_per_message
FROM chat_history
WHERE role = 'assistant' 
  AND total_tokens > 0
GROUP BY message_timestamp::date, model
ORDER BY usage_date DESC, model;

-- 期別日次トークン集計用のビュー
CREATE OR REPLACE VIEW daily_token_usage_by_term AS
SELECT 
  ch.message_timestamp::date as usage_date,
  p.term_id,
  t.name as term_name,
  ch.model,
  COUNT(*) as message_count,
  COUNT(DISTINCT ch.user_id) as unique_users,
  SUM(ch.input_tokens) as total_input_tokens,
  SUM(ch.output_tokens) as total_output_tokens,
  SUM(ch.total_tokens) as total_tokens,
  AVG(ch.total_tokens) as avg_tokens_per_message
FROM chat_history ch
JOIN profiles p ON ch.user_id = p.id
LEFT JOIN terms t ON p.term_id = t.id
WHERE ch.role = 'assistant' 
  AND ch.total_tokens > 0
GROUP BY ch.message_timestamp::date, p.term_id, t.name, ch.model
ORDER BY usage_date DESC, term_name, ch.model;