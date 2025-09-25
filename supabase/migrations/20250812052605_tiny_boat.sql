/*
  # AI利用状況管理テーブル

  1. New Tables
    - `chat_usage` - 日次トークン集計テーブル
      - `id` (uuid, primary key)
      - `date` (date) - 集計日
      - `term_id` (uuid) - 期ID（全体集計の場合はNULL）
      - `total_tokens` (integer) - その日の合計トークン数
      - `model` (text) - 使用モデル（任意）
      - `message_count` (integer) - メッセージ数
      - `user_count` (integer) - 利用ユーザー数
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on chat_usage table
    - Add policies for admin access only

  3. Performance
    - Add indexes for efficient querying
    - Optimize for date + term_id queries
*/

-- 日次トークン集計テーブル
CREATE TABLE IF NOT EXISTS chat_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  term_id uuid REFERENCES terms(id) ON DELETE CASCADE,
  total_tokens integer NOT NULL DEFAULT 0,
  model text,
  message_count integer NOT NULL DEFAULT 0,
  user_count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(date, term_id, model)
);

-- RLS有効化
ALTER TABLE chat_usage ENABLE ROW LEVEL SECURITY;

-- 管理者のみアクセス可能
CREATE POLICY "Admins can manage chat usage"
  ON chat_usage FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

-- パフォーマンス向上のためのインデックス
CREATE INDEX idx_chat_usage_date ON chat_usage(date DESC);
CREATE INDEX idx_chat_usage_term_date ON chat_usage(term_id, date DESC);
CREATE INDEX idx_chat_usage_model ON chat_usage(model) WHERE model IS NOT NULL;

-- 日次集計用の関数
CREATE OR REPLACE FUNCTION aggregate_daily_chat_usage(target_date date DEFAULT CURRENT_DATE)
RETURNS void AS $$
BEGIN
  -- 全体集計（term_id = NULL）
  INSERT INTO chat_usage (date, term_id, total_tokens, message_count, user_count, model)
  SELECT 
    target_date,
    NULL as term_id,
    COUNT(*) * 100 as estimated_tokens, -- 仮の計算（実際のトークン数がない場合）
    COUNT(*) as message_count,
    COUNT(DISTINCT user_id) as user_count,
    model
  FROM chat_history
  WHERE DATE(message_timestamp) = target_date
    AND role = 'assistant'
  GROUP BY model
  ON CONFLICT (date, term_id, model) DO UPDATE SET
    total_tokens = EXCLUDED.total_tokens,
    message_count = EXCLUDED.message_count,
    user_count = EXCLUDED.user_count;

  -- 期別集計
  INSERT INTO chat_usage (date, term_id, total_tokens, message_count, user_count, model)
  SELECT 
    target_date,
    p.term_id,
    COUNT(*) * 100 as estimated_tokens,
    COUNT(*) as message_count,
    COUNT(DISTINCT ch.user_id) as user_count,
    ch.model
  FROM chat_history ch
  JOIN profiles p ON ch.user_id = p.id
  WHERE DATE(ch.message_timestamp) = target_date
    AND ch.role = 'assistant'
    AND p.term_id IS NOT NULL
  GROUP BY p.term_id, ch.model
  ON CONFLICT (date, term_id, model) DO UPDATE SET
    total_tokens = EXCLUDED.total_tokens,
    message_count = EXCLUDED.message_count,
    user_count = EXCLUDED.user_count;
END;
$$ LANGUAGE plpgsql;