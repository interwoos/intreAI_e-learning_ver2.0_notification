/*
  # チャット履歴管理テーブル

  1. New Tables
    - `chat_history`
      - `id` (uuid, primary key)
      - `user_id` (uuid) - ユーザーID
      - `task_id` (text) - タスクID（課題用）または 'general-support'（万能AI用）
      - `course_id` (integer) - 講義ID（課題用のみ、万能AIの場合はNULL）
      - `role` (text) - 'user' または 'assistant'
      - `content` (text) - メッセージ内容
      - `model` (text) - 使用したAIモデル（assistant メッセージのみ）
      - `message_timestamp` (timestamptz) - メッセージ送信時刻
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on chat_history table
    - Add policies for:
      - Users can view and manage their own chat history
      - Admins can view all chat history

  3. Performance
    - Add indexes for efficient querying
    - Optimize for user_id + task_id + message_timestamp queries
*/

-- チャット履歴テーブル
CREATE TABLE IF NOT EXISTS chat_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  task_id text NOT NULL,
  course_id integer,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  model text,
  message_timestamp timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- RLS有効化
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;

-- ポリシー作成
CREATE POLICY "Users can view own chat history"
  ON chat_history FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own chat history"
  ON chat_history FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own chat history"
  ON chat_history FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own chat history"
  ON chat_history FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all chat history"
  ON chat_history FOR SELECT
  TO authenticated
  USING (auth.jwt() ->> 'role' = 'admin');

-- パフォーマンス向上のためのインデックス
CREATE INDEX idx_chat_history_user_task ON chat_history(user_id, task_id);
CREATE INDEX idx_chat_history_user_task_timestamp ON chat_history(user_id, task_id, message_timestamp DESC);
CREATE INDEX idx_chat_history_timestamp ON chat_history(message_timestamp DESC);
CREATE INDEX idx_chat_history_course_id ON chat_history(course_id) WHERE course_id IS NOT NULL;

-- チャット履歴管理用の便利関数
CREATE OR REPLACE FUNCTION get_chat_history(
  target_user_id uuid,
  target_task_id text,
  target_course_id integer DEFAULT NULL,
  limit_count integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  role text,
  content text,
  model text,
  message_timestamp timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ch.id,
    ch.role,
    ch.content,
    ch.model,
    ch.message_timestamp
  FROM chat_history ch
  WHERE ch.user_id = target_user_id 
    AND ch.task_id = target_task_id
    AND (target_course_id IS NULL OR ch.course_id = target_course_id)
  ORDER BY ch.message_timestamp ASC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- チャット履歴削除用の便利関数
CREATE OR REPLACE FUNCTION clear_chat_history(
  target_user_id uuid,
  target_task_id text,
  target_course_id integer DEFAULT NULL
)
RETURNS integer AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM chat_history
  WHERE user_id = target_user_id 
    AND task_id = target_task_id
    AND (target_course_id IS NULL OR course_id = target_course_id);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;