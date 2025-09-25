/*
  # Email Processing Status Enhancement

  1. Enum Updates
    - Add 'processing' status to email_status enum
    - Enables proper job locking for concurrent workers

  2. New Columns
    - `picked_at` (timestamptz) - When job was picked up by worker
    - `sent_at` (timestamptz) - When email was successfully sent
    - `failed_at` (timestamptz) - When email sending failed
    - `error_message` (text) - Detailed error information

  3. Performance Indexes
    - Index for pending emails ordered by creation time
    - Index for processing emails ordered by pick time
    - Optimized for worker job picking

  4. Functions
    - `pick_email_job()` - Atomic job picking with SKIP LOCKED
    - Prevents race conditions in concurrent workers
*/

-- Add 'processing' status to email_status enum
ALTER TYPE email_status ADD VALUE IF NOT EXISTS 'processing';

-- Add operational columns to email_queue table
ALTER TABLE email_queue 
  ADD COLUMN IF NOT EXISTS picked_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_message text;

-- Create performance indexes for worker operations
CREATE INDEX IF NOT EXISTS idx_email_queue_pending_created
  ON email_queue (created_at) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_email_queue_processing_picked
  ON email_queue (picked_at) WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS idx_email_queue_status_timestamp
  ON email_queue (status, created_at);

-- Atomic job picking function with proper locking
CREATE OR REPLACE FUNCTION pick_email_job()
RETURNS email_queue
LANGUAGE plpgsql
AS $$
DECLARE
  job email_queue;
BEGIN
  -- Pick oldest pending email and lock it atomically
  WITH cte AS (
    SELECT id
    FROM email_queue
    WHERE status = 'pending'
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE email_queue e
  SET status = 'processing',
      picked_at = now()
  FROM cte
  WHERE e.id = cte.id
  RETURNING e.* INTO job;

  RETURN job;
END;
$$;

-- Helper function to mark email as sent
CREATE OR REPLACE FUNCTION mark_email_sent(email_id uuid)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE email_queue
  SET status = 'sent',
      sent_at = now(),
      error_message = NULL
  WHERE id = email_id;
  
  RETURN FOUND;
END;
$$;

-- Helper function to mark email as failed
CREATE OR REPLACE FUNCTION mark_email_failed(email_id uuid, error_msg text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE email_queue
  SET status = 'failed',
      failed_at = now(),
      error_message = error_msg
  WHERE id = email_id;
  
  RETURN FOUND;
END;
$$;

-- Function to reset stuck processing jobs (older than 10 minutes)
CREATE OR REPLACE FUNCTION reset_stuck_email_jobs()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  reset_count integer;
BEGIN
  UPDATE email_queue
  SET status = 'pending',
      picked_at = NULL
  WHERE status = 'processing'
    AND picked_at < now() - INTERVAL '10 minutes';
  
  GET DIAGNOSTICS reset_count = ROW_COUNT;
  RETURN reset_count;
END;
$$;

-- View for email queue monitoring
CREATE OR REPLACE VIEW email_queue_stats AS
SELECT 
  status,
  COUNT(*) as count,
  MIN(created_at) as oldest,
  MAX(created_at) as newest,
  AVG(EXTRACT(EPOCH FROM (COALESCE(sent_at, failed_at, now()) - created_at))) as avg_processing_seconds
FROM email_queue
GROUP BY status
ORDER BY 
  CASE status 
    WHEN 'pending' THEN 1
    WHEN 'processing' THEN 2
    WHEN 'sent' THEN 3
    WHEN 'failed' THEN 4
  END;