/*
  # Add subtitle column to lecture_videos table

  1. Changes to existing tables
    - Add `subtitle` (text) column to lecture_videos table
    - Add index for subtitle search functionality

  2. Data Migration
    - Set default empty string for existing records
    - Ensure backward compatibility

  3. Performance
    - Add index for subtitle searches if needed
*/

-- Add subtitle column to lecture_videos table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lecture_videos' AND column_name = 'subtitle'
  ) THEN
    ALTER TABLE lecture_videos ADD COLUMN subtitle text DEFAULT '';
  END IF;
END $$;

-- Update existing records to have empty subtitle if null
UPDATE lecture_videos 
SET subtitle = '' 
WHERE subtitle IS NULL;

-- Add index for subtitle searches (optional, for future search functionality)
CREATE INDEX IF NOT EXISTS idx_lecture_videos_subtitle 
ON lecture_videos(subtitle) 
WHERE subtitle != '';

-- Verify the column was added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'lecture_videos' AND column_name = 'subtitle';