@@ .. @@
   -- 2-3. pre_assignments テーブルのコピー
   INSERT INTO pre_assignments (
-    term_id, assignment_id, title, edit_title, description,
+    term_id, assignment_id, title, edit_title, description,
     ai_name, ai_description, initial_message, 
     system_instruction, knowledge_base
   )
   SELECT 
-    target_term_id, assignment_id, title, edit_title, description,
+    target_term_id, assignment_id, title, edit_title, description,
     ai_name, ai_description, initial_message,
     system_instruction, knowledge_base
   FROM pre_assignments 
   WHERE term_id = source_term_id;