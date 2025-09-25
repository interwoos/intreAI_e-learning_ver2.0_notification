"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Props = {
  termId: string;
  label?: string;
  allowedMimes?: string[];
  maxSize?: number;
  className?: string;
};

export default function ResumableUpload({
  termId,
  label = "動画をアップロード",
  allowedMimes = ["video/*"],
  maxSize = 2 * 1024 * 1024 * 1024, // 2GB
  className = "",
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const validate = (f: File): string | null => {
    if (!f) return "ファイルが選択されていません";
    if (maxSize && f.size > maxSize) return `上限 ${(maxSize / 1024 / 1024).toFixed(0)}MB を超えています`;
    if (allowedMimes.length) {
      const ok = allowedMimes.some((pat) =>
        pat.endsWith("/*") ? f.type.startsWith(pat.slice(0, -1)) : f.type === pat
      );
      if (!ok) return `許可形式: ${allowedMimes.join(", ")}`;
    }
    return null;
  };

  const onPick = () => inputRef.current?.click();

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    if (!f) return setFile(null);
    const err = validate(f);
    if (err) {
      toast.error(err);
      return setFile(null);
    }
    setFile(f);
  };

  const upload = async () => {
    if (!file) return toast.error("ファイルを選択してください");
    try {
      setUploading(true);
      setProgress(0);

      // 1) サーバにリクエストして uploadUrl を取得
      const resp = await fetch("/api/drive/resumable-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          termId,
          fileName: file.name.replace(/[^\w.\-()]/g, "_"),
          mimeType: file.type || "application/octet-stream",
          fileSize: file.size,
        }),
      });
      const j = await resp.json();
      if (!j?.success) throw new Error(j?.error || "resumable-start failed");

      const uploadUrl = j.uploadUrl as string;

      // 2) 直PUTでDriveに送信
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl, true);
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.floor((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed (${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error("ネットワークエラー"));
        xhr.send(file);
      });

      toast.success("アップロード完了。Google Driveに保存されました");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setProgress(0);
    } catch (e: any) {
      toast.error(e?.message || "アップロード失敗");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <input ref={inputRef} type="file" accept={allowedMimes.join(",")} onChange={onChange} className="hidden" />

      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={onPick} disabled={uploading}>
          ファイルを選択
        </Button>
        <span className="text-sm text-gray-700 truncate max-w-[46ch]">
          {file ? `${file.name}（${(file.size / 1024 / 1024).toFixed(1)}MB）` : "未選択"}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={upload} disabled={!file || uploading}>
          {uploading ? "アップロード中..." : "アップロード"}
        </Button>
        {uploading && <div className="text-xs text-gray-500">送信中: {progress}%</div>}
      </div>

      {uploading && (
        <div className="h-1.5 w-full bg-gray-100 rounded">
          <div className="h-1.5 bg-gray-800 rounded" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}
