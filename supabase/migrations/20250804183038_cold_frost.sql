/*
  # Add UNIQUE constraint to profiles.email

  1. Changes to existing tables
    - Add UNIQUE constraint to `email` column in `profiles` table
    - This resolves the "ON CONFLICT specification" error when inserting users

  2. Data integrity
    - Ensures no duplicate email addresses in the system
    - Enables proper upsert operations with ON CONFLICT

  3. Performance
    - UNIQUE constraint automatically creates an index for faster lookups
*/

-- Add UNIQUE constraint to email column in profiles table
DO $$
BEGIN
  -- Check if the constraint already exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'profiles_email_unique' 
    AND table_name = 'profiles'
  ) THEN
    -- Add UNIQUE constraint
    ALTER TABLE profiles ADD CONSTRAINT profiles_email_unique UNIQUE (email);
    
    -- Log the change
    RAISE NOTICE '✅ UNIQUE constraint added to profiles.email';
  ELSE
    RAISE NOTICE '⚠️ UNIQUE constraint already exists on profiles.email';
  END IF;
END $$;

-- Verify the constraint was added
SELECT 
  constraint_name, 
  constraint_type,
  table_name,
  column_name
FROM information_schema.constraint_column_usage 
WHERE table_name = 'profiles' AND column_name = 'email';