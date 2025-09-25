/*
  # Add task_sheets table

  1. New Tables
    - `task_sheets`
      - `id` (uuid, primary key)
      - `user_id` (uuid) - References profiles table
      - `sheet_id` (text) - Google Spreadsheet ID
      - `sheet_url` (text) - Google Spreadsheet URL
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on task_sheets table
    - Add policies for:
      - Users can view their own sheets
      - Admins can view all sheets
*/

CREATE TABLE task_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  sheet_id text NOT NULL,
  sheet_url text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable Row Level Security
ALTER TABLE task_sheets ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own sheets"
  ON task_sheets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all sheets"
  ON task_sheets FOR SELECT
  TO authenticated
  USING (auth.jwt() ->> 'role' = 'admin');

-- Add trigger for updated_at
CREATE TRIGGER update_task_sheets_updated_at
  BEFORE UPDATE ON task_sheets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create indexes
CREATE INDEX idx_task_sheets_user_id ON task_sheets(user_id);