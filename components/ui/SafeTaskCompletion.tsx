'use client';

import React from 'react';
import TaskCompletion from '@/components/ui/task-completion';

type Props = { taskId: string; sheetUrl?: string | null };

/** TaskCompletion 内で例外が出ても UI 全体が消えないようにする安全ラッパ */
class Boundary extends React.Component<{ fallback: React.ReactNode }, { hasError: boolean }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: any) {
    console.error('[SafeTaskCompletion] render error:', err);
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children as any;
  }
}

export default function SafeTaskCompletion({ taskId, sheetUrl }: Props) {
  const Fallback = (
    <div className="flex flex-wrap items-center gap-2">
      {sheetUrl ? (
        <a
          href={sheetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
        >
          課題シートを開く
        </a>
      ) : null}
      <button
        disabled
        className="inline-flex items-center rounded-md bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground"
        title="一時的に完了操作を無効化（コンポーネントエラー）"
      >
        完了（現在一時停止中）
      </button>
    </div>
  );

  return (
    <Boundary fallback={Fallback}>
      <div className="flex flex-wrap items-center gap-2">
        {sheetUrl ? (
          <a
            href={sheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
          >
            課題シートを開く
          </a>
        ) : null}
        {/* 既存の TaskCompletion（ここで落ちても Fallback を表示） */}
        <TaskCompletion taskId={taskId} />
      </div>
    </Boundary>
  );
}
