"use client";

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, X, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

interface FileUploadProps {
  termId: string;
  taskId: string;
  lectureNumber?: number;
  allowedMimes?: string[];
  maxSize?: number;
  label?: string;
  onUploadComplete?: () => void;
}

export default function FileUpload({
  termId,
  taskId,
  lectureNumber,
  allowedMimes = ["video/*"],
  maxSize = 500 * 1024 * 1024, // 500MB
  label = "ファイルをアップロード",
  onUploadComplete
}: FileUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // クライアント側バリデーション
    if (file.size > maxSize) {
      toast.error(`ファイルサイズは${Math.round(maxSize / 1024 / 1024)}MB以下にしてください`);
      return;
    }

    if (file.type && allowedMimes.length > 0) {
      const isAllowed = allowedMimes.some(mime => {
        if (mime.endsWith('/*')) {
          return file.type.startsWith(mime.slice(0, -1));
        }
        return file.type === mime;
      });

      if (!isAllowed) {
        toast.error('許可されていないファイル形式です');
        return;
      }
    }

    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // ユーザーIDを取得
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        toast.error('認証エラーが発生しました');
        return;
      }

      // FormData作成
      const formData = new FormData();
      formData.append('userId', user.id);
      formData.append('file', selectedFile);
      formData.append('taskId', taskId);
      formData.append('termId', termId);
      if (lectureNumber) {
        formData.append('lectureNumber', lectureNumber.toString());
      }

      // XMLHttpRequestで進捗表示付きアップロード
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          const result = JSON.parse(xhr.responseText);
          if (result.success) {
            toast.success('アップロードが完了しました');
            setSelectedFile(null);
            setUploadProgress(0);
            if (fileInputRef.current) {
              fileInputRef.current.value = '';
            }
            onUploadComplete?.();
          } else {
            toast.error(result.error || 'アップロードに失敗しました');
          }
        } else {
          const errorData = JSON.parse(xhr.responseText);
          toast.error(errorData.error || 'アップロードに失敗しました');
        }
        setIsUploading(false);
      });

      xhr.addEventListener('error', () => {
        toast.error('ネットワークエラーが発生しました');
        setIsUploading(false);
      });

      xhr.open('POST', '/api/upload-task');
      xhr.send(formData);

    } catch (error) {
      console.error('アップロードエラー:', error);
      toast.error('アップロードに失敗しました');
      setIsUploading(false);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <input
          ref={fileInputRef}
          type="file"
          accept={allowedMimes.join(',')}
          onChange={handleFileSelect}
          className="hidden"
          disabled={isUploading}
        />
        
        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          variant="outline"
          className="flex items-center gap-2"
        >
          <Upload className="w-4 h-4" />
          ファイルを選択
        </Button>

        {selectedFile && (
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg border border-blue-200">
            <span className="text-sm text-blue-800 font-medium">
              {selectedFile.name}
            </span>
            <span className="text-xs text-blue-600">
              ({(selectedFile.size / 1024 / 1024).toFixed(1)}MB)
            </span>
            {!isUploading && (
              <button
                onClick={handleRemoveFile}
                className="p-1 hover:bg-blue-100 rounded-full"
              >
                <X className="w-3 h-3 text-blue-600" />
              </button>
            )}
          </div>
        )}
      </div>

      {selectedFile && (
        <div className="space-y-3">
          <Button
            onClick={handleUpload}
            disabled={isUploading}
            className="w-full bg-custom-dark-gray hover:bg-[#2a292a] text-white"
          >
            {isUploading ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                アップロード中... {uploadProgress}%
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4" />
                {label}
              </div>
            )}
          </Button>

          {isUploading && (
            <div className="space-y-2">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-custom-dark-gray h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-xs text-gray-600 text-center">
                Google Driveにアップロード中...
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}