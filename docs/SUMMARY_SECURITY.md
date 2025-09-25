# 要約管理システム セキュリティ仕様書

## 🔐 HMAC署名トークン方式

### **概要**
- **DB不使用**: サーバーレス環境完全対応
- **署名検証**: HMAC-SHA256による改ざん検出
- **ユーザー分離**: uid検証による厳格な境界制御
- **クライアント保存**: localStorage永続化

### **🎯 セキュリティ設計**

#### **1. データ境界制御**
```typescript
// サーバー側検証（必須）
const unsealed = unsealSummary(SUMMARY_SECRET, token);
if (!unsealed || unsealed.uid !== serverAuthUid) {
  return null; // 他ユーザーのトークンは完全拒否
}
```

#### **2. 改ざん検出**
```
トークン形式: SS1.<payload>.<signature>
payload: Base64URL(JSON)
signature: Base64URL(HMAC-SHA256(secret, payload))
```

#### **3. 情報漏洩防止**
```typescript
// ログマスキング（本文出力禁止）
logLine('📑 要約更新完了:', { 
  userId: user.id.substring(0, 8) + '...', // 一部のみ
  taskId, 
  summaryLength: newSummary.length, // 長さのみ
  tokenGenerated: true
});
```

### **🔧 実装仕様**

#### **A. 環境変数**
```bash
SUMMARY_SECRET=your-secret-key-at-least-32-chars
```
- **必須**: 32文字以上推奨
- **サーバー専用**: クライアントに露出禁止
- **ローテーション**: 定期的な更新推奨

#### **B. トークン構造**
```json
{
  "v": 1,
  "uid": "user-uuid",
  "taskId": "1-0",
  "summary": "要約本文（最大8000字）",
  "ts": 1640995200000
}
```

#### **C. 送受信フロー**
```
1. クライアント: localStorage から要約トークン取得
2. リクエスト: X-Summary-Token ヘッダーで送信
3. サーバー: 署名検証 + uid/taskId一致確認
4. 処理: 要約を使用してAI応答生成
5. 更新: 新しい要約で署名トークン生成
6. レスポンス: ストリーム末尾にトークン埋め込み
7. クライアント: 新トークンをlocalStorageに保存
```

### **⚠️ セキュリティ制約**

#### **1. 絶対禁止事項**
- ❌ `user_id` をクライアントから受け取る
- ❌ 他ユーザーの `taskId` を推測参照
- ❌ 要約本文・原文をログ出力
- ❌ `SUMMARY_SECRET` をクライアントに露出

#### **2. 必須検証**
- ✅ サーバー側で `auth.uid()` 確定
- ✅ `taskId` 形式検証（正規表現）
- ✅ HMAC署名検証
- ✅ uid/taskId一致確認

#### **3. サイズ制限**
- ✅ 要約: 最大8000字でトリム
- ✅ デルタ: 最大4000字でサニタイズ
- ✅ トークン: Base64URL形式

### **🧪 テスト観点**

#### **A. セキュリティテスト**
1. **越境防止**: AユーザーのトークンをBユーザーが使用 → 拒否
2. **改ざん検出**: トークンの一部変更 → 無効化
3. **タスク境界**: 異なるtaskIdで要約混入なし

#### **B. 耐久性テスト**
1. **サーバー再起動**: 要約継続確認
2. **ブラウザ再起動**: localStorage保持確認
3. **デプロイ**: インスタンス切替後の要約継続

#### **C. パフォーマンステスト**
1. **大量要約**: 8000字制限の動作確認
2. **並行アクセス**: 複数タブでの整合性
3. **ネットワーク**: オフライン時の要約読み取り

### **📋 運用ガイド**

#### **1. 環境変数管理**
```bash
# 開発環境
SUMMARY_SECRET=dev-secret-key-32-chars-minimum

# 本番環境  
SUMMARY_SECRET=prod-secret-key-different-from-dev
```

#### **2. ログ監視**
```
正常: 📑 要約更新完了: { taskId: "1-0", summaryLength: 245 }
異常: ⚠️ 要約トークン検証失敗または不一致
```

#### **3. トラブルシューティング**
```typescript
// デバッグ用: 要約トークン一覧確認
import { listSummaryTokens } from '@/lib/summary-client';
console.log(listSummaryTokens());

// 全クリア
import { clearAllSummaryTokens } from '@/lib/summary-client';
clearAllSummaryTokens();
```

### **🎯 移行完了の確認**

#### **チェックリスト**
- [ ] `SUMMARY_SECRET` 環境変数設定
- [ ] 要約トークンの送受信動作確認
- [ ] ローカル開発での要約継続確認
- [ ] 他ユーザーアクセス拒否確認
- [ ] ログに本文が出力されないことを確認
- [ ] 既存チャット機能の正常動作確認

この実装により、**DB不使用**で**サーバーレス完全対応**の要約管理システムが完成します。