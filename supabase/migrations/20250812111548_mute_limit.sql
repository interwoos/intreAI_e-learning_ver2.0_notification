/*
  # Fix PostgreSQL syntax error in token tracking

  1. Fix syntax errors
    - Replace `::date` casting with `DATE()` function
    - Use proper PostgreSQL date functions
    - Fix index creation syntax

  2. Add correct token tracking columns
    - Add missing columns to chat_history table
    - Create proper indexes for token aggregation

  3. Performance optimization
    - Use DATE() function for date-based indexes
    - Optimize for daily/monthly reporting queries
*/

-- Add token tracking columns to chat_history table if they don't exist
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

-- Fix: Use DATE() function instead of ::date casting
CREATE INDEX IF NOT EXISTS idx_chat_history_tokens_date 
ON chat_history(DATE(message_timestamp), total_tokens);

CREATE INDEX IF NOT EXISTS idx_chat_history_tokens_user_date 
ON chat_history(user_id, DATE(message_timestamp), total_tokens);

CREATE INDEX IF NOT EXISTS idx_chat_history_tokens_model 
ON chat_history(model, total_tokens) WHERE model IS NOT NULL;

-- Fix: Update daily token usage view with proper DATE() function
DROP VIEW IF EXISTS daily_token_usage;
CREATE OR REPLACE VIEW daily_token_usage AS
SELECT 
  DATE(message_timestamp) as usage_date,
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
GROUP BY DATE(message_timestamp), model
ORDER BY usage_date DESC, model;

-- Fix: Update term-based daily token usage view
DROP VIEW IF EXISTS daily_token_usage_by_term;
CREATE OR REPLACE VIEW daily_token_usage_by_term AS
SELECT 
  DATE(ch.message_timestamp) as usage_date,
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
GROUP BY DATE(ch.message_timestamp), p.term_id, t.name, ch.model
ORDER BY usage_date DESC, term_name, ch.model;