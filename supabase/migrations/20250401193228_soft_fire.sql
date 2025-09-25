/*
  # Add announcements table

  1. New Tables
    - `announcements`
      - `id` (uuid, primary key)
      - `title` (text) - アナウンスのタイトル
      - `content` (text) - アナウンスの内容
      - `term_id` (uuid, references terms) - 対象の期（NULLの場合は全期向け）
      - `created_by` (uuid, references auth.users) - 作成者
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on announcements table
    - Add policies for:
      - Admins can create and update announcements
      - Students can view announcements for their term or all terms
*/

-- Create announcements table
CREATE TABLE announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  term_id uuid REFERENCES terms(id),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admins can manage announcements"
  ON announcements FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Students can view announcements for their term or all terms"
  ON announcements FOR SELECT
  TO authenticated
  USING (
    term_id IS NULL OR
    term_id IN (
      SELECT term_id 
      FROM profiles 
      WHERE id = auth.uid()
    )
  );

-- Add trigger for updated_at
CREATE TRIGGER update_announcements_updated_at
  BEFORE UPDATE ON announcements
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create indexes
CREATE INDEX idx_announcements_term_id ON announcements(term_id);
CREATE INDEX idx_announcements_created_at ON announcements(created_at DESC);