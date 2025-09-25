/*
  # Add edit_title column to pre_assignments table

  1. Changes to existing tables
    - Add `edit_title` (text) column to pre_assignments table
    - This column stores admin-edited task titles
    - `title` column remains for Google Sheets API sheet names

  2. Data Migration
    - Set default empty string for existing records
    - Ensure backward compatibility

  3. Performance
    - Add index for edit_title searches
*/

-- Add edit_title column to pre_assignments table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pre_assignments' AND column_name = 'edit_title'
  ) THEN
    ALTER TABLE pre_assignments ADD COLUMN edit_title text DEFAULT '';
  END IF;
END $$;

-- Update existing records to have empty edit_title if null
UPDATE pre_assignments 
SET edit_title = '' 
WHERE edit_title IS NULL;

-- Add index for edit_title searches
CREATE INDEX IF NOT EXISTS idx_pre_assignments_edit_title 
ON pre_assignments(edit_title) 
WHERE edit_title != '';

-- Verify the column was added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'pre_assignments' AND column_name = 'edit_title';