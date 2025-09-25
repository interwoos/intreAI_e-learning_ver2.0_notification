/*
  # Add manual_link column to terms table

  1. Changes to existing tables
    - Add `manual_link` (text) column to terms table
    - This column stores the manual link URL for each term

  2. Data Migration
    - Set default empty string for existing records
    - Ensure backward compatibility

  3. Performance
    - Add index for manual_link searches if needed
*/

-- Add manual_link column to terms table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'terms' AND column_name = 'manual_link'
  ) THEN
    ALTER TABLE terms ADD COLUMN manual_link text DEFAULT '';
  END IF;
END $$;

-- Update existing records to have empty manual_link if null
UPDATE terms 
SET manual_link = '' 
WHERE manual_link IS NULL;

-- Add index for manual_link searches (optional)
CREATE INDEX IF NOT EXISTS idx_terms_manual_link 
ON terms(manual_link) 
WHERE manual_link != '';

-- Verify the column was added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'terms' AND column_name = 'manual_link';