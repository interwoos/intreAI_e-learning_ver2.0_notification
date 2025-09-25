# プロジェクト環境設定

## Node.js バージョン要件

このプロジェクトは **Node.js v16** での動作を推奨します。

### 推奨セットアップ手順

1. **Node.js v16のインストール（推奨）**
   ```bash
   # nvmを使用している場合
   nvm install 16
   nvm use 16
   
   # または直接Node.js v16をインストール
   # https://nodejs.org/en/download/releases/
   ```

2. **依存関係のインストール**
   ```bash
   npm install
   ```

3. **環境変数の設定**
   ```bash
   # .env ファイルを作成し、以下を設定
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
   OPENAI_API_KEY=your_openai_key
   
   # メール送信設定
   RESEND_API_KEY=your_resend_api_key
   RESEND_FROM_EMAIL=noreply@yourdomain.com
   
   # 検証モード設定（任意）
   EMAIL_TEST_MODE=true
   EMAIL_TEST_ADDRESSES=test1@example.com,test2@example.com
   
   NODE_OPTIONS=--openssl-legacy-provider
   ```

4. **開発サーバーの起動**
   ```bash
   npm run dev
   ```

## トラブルシューティング

### OpenSSL エラーが発生する場合（重要）

**エラー例:**
```
Error: error:1E08010C:DECODER routines::unsupported
```

**解決方法（優先順位順）:**

1. **Node.js v16を使用（最も推奨）**
   ```bash
   # nvmがインストールされていない場合は先にインストール
   # macOS/Linux: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
   # Windows: https://github.com/coreybutler/nvm-windows
   
   # Node.js v16をインストール・使用
   nvm use 16
   npm run dev
   ```

2. **Node.js v17以降を使用する場合（フォールバック）**
   ```bash
   # package.jsonのdevスクリプトに既に設定済み
   npm run dev
   ```

3. **環境変数で指定する場合**
   ```bash
   # .envファイルに追加
   NODE_OPTIONS=--openssl-legacy-provider
   ```

### Google Sheets API エラーの場合

- `GOOGLE_SERVICE_ACCOUNT_KEY`が正しく設定されているか確認
- サービスアカウントにSheets API、Drive APIの権限があるか確認
- スプレッドシートとフォルダが適切に共有されているか確認

### 通知システムの検証モード

**検証用メール送信設定:**
```bash
# 検証モードを有効化
EMAIL_TEST_MODE=true

# 検証用メールアドレス（カンマ区切りで複数指定可能）
EMAIL_TEST_ADDRESSES=test@example.com,admin@example.com
```

**動作:**
- `EMAIL_TEST_MODE=true` の場合、全てのメールが `EMAIL_TEST_ADDRESSES` に送信
- 元の送信先は `metadata.original_email` に記録
- 本番運用時は `EMAIL_TEST_MODE=false` または未設定にする

## 技術スタック

- **Node.js**: v16 (推奨)
- **Next.js**: 13.5.1
- **React**: 18.2.0
- **TypeScript**: 5.2.2
- **Supabase**: 2.39.7
- **Google APIs**: 105.0.0