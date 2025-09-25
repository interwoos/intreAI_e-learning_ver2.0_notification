/*
  # 生成列を使った正確なトークン数カウントシステム

  1. Generated Columns
    - `message_date_utc` (date) - UTC日付の生成列
    - インデックス作成可能な固定値として保存

  2. Performance Indexes
    - 生成列を使った高速インデックス
    - 集計クエリ最適化

  3. Views
    - 日次トークン集計ビュー
    - 期別日次トークン集計ビュー
*/

-- 1. 生成列を追加（UTC日付）
ALTER TABLE chat_history
  ADD COLUMN IF NOT EXISTS message_date_utc date
  GENERATED ALWAYS AS ((message_timestamp AT TIME ZONE 'UTC')::date) STORED;

-- 2. 生成列を使った高速インデックス
CREATE INDEX IF NOT EXISTS idx_chat_history_message_date_utc
  ON chat_history(message_date_utc);

CREATE INDEX IF NOT EXISTS idx_chat_history_role_date
  ON chat_history(role, message_date_utc) WHERE role = 'assistant';

CREATE INDEX IF NOT EXISTS idx_chat_history_user_date_tokens
  ON chat_history(user_id, message_date_utc, total_tokens);

CREATE INDEX IF NOT EXISTS idx_chat_history_model_tokens
  ON chat_history(model, total_tokens) WHERE model IS NOT NULL;

-- 3. 日次トークン集計ビュー（生成列使用）
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

-- 4. 期別日次トークン集計ビュー（生成列使用）
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