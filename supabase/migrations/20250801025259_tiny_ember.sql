@@ .. @@
 -- 既存データのdisplay_orderを設定
-UPDATE lecture_videos 
-SET display_order = ROW_NUMBER() OVER (
-  PARTITION BY term_id, lecture_number 
-  ORDER BY created_at
-)
-WHERE display_order IS NULL OR display_order = 1;
+-- 既存データのdisplay_orderを設定（サブクエリを使用）
+WITH ranked_videos AS (
+  SELECT 
+    id,
+    ROW_NUMBER() OVER (
+      PARTITION BY term_id, lecture_number 
+      ORDER BY created_at
+    ) as new_order
+  FROM lecture_videos
+  WHERE display_order IS NULL OR display_order = 1
+)
+UPDATE lecture_videos 
+SET display_order = ranked_videos.new_order
+FROM ranked_videos
+WHERE lecture_videos.id = ranked_videos.id;