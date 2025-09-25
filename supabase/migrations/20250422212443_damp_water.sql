/*
  # User Assignments Schema

  1. New Tables
    - `user_assignments`
      - `user_id` (uuid, references profiles)
      - `lecture_id` (integer, references lectures)
      - `task_id` (text)
      - `sheet_link` (text)
      - `completed` (boolean)
      - `completed_at` (timestamptz)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on user_assignments table
    - Add policies for:
      - Users can view and update their own assignments
      - Admins can view and update all assignments

  3. Triggers
    - Add updated_at trigger
*/

-- Create user_assignments table
CREATE TABLE IF NOT EXISTS public.user_assignments (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lecture_id integer NOT NULL REFERENCES public.lectures(id) ON DELETE CASCADE,
  task_id text NOT NULL,
  sheet_link text NOT NULL DEFAULT '',
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lecture_id, task_id)
);

-- Enable Row Level Security
ALTER TABLE public.user_assignments ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own assignments"
  ON public.user_assignments FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own assignments"
  ON public.user_assignments FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all assignments"
  ON public.user_assignments FOR SELECT
  TO authenticated
  USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Admins can update all assignments"
  ON public.user_assignments FOR UPDATE
  TO authenticated
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_assignments_updated_at
  BEFORE UPDATE ON public.user_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes
CREATE INDEX idx_user_assignments_user_id ON public.user_assignments(user_id);
CREATE INDEX idx_user_assignments_lecture_id ON public.user_assignments(lecture_id);
CREATE INDEX idx_user_assignments_completed ON public.user_assignments(completed);

-- Create function to initialize assignments for new users
CREATE OR REPLACE FUNCTION initialize_user_assignments()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert assignments for all lectures and tasks
  INSERT INTO user_assignments (user_id, lecture_id, task_id, sheet_link)
  SELECT 
    NEW.id,
    l.id,
    t.id,
    '' -- Sheet link will be set when the sheet is created
  FROM lectures l
  CROSS JOIN (
    SELECT unnest(ARRAY[
      '1-0', '1-1', '1-2',
      '2-0', '2-1', '2-2', '2-3', '2-4',
      '3-0', '3-1', '3-2', '3-3',
      '4-0',
      '5-0', '5-1', '5-2', '5-3', '5-4',
      '6-0', '6-1', '6-2', '6-3',
      '7-0', '7-1', '7-2', '7-3',
      '8-0', '8-1'
    ]) AS id
  ) t
  WHERE l.term_id = NEW.term_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to create assignments when a new user is created
CREATE TRIGGER on_profile_created
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION initialize_user_assignments();