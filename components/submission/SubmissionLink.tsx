// components/submission/SubmissionLink.tsx
"use client";
import { useEffect, useState } from "react";

export default function SubmissionLink({ taskId }: { taskId: string }) {
  const [state, setState] = useState<{ link?: string; at?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/submission-link?taskId=${encodeURIComponent(taskId)}`);
        const js = await res.json();
        if (!res.ok || !js?.ok) {
          setErr(js?.error || "取得に失敗しました");
          return;
        }
        setState({ link: js.drive_webview_link, at: js.last_submitted_at });
      } catch (e: any) {
        setErr(e?.message || "エラー");
      }
    })();
  }, [taskId]);

  if (err) return <p className="text-sm text-red-600">{err}</p>;
  if (!state?.link) return <p className="text-sm text-gray-500">まだ提出リンクはありません。</p>;

  return (
    <div className="text-sm">
      <a className="underline" href={state.link} target="_blank" rel="noreferrer">
        動画を開く
      </a>
      {state.at && <span className="text-gray-500 ml-2">（提出: {new Date(state.at).toLocaleString()}）</span>}
    </div>
  );
}
