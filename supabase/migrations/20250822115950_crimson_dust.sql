/*
  # Add custom_title column for editable lecture titles

  1. Changes to existing tables
    - Add `custom_title` (text) column to lectures table
    - This allows admins to customize lecture titles independently from lecture numbers
    - Display format: 第${lectureNumber}回講義：${custom_title}

  2. Data Migration
    - Set default empty string for existing records
    - Frontend will show custom title when available

  3. Performance
    - Add index for custom_title searches
    - Optimize for admin editing operations

  4. Display Logic
    - Format: 第${lectureNumber}回講義${custom_title ? `：${custom_title}` : ''}
*/

-- Add custom_title column to lectures table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lectures' AND column_name = 'custom_title'
  ) THEN
    ALTER TABLE lectures ADD COLUMN custom_title text DEFAULT '';
    RAISE NOTICE '✅ custom_title カラムを追加しました';
  ELSE
    RAISE NOTICE '⚠️ custom_title カラムは既に存在します';
  END IF;
END $$;

-- Update existing records to have empty custom_title
UPDATE lectures 
SET custom_title = '' 
WHERE custom_title IS NULL;

-- Add index for custom_title searches
CREATE INDEX IF NOT EXISTS idx_lectures_custom_title 
ON lectures(custom_title) 
WHERE custom_title != '';

-- Verify the column was added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'lectures' AND column_name = 'custom_title';

-- Debug: Show current lectures structure
DO $$
DECLARE
  lecture_record RECORD;
BEGIN
  RAISE NOTICE '📋 現在の lectures テーブル構造:';
  
  FOR lecture_record IN 
    SELECT lecture_number, custom_title, term_id
    FROM lectures 
    ORDER BY term_id, lecture_number 
    LIMIT 5
  LOOP
    RAISE NOTICE '  - 第%回講義: custom_title=%, term_id=%', 
      lecture_record.lecture_number,
      lecture_record.custom_title,
      lecture_record.term_id;
  END LOOP;
  
  RAISE NOTICE '✅ custom_title カラム追加完了';
END $$;