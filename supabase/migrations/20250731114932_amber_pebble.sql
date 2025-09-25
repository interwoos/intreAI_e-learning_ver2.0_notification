/*
  # Add videos column to lectures table

  1. Changes to existing tables
    - Add `videos` (jsonb) column to lectures table for storing video data

  2. Structure
    - videos: Array of video objects with title, subtitle, type, url
    - Example: [{"title": "Video A", "type": "upload", "url": "..."}]
*/

-- Add videos column to lectures table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lectures' AND column_name = 'videos'
  ) THEN
    ALTER TABLE lectures ADD COLUMN videos jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Create index for videos column
CREATE INDEX IF NOT EXISTS idx_lectures_videos ON lectures USING GIN (videos);