/*
  # lecture_videosテーブルの最適化

  1. テーブル構造の改善
    - 主キー: id (UUID) - 各動画の一意識別子
    - 外部キー: term_id (UUID) - 期への参照
    - 講義識別: lecture_number (integer) - 講義番号
    - 動画順序: display_order (integer) - 表示順序管理

  2. インデックス最適化
    - 複合インデックス: (term_id, lecture_number) - 検索高速化
    - 順序インデックス: (term_id, lecture_number, display_order) - 表示順序
    - 作成日インデックス: (created_at) - 時系列検索

  3. 制約とセキュリティ
    - RLS有効化
    - 適切なポリシー設定
    - データ整合性制約
*/

-- 既存のlecture_videosテーブルを最適化
-- 注意: 既存データがある場合は事前にバックアップを取ってください

-- display_orderカラムを追加（動画の表示順序管理）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lecture_videos' AND column_name = 'display_order'
  ) THEN
    ALTER TABLE lecture_videos ADD COLUMN display_order integer DEFAULT 1;
  END IF;
END $$;

-- 既存データのdisplay_orderを設定
UPDATE lecture_videos 
SET display_order = ROW_NUMBER() OVER (
  PARTITION BY term_id, lecture_number 
  ORDER BY created_at
)
WHERE display_order IS NULL OR display_order = 1;

-- 検索高速化のための複合インデックス
CREATE INDEX IF NOT EXISTS idx_lecture_videos_term_lecture 
ON lecture_videos(term_id, lecture_number);

-- 表示順序管理のための複合インデックス
CREATE INDEX IF NOT EXISTS idx_lecture_videos_term_lecture_order 
ON lecture_videos(term_id, lecture_number, display_order);

-- 時系列検索用インデックス（既存）
CREATE INDEX IF NOT EXISTS idx_lecture_videos_created_at 
ON lecture_videos(created_at DESC);

-- 動画タイトル検索用インデックス
CREATE INDEX IF NOT EXISTS idx_lecture_videos_title 
ON lecture_videos(title);

-- 同一期・同一講義内での表示順序の重複を防ぐ一意制約
CREATE UNIQUE INDEX IF NOT EXISTS idx_lecture_videos_unique_order 
ON lecture_videos(term_id, lecture_number, display_order);

-- RLSポリシーの最適化（既存ポリシーがある場合は更新）
DROP POLICY IF EXISTS "Authenticated users can view lecture videos" ON lecture_videos;
DROP POLICY IF EXISTS "Admins can manage lecture videos" ON lecture_videos;

-- 認証ユーザーは全ての動画を閲覧可能
CREATE POLICY "Authenticated users can view lecture videos"
  ON lecture_videos FOR SELECT
  TO authenticated
  USING (true);

-- 管理者は全ての動画を管理可能
CREATE POLICY "Admins can manage lecture videos"
  ON lecture_videos FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

-- 動画取得用の便利関数
CREATE OR REPLACE FUNCTION get_lecture_videos(
  target_term_id uuid,
  target_lecture_number integer
)
RETURNS TABLE (
  id integer,
  title text,
  url text,
  display_order integer,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    lv.id,
    lv.title,
    lv.url,
    lv.display_order,
    lv.created_at
  FROM lecture_videos lv
  WHERE lv.term_id = target_term_id 
    AND lv.lecture_number = target_lecture_number
  ORDER BY lv.display_order ASC, lv.created_at ASC;
END;
$$ LANGUAGE plpgsql;

-- 動画順序更新用の便利関数
CREATE OR REPLACE FUNCTION update_video_order(
  video_id integer,
  new_order integer
)
RETURNS boolean AS $$
DECLARE
  video_term_id uuid;
  video_lecture_number integer;
BEGIN
  -- 対象動画の期IDと講義番号を取得
  SELECT term_id, lecture_number 
  INTO video_term_id, video_lecture_number
  FROM lecture_videos 
  WHERE id = video_id;

  IF video_term_id IS NULL THEN
    RETURN false;
  END IF;

  -- 順序を更新
  UPDATE lecture_videos 
  SET display_order = new_order,
      updated_at = now()
  WHERE id = video_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql;