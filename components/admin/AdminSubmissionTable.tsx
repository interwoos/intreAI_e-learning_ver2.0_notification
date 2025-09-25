// components/admin/AdminSubmissionTable.tsx
"use client";
import { useEffect, useState } from "react";

type Row = {
  user_id: string;
  full_name: string;
  link: string | null;
  submitted_at: string | null;
  completed: boolean | null;
};

export default function AdminSubmissionTable({ termId, taskId }: { termId: string; taskId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/admin/submission-links?termId=${encodeURIComponent(termId)}&taskId=${encodeURIComponent(taskId)}`);
        const js = await res.json();
        if (!res.ok || !js?.ok) {
          setErr(js?.error || "取得に失敗しました");
          return;
        }
        setRows(js.rows || []);
      } catch (e: any) {
        setErr(e?.message || "エラー");
      }
    })();
  }, [termId, taskId]);

  if (err) return <p className="text-sm text-red-600">{err}</p>;
  if (!rows.length) return <p className="text-sm text-gray-500">該当データがありません。</p>;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="text-left">
          <tr>
            <th className="p-2 border-b">氏名</th>
            <th className="p-2 border-b">リンク</th>
            <th className="p-2 border-b">提出日時</th>
            <th className="p-2 border-b">完了</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.user_id}>
              <td className="p-2 border-b">{r.full_name}</td>
              <td className="p-2 border-b">
                {r.link ? (
                  <a className="underline" href={r.link} target="_blank" rel="noreferrer">開く</a>
                ) : (
                  <span className="text-gray-400">なし</span>
                )}
              </td>
              <td className="p-2 border-b">{r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "-"}</td>
              <td className="p-2 border-b">{r.completed ? "✓" : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
