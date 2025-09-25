@@ .. @@
     -- レコード挿入（カラム名を明示的に指定）
     INSERT INTO pre_assignments (
-      pre_assignments.term_id, 
-      pre_assignments.assignment_id, 
-      pre_assignments.title
+      term_id, 
+      assignment_id, 
+      title
     )
     VALUES (
       target_term_id, 
       current_assignment_id, 
       COALESCE(task_title, '')
     )
-    ON CONFLICT (pre_assignments.term_id, pre_assignments.assignment_id) DO NOTHING;
+    ON CONFLICT (term_id, assignment_id) DO NOTHING;
     
     RAISE NOTICE '✅ 挿入完了: % - %', current_assignment_id, COALESCE(task_title, '(タイトルなし)');