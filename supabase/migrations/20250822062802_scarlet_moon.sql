/*
  # Add tab_title column for editable tab names

  1. Changes to existing tables
    - Add `tab_title` (text) column to pre_assignments table
    - This allows admins to customize tab names independently from Google Sheets
    - Google Sheets derived `title` remains as read-only reference

  2. Data Migration
    - Set default empty string for existing records
    - Frontend will use tab_title || title priority for display

  3. Performance
    - Add index for tab_title searches
    - Optimize for admin editing operations

  4. Display Logic
    - Priority: tab_title (admin edited) > title (Google Sheets) > fallback
*/

-- Add tab_title column to pre_assignments table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pre_assignments' AND column_name = 'tab_title'
  ) THEN
    ALTER TABLE pre_assignments ADD COLUMN tab_title text DEFAULT '';
    RAISE NOTICE '✅ tab_title カラムを追加しました';
  ELSE
    RAISE NOTICE '⚠️ tab_title カラムは既に存在します';
  END IF;
END $$;

-- Update existing records to have empty tab_title
UPDATE pre_assignments 
SET tab_title = '' 
WHERE tab_title IS NULL;

-- Add index for tab_title searches
CREATE INDEX IF NOT EXISTS idx_pre_assignments_tab_title 
ON pre_assignments(tab_title) 
WHERE tab_title != '';

-- Verify the column was added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'pre_assignments' AND column_name = 'tab_title';

-- Debug: Show current pre_assignments structure
DO $$
DECLARE
  assignment_record RECORD;
BEGIN
  RAISE NOTICE '📋 現在の pre_assignments テーブル構造:';
  
  FOR assignment_record IN 
    SELECT assignment_id, title, tab_title, edit_title
    FROM pre_assignments 
    ORDER BY assignment_id 
    LIMIT 5
  LOOP
    RAISE NOTICE '  - %: title=%, tab_title=%, edit_title=%', 
      assignment_record.assignment_id,
      assignment_record.title,
      assignment_record.tab_title,
      assignment_record.edit_title;
  END LOOP;
  
  RAISE NOTICE '✅ tab_title カラム追加完了';
END $$;