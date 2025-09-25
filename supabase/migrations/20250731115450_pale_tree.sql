-- lecturesテーブルにvideosカラムを手動追加する場合

-- 1. videosカラムを追加
ALTER TABLE lectures ADD COLUMN IF NOT EXISTS videos jsonb DEFAULT '[]'::jsonb;

-- 2. インデックスを追加（検索性能向上のため）
CREATE INDEX IF NOT EXISTS idx_lectures_videos ON lectures USING GIN (videos);

-- 3. 確認用クエリ
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'lectures' AND column_name = 'videos';

-- 4. テスト用データ挿入（確認用）
-- UPDATE lectures 
-- SET videos = '[{"title": "テスト動画", "type": "youtube", "url": "https://example.com"}]'::jsonb 
-- WHERE lecture_number = 1 AND term_id = 'your-term-id';