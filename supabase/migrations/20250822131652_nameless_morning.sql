@@ .. @@
   RAISE NOTICE '🗑️ 生徒削除開始: % (%)', student_record.full_name, student_record.email;

   -- 関連データの削除（外部キー制約により自動削除されるが明示的に実行）
   
   -- 1. チャット履歴削除
   DELETE FROM chat_history WHERE user_id = target_student_id;
   RAISE NOTICE '✅ チャット履歴削除完了';

-  -- 2. 提出履歴削除
-  DELETE FROM submission_events WHERE user_id = target_student_id;
-  RAISE NOTICE '✅ 提出履歴削除完了';
+  -- 2. 提出履歴削除（テーブルが存在する場合のみ）
+  BEGIN
+    DELETE FROM submission_events WHERE user_id = target_student_id;
+    RAISE NOTICE '✅ 提出履歴削除完了';
+  EXCEPTION
+    WHEN undefined_table THEN
+      RAISE NOTICE '⚠️ submission_eventsテーブルが存在しないためスキップ';
+  END;

-  -- 3. 課題提出状況削除
+  -- 3. 課題提出状況削除
   DELETE FROM user_assignments WHERE user_id = target_student_id;
   RAISE NOTICE '✅ 課題提出状況削除完了';

-  -- 4. プロフィール削除（これにより auth.users も自動削除される）
+  -- 4. プロフィール削除（これにより auth.users も自動削除される）
   DELETE FROM profiles WHERE id = target_student_id;
   RAISE NOTICE '✅ プロフィール削除完了';

-  -- 5. Supabase認証ユーザー削除（念のため明示的に実行）
+  -- 5. Supabase認証ユーザー削除（念のため明示的に実行）
   -- 注意: これはSupabase Admin APIを使用する必要があるため、
   -- 実際の削除はAPI Route側で行う