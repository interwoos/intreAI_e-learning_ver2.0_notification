/*
  # Remove tab_title feature and restore original state

  1. Changes to existing tables
    - Remove `tab_title` column from pre_assignments table
    - Clean up any related indexes

  2. Data Migration
    - Safely remove the column without affecting other data
    - Ensure backward compatibility

  3. Cleanup
    - Remove any tab_title related indexes
    - Restore original table structure
*/

-- Remove tab_title column from pre_assignments table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pre_assignments' AND column_name = 'tab_title'
  ) THEN
    ALTER TABLE pre_assignments DROP COLUMN tab_title;
    RAISE NOTICE '✅ tab_title カラムを削除しました';
  ELSE
    RAISE NOTICE '⚠️ tab_title カラムは存在しません';
  END IF;
END $$;

-- Remove related indexes
DROP INDEX IF EXISTS idx_pre_assignments_tab_title;

-- Verify the column was removed
DO $$
DECLARE
  column_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pre_assignments' AND column_name = 'tab_title'
  ) INTO column_exists;
  
  IF column_exists THEN
    RAISE NOTICE '❌ tab_title カラムの削除に失敗しました';
  ELSE
    RAISE NOTICE '✅ tab_title カラムの削除が完了しました';
  END IF;
END $$;

-- Show current pre_assignments table structure for verification
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'pre_assignments' 
ORDER BY ordinal_position;