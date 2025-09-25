/*
  # Fix PostgreSQL IMMUTABLE function error in token tracking

  1. Fix index creation issues
    - Remove DATE() function from index expressions
    - Use date casting or expression indexes where appropriate
    - Create proper indexes for token aggregation

  2. Add correct token tracking columns
    - Ensure all token columns exist in chat_history table
    - Set proper default values

  3. Performance optimization
    - Use PostgreSQL-compatible index expressions
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

-- Fix: Use date casting instead of DATE() function for indexes
-- PostgreSQL allows date casting in indexes
CREATE INDEX IF NOT EXISTS idx_chat_history_tokens_date 
ON chat_history((message_timestamp::date), total_tokens);

CREATE INDEX IF NOT EXISTS idx_chat_history_tokens_user_date 
ON chat_history(user_id, (message_timestamp::date), total_tokens);

CREATE INDEX IF NOT EXISTS idx_chat_history_tokens_model 
ON chat_history(model, total_tokens) WHERE model IS NOT NULL;

-- Additional performance indexes for token aggregation
CREATE INDEX IF NOT EXISTS idx_chat_history_role_tokens 
ON chat_history(role, total_tokens) WHERE role = 'assistant';

CREATE INDEX IF NOT EXISTS idx_chat_history_user_role_date 
ON chat_history(user_id, role, (message_timestamp::date)) WHERE role = 'assistant';

-- Update existing records to have default token values
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

-- Create a view for daily token aggregation (without function in WHERE)
CREATE OR REPLACE VIEW daily_token_usage AS
SELECT 
  (message_timestamp::date) as usage_date,
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
GROUP BY (message_timestamp::date), model
ORDER BY usage_date DESC, model;

-- Create a view for term-based daily token aggregation
CREATE OR REPLACE VIEW daily_token_usage_by_term AS
SELECT 
  (ch.message_timestamp::date) as usage_date,
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
GROUP BY (ch.message_timestamp::date), p.term_id, t.name, ch.model
ORDER BY usage_date DESC, term_name, ch.model;