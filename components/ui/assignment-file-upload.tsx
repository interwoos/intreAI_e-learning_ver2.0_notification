// components/ui/file-upload.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileText, X, CheckCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface FileUploadProps {
  taskId: string;
  termId: string;
  accept: string;
  maxSize: number;
}

export default function FileUpload({ taskId, termId, accept, maxSize }: FileUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.size <= maxSize) {
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    try {
      // 現在のユーザーIDを取得
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("ユーザーが認証されていません");

      // FormDataを作成
      const formData = new FormData();
      formData.append("userId", user.id);
      formData.append("file", selectedFile);
      formData.append("taskId", taskId);
      formData.append("termId", termId);

      // APIエンドポイントにPOST
      const response = await fetch("/api/upload-task", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("アップロードに失敗しました");
      const result = await response.json();
      console.log("Upload success:", result);

      setUploadSuccess(true);
      setSelectedFile(null);
    } catch (error) {
      console.error("Upload error:", error);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <input
        type="file"
        accept="video/*"
        onChange={handleFileSelect}
        className="hidden"
        id={`file-input-${taskId}`}
      />

      <label
        htmlFor={`file-input-${taskId}`}
        className="flex items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400"
      >
        <div className="text-center">
          <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
          <p className="text-sm text-gray-600">ファイルを選択してください</p>
        </div>
      </label>

      {selectedFile && (
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            <span className="text-sm">{selectedFile.name}</span>
          </div>
          <Button
            onClick={() => setSelectedFile(null)}
            variant="ghost"
            size="sm"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {selectedFile && (
        <Button
          onClick={handleUpload}
          disabled={isUploading}
          className="w-full"
        >
          {isUploading ? "アップロード中..." : "アップロード"}
        </Button>
      )}

      {uploadSuccess && (
        <div className="flex items-center gap-2 text-green-600">
          <CheckCircle className="w-4 h-4" />
          <span className="text-sm">アップロードが完了しました</span>
        </div>
      )}
    </div>
  );
}
