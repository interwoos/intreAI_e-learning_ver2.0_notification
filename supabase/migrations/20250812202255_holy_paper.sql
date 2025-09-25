/*
  # Add login_permission column to profiles table

  1. Changes to existing tables
    - Add `login_permission` (boolean) column to profiles table
    - Default value: true (ログイン許可)

  2. Security
    - 管理者のみがlogin_permissionを変更可能

  3. Performance
    - Add index for login_permission searches
*/

-- Add login_permission column to profiles table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'login_permission'
  ) THEN
    ALTER TABLE profiles ADD COLUMN login_permission boolean DEFAULT true;
  END IF;
END $$;

-- Update existing records to have login_permission = true if null
UPDATE profiles 
SET login_permission = true 
WHERE login_permission IS NULL;

-- Add index for login_permission searches
CREATE INDEX IF NOT EXISTS idx_profiles_login_permission 
ON profiles(login_permission);

-- Add policy for admin to manage login permissions
CREATE POLICY "Admins can update login permissions"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

-- Verify the column was added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'profiles' AND column_name = 'login_permission';