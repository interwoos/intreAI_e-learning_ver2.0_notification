/*
  # Cleanup existing fixed lecture data

  1. Remove existing data
    - Delete all existing terms and related data
    - Clean up user_assignments
    - Clean up lectures
    - Clean up announcements

  2. Add lecture_config column to terms
    - JSONB column to store dynamic lecture structure
*/

-- Delete all existing data (cascading deletes will handle related records)
DELETE FROM announcements;
DELETE FROM user_assignments;
DELETE FROM lectures;
DELETE FROM terms;

-- Add lecture_config column to terms table
ALTER TABLE terms ADD COLUMN IF NOT EXISTS lecture_config JSONB;
ALTER TABLE terms ADD COLUMN IF NOT EXISTS template_link TEXT;
ALTER TABLE terms ADD COLUMN IF NOT EXISTS folder_link TEXT;

-- Create index for lecture_config
CREATE INDEX IF NOT EXISTS idx_terms_lecture_config ON terms USING GIN (lecture_config);