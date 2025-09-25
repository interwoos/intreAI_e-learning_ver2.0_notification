import { useState, useRef } from 'react';
import Papa from 'papaparse';

interface UseCSVUploadOptions {
  onDataParsed?: (data: any[]) => void;
  onError?: (error: string) => void;
  validateHeaders?: string[];
  previewRows?: number;
  maxFileSize?: number;
}

export function useCSVUpload({
  onDataParsed,
  onError,
  validateHeaders = [],
  previewRows = 5,
  maxFileSize = 5 * 1024 * 1024 // 5MB default
}: UseCSVUploadOptions = {}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = (selectedFile: File) => {
    if (!selectedFile) {
      setFile(null);
      setPreview([]);
      setHeaders([]);
      return;
    }

    // Check file type
    if (
      selectedFile.type !== "text/csv" &&
      selectedFile.type !== "application/vnd.ms-excel" &&
      !selectedFile.name.endsWith('.csv')
    ) {
      onError?.("CSVファイルを選択してください");
      return;
    }

    // Check file size
    if (selectedFile.size > maxFileSize) {
      onError?.(`ファイルサイズは${maxFileSize / 1024 / 1024}MB以下にしてください`);
      return;
    }

    setFile(selectedFile);
    setIsLoading(true);

    Papa.parse(selectedFile, {
      header: true,
      skipEmptyLines: true,
      encoding: 'UTF-8',
      complete: (results) => {
        // ヘッダー名の配列は results.meta.fields から取得
        const fileHeaders = (results.meta.fields as string[]) || [];
        setHeaders(fileHeaders);

        // Validate headers
        if (validateHeaders.length > 0) {
          const missingHeaders = validateHeaders.filter(h => !fileHeaders.includes(h));
          if (missingHeaders.length > 0) {
            onError?.(`必要な列が不足しています: ${missingHeaders.join(', ')}`);
            setFile(null);
            setPreview([]);
            setHeaders([]);
            setIsLoading(false);
            return;
          }
        }

        // プレビュー用データ（オブジェクト配列）
        const rows = results.data as Record<string, any>[];
        const previewData = rows.slice(0, previewRows);
        setPreview(previewData);

        // 全データをコールバック
        onDataParsed?.(rows);
        setIsLoading(false);
      },
      error: (error) => {
        onError?.(error.message);
        setFile(null);
        setPreview([]);
        setHeaders([]);
        setIsLoading(false);
      }
    });
  };

  const reset = () => {
    setFile(null);
    setPreview([]);
    setHeaders([]);
    setIsLoading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return {
    file,
    preview,
    headers,
    isLoading,
    fileInputRef,
    handleFileSelect,
    triggerFileSelect,
    reset
  };
}
