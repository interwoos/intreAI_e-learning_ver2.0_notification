/*
  # 事前課題管理とチャットプロンプトプリセット機能のテーブル作成

  1. New Tables
    - `pre_assignments` - 事前課題管理テーブル
      - 複合主キー: term_id + assignment_id
      - 課題タイトル・説明・チャットプロンプト設定を管理
    
    - `prompt_presets` - プリセット保存用テーブル
      - プリセット名・チャットプロンプト設定を保存
      - ユーザー別管理（将来拡張対応）

  2. Security
    - RLS有効化
    - 管理者・ユーザー別アクセス制御

  3. Performance
    - 適切なインデックス設定
    - リアルタイム更新対応
*/

-- 事前課題管理テーブル
CREATE TABLE IF NOT EXISTS pre_assignments (
  term_id uuid NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  assignment_id text NOT NULL,
  title text DEFAULT '',
  description text DEFAULT '',
  ai_name text DEFAULT '',
  ai_description text DEFAULT '',
  initial_message text DEFAULT '',
  system_instruction text DEFAULT '',
  knowledge_base text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (term_id, assignment_id)
);

-- プリセット保存用テーブル
CREATE TABLE IF NOT EXISTS prompt_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  ai_name text DEFAULT '',
  ai_description text DEFAULT '',
  initial_message text DEFAULT '',
  system_instruction text DEFAULT '',
  knowledge_base text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS有効化
ALTER TABLE pre_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_presets ENABLE ROW LEVEL SECURITY;

-- pre_assignments のポリシー
CREATE POLICY "管理者は全ての事前課題を管理可能"
  ON pre_assignments FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "認証ユーザーは事前課題を閲覧可能"
  ON pre_assignments FOR SELECT
  TO authenticated
  USING (true);

-- prompt_presets のポリシー
CREATE POLICY "ユーザーは自分のプリセットを管理可能"
  ON prompt_presets FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "管理者は全てのプリセットを閲覧可能"
  ON prompt_presets FOR SELECT
  TO authenticated
  USING (auth.jwt() ->> 'role' = 'admin');

-- updated_at 自動更新トリガー
CREATE TRIGGER update_pre_assignments_updated_at
  BEFORE UPDATE ON pre_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_prompt_presets_updated_at
  BEFORE UPDATE ON prompt_presets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- パフォーマンス向上のためのインデックス
CREATE INDEX idx_pre_assignments_term_id ON pre_assignments(term_id);
CREATE INDEX idx_pre_assignments_assignment_id ON pre_assignments(assignment_id);
CREATE INDEX idx_pre_assignments_updated_at ON pre_assignments(updated_at DESC);

CREATE INDEX idx_prompt_presets_user_id ON prompt_presets(user_id);
CREATE INDEX idx_prompt_presets_name ON prompt_presets(name);
CREATE INDEX idx_prompt_presets_created_at ON prompt_presets(created_at DESC);

-- 初期データ挿入用関数（課題IDの自動生成）
CREATE OR REPLACE FUNCTION initialize_pre_assignments_for_term(target_term_id uuid)
RETURNS void AS $$
DECLARE
  assignment_ids text[] := ARRAY[
    '1-0', '1-1', '1-2',
    '2-0', '2-1', '2-2', '2-3', '2-4',
    '3-0', '3-1', '3-2', '3-3',
    '4-0',
    '5-0', '5-1', '5-2', '5-3', '5-4',
    '6-0', '6-1', '6-2', '6-3',
    '7-0', '7-1', '7-2', '7-3',
    '8-0', '8-1',
    '9-0'
  ];
  assignment_id text;
BEGIN
  FOREACH assignment_id IN ARRAY assignment_ids
  LOOP
    INSERT INTO pre_assignments (term_id, assignment_id)
    VALUES (target_term_id, assignment_id)
    ON CONFLICT (term_id, assignment_id) DO NOTHING;
  END LOOP;
END;
$$ LANGUAGE plpgsql;