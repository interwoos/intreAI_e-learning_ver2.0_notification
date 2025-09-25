/*
  # Create lecture_videos table for improved video management

  1. New Tables
    - `lecture_videos`
      - `id` (integer, primary key, auto-increment)
      - `lecture_number` (integer) - 講義番号
      - `term_id` (uuid) - 期ID（termsテーブル参照）
      - `title` (text) - 動画タイトル
      - `original_file_name` (text) - 元のファイル名
      - `url` (text) - 公開URL
      - `created_at` (timestamptz) - 作成日時

  2. Security
    - Enable RLS on lecture_videos table
    - Add policies for authenticated users and admins
*/

-- Create lecture_videos table
CREATE TABLE IF NOT EXISTS lecture_videos (
  id SERIAL PRIMARY KEY,
  lecture_number integer NOT NULL,
  term_id uuid NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  title text NOT NULL,
  original_file_name text,
  url text,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE lecture_videos ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can view lecture videos"
  ON lecture_videos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage lecture videos"
  ON lecture_videos FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

-- Create indexes
CREATE INDEX idx_lecture_videos_lecture_number ON lecture_videos(lecture_number);
CREATE INDEX idx_lecture_videos_term_id ON lecture_videos(term_id);
CREATE INDEX idx_lecture_videos_created_at ON lecture_videos(created_at DESC);