/*
  # Add folder_id column to profiles table

  1. Changes to existing tables
    - Add `folder_id` (text) column to profiles table for storing Google Drive folder ID
    - Add `folder_link` (text) column to profiles table for storing Google Drive folder URL

  2. Performance
    - Add index for folder_id searches
    - Add index for folder_link searches

  3. Data Migration
    - Set default empty string for existing records
    - Ensure backward compatibility
*/

-- Add folder_id and folder_link columns to profiles table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'folder_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN folder_id text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'folder_link'
  ) THEN
    ALTER TABLE profiles ADD COLUMN folder_link text DEFAULT '';
  END IF;
END $$;

-- Update existing records to have empty values if null
UPDATE profiles 
SET folder_id = '' 
WHERE folder_id IS NULL;

UPDATE profiles 
SET folder_link = '' 
WHERE folder_link IS NULL;

-- Add indexes for folder searches
CREATE INDEX IF NOT EXISTS idx_profiles_folder_id 
ON profiles(folder_id) 
WHERE folder_id != '';

CREATE INDEX IF NOT EXISTS idx_profiles_folder_link 
ON profiles(folder_link) 
WHERE folder_link != '';

-- Verify the columns were added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'profiles' AND column_name IN ('folder_id', 'folder_link');