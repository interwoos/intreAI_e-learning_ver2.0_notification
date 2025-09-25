/*
  # 再提出システムの実装

  1. Changes to existing tables
    - Add resubmission-related columns to user_assignments table
    - `resubmission_count` (integer) - 再提出回数
    - `pending_resubmission` (boolean) - 再提出承認待ち状態
    - `admin_approved_at` (timestamptz) - 管理者承認日時
    - `admin_approved_by` (uuid) - 承認した管理者ID

  2. Security
    - Update existing RLS policies to handle resubmission states

  3. Functions
    - Add function to handle resubmission workflow
*/

-- Add resubmission columns to user_assignments table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_assignments' AND column_name = 'resubmission_count'
  ) THEN
    ALTER TABLE user_assignments ADD COLUMN resubmission_count integer DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_assignments' AND column_name = 'pending_resubmission'
  ) THEN
    ALTER TABLE user_assignments ADD COLUMN pending_resubmission boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_assignments' AND column_name = 'admin_approved_at'
  ) THEN
    ALTER TABLE user_assignments ADD COLUMN admin_approved_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_assignments' AND column_name = 'admin_approved_by'
  ) THEN
    ALTER TABLE user_assignments ADD COLUMN admin_approved_by uuid REFERENCES auth.users(id);
  END IF;
END $$;

-- Update existing records to have default values
UPDATE user_assignments 
SET resubmission_count = 0 
WHERE resubmission_count IS NULL;

UPDATE user_assignments 
SET pending_resubmission = false 
WHERE pending_resubmission IS NULL;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_assignments_pending_resubmission 
ON user_assignments(pending_resubmission) 
WHERE pending_resubmission = true;

CREATE INDEX IF NOT EXISTS idx_user_assignments_resubmission_count 
ON user_assignments(resubmission_count) 
WHERE resubmission_count > 0;

-- Function to handle resubmission workflow
CREATE OR REPLACE FUNCTION handle_task_resubmission(
  target_user_id uuid,
  target_task_id text
)
RETURNS jsonb AS $$
DECLARE
  assignment_record user_assignments%ROWTYPE;
  result jsonb;
BEGIN
  -- Get current assignment record
  SELECT * INTO assignment_record
  FROM user_assignments
  WHERE user_id = target_user_id 
    AND task_id = target_task_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Assignment not found'
    );
  END IF;

  -- If first submission, mark as completed
  IF assignment_record.resubmission_count = 0 AND NOT assignment_record.completed THEN
    UPDATE user_assignments
    SET 
      completed = true,
      completed_at = now(),
      resubmission_count = 1
    WHERE user_id = target_user_id 
      AND task_id = target_task_id;
    
    RETURN jsonb_build_object(
      'success', true,
      'action', 'first_submission',
      'message', '課題を提出しました'
    );
  END IF;

  -- If already completed, toggle to resubmission pending
  IF assignment_record.completed AND NOT assignment_record.pending_resubmission THEN
    UPDATE user_assignments
    SET 
      pending_resubmission = true,
      resubmission_count = assignment_record.resubmission_count + 1,
      admin_approved_at = NULL,
      admin_approved_by = NULL
    WHERE user_id = target_user_id 
      AND task_id = target_task_id;
    
    RETURN jsonb_build_object(
      'success', true,
      'action', 'resubmission_requested',
      'message', '再提出を申請しました。管理者の承認をお待ちください。'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', false,
    'error', 'Invalid state for resubmission'
  );
END;
$$ LANGUAGE plpgsql;

-- Function for admin approval
CREATE OR REPLACE FUNCTION approve_resubmission(
  target_user_id uuid,
  target_task_id text,
  approver_id uuid
)
RETURNS jsonb AS $$
BEGIN
  UPDATE user_assignments
  SET 
    pending_resubmission = false,
    admin_approved_at = now(),
    admin_approved_by = approver_id
  WHERE user_id = target_user_id 
    AND task_id = target_task_id
    AND pending_resubmission = true;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', '再提出を承認しました'
    );
  ELSE
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No pending resubmission found'
    );
  END IF;
END;
$$ LANGUAGE plpgsql;