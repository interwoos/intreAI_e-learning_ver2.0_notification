/*
  # Add terms table

  1. New Tables
    - `terms`
      - `id` (uuid, primary key)
      - `name` (text) - 期の名前（例：第1期）
      - `term_number` (integer) - 期番号
      - `start_date` (date) - 開始日
      - `end_date` (date) - 終了日
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Changes to existing tables
    - Add `term_id` to profiles table

  3. Security
    - Enable RLS on terms table
    - Add policies for admin access
*/

-- Create terms table
CREATE TABLE terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  term_number integer NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add term_id to profiles
ALTER TABLE profiles ADD COLUMN term_id uuid REFERENCES terms(id);

-- Enable RLS
ALTER TABLE terms ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Terms are viewable by all authenticated users"
  ON terms FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Terms are modifiable by admins only"
  ON terms FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

-- Add trigger for updated_at
CREATE TRIGGER update_terms_updated_at
  BEFORE UPDATE ON terms
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create indexes
CREATE INDEX idx_terms_term_number ON terms(term_number);
CREATE INDEX idx_profiles_term_id ON profiles(term_id);