"use client";

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { 
  FileText, 
  Check, 
  RotateCcw, 
  X,
  AlertTriangle 
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';

interface TaskCompletionProps {
  taskId: string;
}

type Status = 'not_submitted' | 'submitted' | 'resubmitted' | 'cancelled' | string;

interface Assignment {
  completed: boolean;
  status: Status | null;
  sheet_link: string;
  submission_count: number;
  last_cancelled_at: string | null;
  completed_at?: string | null;
}

/** ▼▼▼ スタイル一元管理（元UI準拠） ▼▼▼ */
const ui = {
  container: "space-y-4",
  stack: "flex gap-4",

  loadingCard: "p-4",
  loadingWrap: "flex items-center justify-center py-4",
  loadingSpinner:
    "w-4 h-4 mr-2 animate-spin rounded-full border-2 border-gray-600 border-t-transparent",
  loadingText: "text-gray-500",

  errorCard: "p-4 bg-red-50 border-red-200",
  errorRow: "flex items-center gap-2 text-red-600",
  errorRetryBtn: "ml-auto",

  statusLine: "text-sm",
  statusSubmitted: "font-medium text-green-600",
  statusResubmitted: "font-medium text-blue-600",
  statusCancelled: "font-medium text-orange-600",
  statusDefault: "font-medium text-gray-600",
  timestamp: "text-gray-500 ml-2",

  sheetBtn:
    "flex-1 h-12 text-green-800 border border-green-200 flex items-center justify-center gap-2 font-medium hover:bg-green-100",
  sheetBtnBg: "#f0fdf4",
  sheetIcon: "w-5 h-5 mr-2",

  primaryBtn:
    "flex-1 h-12 bg-white hover:bg-gray-50 text-gray-800 border-2 border-gray-300 flex items-center justify-center gap-2",
  primaryBlueBtn:
    "flex-1 h-12 bg-blue-100 hover:bg-blue-200 text-blue-800 border border-blue-300 flex items-center justify-center gap-2",
  outlineWarnBtn:
    "flex-1 h-12 bg-orange-100 hover:bg-orange-200 text-orange-800 border border-orange-300 flex items-center justify-center gap-2",

  icon: "w-5 h-5 mr-2",

  dialogTitleIcon: "w-5 h-5 text-orange-500",
  reasonLabel: "text-sm font-medium text-gray-700",
  reasonTextarea: "min-h-[80px]",
} as const;
/** ▲▲▲ ここだけ触れば見た目を揃えられる ▲▲▲ */

const DEV = process.env.NODE_ENV === 'development';

export function TaskCompletion({ taskId }: TaskCompletionProps) {
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // マウントログ（発火確認用）
  useEffect(() => {
    console.log('👀 <TaskCompletion> mounted', { taskId });
  }, [taskId]);

  // 課題状況取得
  const fetchAssignment = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.access_token) throw new Error('認証セッションが無効です');

      console.log('📡 [GET] /api/user-assignments', { taskId });
      const response = await fetch(`/api/user-assignments?taskId=${taskId}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });

      if (!response.ok) {
        const txt = await response.text().catch(() => '');
        throw new Error(txt || 'API呼び出しに失敗しました');
      }

      const result = await response.json();
      const a: Assignment | undefined = result.assignments?.[0];

      if (a) {
        setAssignment({
          completed: !!a.completed,
          status: (a.status as Status) ?? 'not_submitted',
          sheet_link: a.sheet_link ?? '',
          submission_count: a.submission_count ?? 0,
          last_cancelled_at: a.last_cancelled_at ?? null,
          completed_at: a.completed_at ?? null,
        });
      } else {
        // 初期状態で動かせるようにダミーをセット
        setAssignment({
          completed: false,
          status: 'not_submitted',
          sheet_link: '',
          submission_count: 0,
          last_cancelled_at: null,
          completed_at: null,
        });
      }

      setLastUpdated(new Date());
      console.log('✅ 状況取得OK', { assignment: a ?? '(init)' });
    } catch (e) {
      console.error('🔥 課題状況取得エラー:', e);
      setError(e instanceof Error ? e.message : '課題情報の取得に失敗しました');
      setAssignment({
        completed: false,
        status: 'not_submitted',
        sheet_link: '',
        submission_count: 0,
        last_cancelled_at: null,
        completed_at: null,
      });
    } finally {
      setIsLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    fetchAssignment();
  }, [fetchAssignment]);

  // Realtime購読（task_id単位で更新）
  useEffect(() => {
    const subscription = supabase
      .channel(`task-completion-${taskId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_assignments', filter: `task_id=eq.${taskId}` },
        () => {
          console.log('🔔 Realtime: change detected → refetch');
          fetchAssignment();
        }
      )
      .subscribe((s) => {
        console.log('📡 Realtime subscribed', s);
      });

    return () => {
      console.log('🧹 Realtime unsubscribe');
      subscription.unsubscribe();
    };
  }, [taskId, fetchAssignment]);

  // 楽観的更新の算出
  const getOptimistic = (
    current: Assignment,
    action: 'submit' | 'resubmit' | 'cancel'
  ): Assignment => {
    const now = new Date().toISOString();
    switch (action) {
      case 'submit':
        return {
          ...current,
          completed: true,
          status: current.submission_count > 0 ? 'resubmitted' : 'submitted',
          submission_count: Math.max(1, current.submission_count + 1),
          completed_at: now,
        };
      case 'resubmit':
        return {
          ...current,
          completed: true,
          status: 'resubmitted',
          submission_count: Math.max(1, current.submission_count + 1),
          completed_at: now,
        };
      case 'cancel':
        return {
          ...current,
          completed: false,
          status: 'cancelled',
          last_cancelled_at: now,
        };
      default:
        return current;
    }
  };

  // 共通アクション
  const postAction = async (action: 'submit' | 'resubmit' | 'cancel', reason?: string) => {
    if (!assignment) return;

    console.log('🎯 CLICK → postAction', { action, taskId });
    toast.loading('処理を開始します…', { id: `act-${taskId}` });
    setIsSubmitting(true);

    const prev = assignment;
    const optimistic = getOptimistic(prev, action);
    setAssignment(optimistic);

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.access_token) throw new Error('認証セッションが無効です');

      console.log('📡 [POST] /api/user-assignments', { action, taskId });
      const response = await fetch('/api/user-assignments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ taskId, action, reason }),
      });

      if (!response.ok) {
        const txt = await response.text().catch(() => '');
        setAssignment(prev); // ロールバック
        throw new Error(txt || `API Error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      if (!result.success) {
        setAssignment(prev);
        throw new Error(result.error || '操作に失敗しました');
      }

      console.log('✅ Action OK → refetch', result);
      toast.success(result.message || '更新しました', { id: `act-${taskId}` });
      fetchAssignment(); // DBの真値で同期

      if (action === 'cancel') {
        setShowCancelDialog(false);
        setCancelReason('');
      }
    } catch (e:any) {
      console.error('🔥 アクション実行例外:', e);
      toast.error(e.message ?? '操作に失敗しました', { id: `act-${taskId}` });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openSheetLink = () => {
    console.log('📝 openSheetLink', { link: assignment?.sheet_link });
    if (assignment?.sheet_link && assignment.sheet_link !== '#') {
      window.open(assignment.sheet_link, '_blank');
    }
  };

  // ローディング
  if (isLoading) {
    return (
      <Card className={ui.loadingCard}>
        <div className={ui.loadingWrap}>
          <div className={ui.loadingText}>読み込み中...</div>
        </div>
      </Card>
    );
  }

  if (!assignment) {
    return (
      <Card className={ui.loadingCard}>
        <div className="text-center py-4">
          <div className="text-red-600 mb-2">課題情報の取得に失敗しました</div>
          <Button onClick={fetchAssignment} variant="outline" size="sm">
            再試行
          </Button>
        </div>
      </Card>
    );
  }

  // ステータス別ボタン構成
  const cfg = (() => {
    switch (assignment.status) {
      case 'submitted':
      case 'resubmitted':
        return { showComplete: false, showResubmit: false, showCancel: true };
      case 'cancelled':
        return { showComplete: false, showResubmit: true, showCancel: false };
      default:
        return { showComplete: true, showResubmit: false, showCancel: false };
    }
  })();

  // ステータス表示
  const statusText =
    assignment.status === 'submitted'
      ? '提出済み'
      : assignment.status === 'resubmitted'
      ? `再提出済み (v${assignment.submission_count})`
      : assignment.status === 'cancelled'
      ? '取り消し済み'
      : '未提出';

  const statusClass =
    assignment.status === 'submitted'
      ? ui.statusSubmitted
      : assignment.status === 'resubmitted'
      ? ui.statusResubmitted
      : assignment.status === 'cancelled'
      ? ui.statusCancelled
      : ui.statusDefault;

  // NOTE: DEV ではリンクが無くても押せるようにして“発火”切り分けを優先
  const hasValidSheetLink = !!assignment.sheet_link && assignment.sheet_link !== '#';
  const canClick = DEV ? !isSubmitting : (!isSubmitting && hasValidSheetLink);

  return (
    <div className={ui.container}>
      {/* エラー表示 */}
      {error && (
        <Card className={ui.errorCard}>
          <div className={ui.errorRow}>
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
            <Button onClick={fetchAssignment} variant="outline" size="sm" className={ui.errorRetryBtn}>
              再試行
            </Button>
          </div>
        </Card>
      )}

      {/* ステータス行（任意表示） */}
      <div className={ui.statusLine}>
        <span className={statusClass}>{statusText}</span>
        {assignment.completed_at && (assignment.status === 'submitted' || assignment.status === 'resubmitted') && (
          <span className={ui.timestamp}>
            提出: {new Date(assignment.completed_at).toLocaleString('ja-JP')}
          </span>
        )}
        {assignment.last_cancelled_at && assignment.status === 'cancelled' && (
          <span className={ui.timestamp}>
            取り消し: {new Date(assignment.last_cancelled_at).toLocaleString('ja-JP')}
          </span>
        )}
        {lastUpdated && <span className={ui.timestamp}>（更新: {lastUpdated.toLocaleTimeString()}）</span>}
      </div>

      {/* メインボタンエリア（左：シート、右：アクション） */}
      <div className={`flex gap-4 relative ${ui.stack}`}>
        {/* 課題シートを開く */}
        <Button
          onClick={openSheetLink}
          disabled={!hasValidSheetLink}
          className={ui.sheetBtn}
          style={{ backgroundColor: ui.sheetBtnBg }}
          variant="outline"
        >
          <FileText className={ui.sheetIcon} />
          課題シートを開く
        </Button>

        {/* 完了/再提出/取り消し */}
        {cfg.showComplete && (
          <Button
            data-testid="submit"
            onClick={() => postAction('submit')}
            disabled={!canClick}
            className={ui.primaryBtn}
            variant="outline"
          >
            {isSubmitting ? (
              <>
                <div className={ui.loadingSpinner} />
                処理中...
              </>
            ) : (
              <>
                <Check className={ui.icon} />
                完了したらチェック
              </>
            )}
          </Button>
        )}

        {cfg.showResubmit && (
          <Button
            data-testid="resubmit"
            onClick={() => postAction('resubmit')}
            disabled={!canClick}
            className={ui.primaryBlueBtn}
            variant="outline"
          >
            {isSubmitting ? (
              <>
                <div className={ui.loadingSpinner.replace("border-gray-600", "border-blue-600")} />
                処理中...
              </>
            ) : (
              <>
                <RotateCcw className={ui.icon} />
                課題を再提出
              </>
            )}
          </Button>
        )}

        {cfg.showCancel && (
          <Button
            data-testid="open-cancel"
            onClick={() => setShowCancelDialog(true)}
            disabled={isSubmitting}
            className={ui.outlineWarnBtn}
            variant="outline"
          >
            <X className={ui.icon} />
            提出を取り消し・編集
          </Button>
        )}
      </div>

      {/* DEV限定の強制発火ボタン：リンク条件や状態に関係なく postAction を叩ける */}
      {DEV && (
        <div className="pt-1">
          <Button
            data-testid="force-submit"
            onClick={() => postAction('submit')}
            className="w-full border-2 border-dashed"
            variant="outline"
          >
            🧪 強制テスト: 提出を直実行（DEVのみ）
          </Button>
        </div>
      )}

      {/* 取り消し確認ダイアログ（理由入力つき） */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className={ui.dialogTitleIcon} />
              提出を取り消しますか？
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>この操作により、課題の提出状態が取り消されます。</p>
              <p>取り消し後は課題シートを編集して再提出できます。</p>
              <div className="space-y-2">
                <label className={ui.reasonLabel}>取り消し理由（任意）</label>
                <Textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="例：内容を修正したい、誤って提出した、など"
                  className={ui.reasonTextarea}
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setShowCancelDialog(false);
                setCancelReason('');
              }}
              disabled={isSubmitting}
            >
              キャンセル
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirm-cancel"
              onClick={() => postAction('cancel', cancelReason)}
              className="bg-orange-600 hover:bg-orange-700 text-white"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <div className={ui.loadingSpinner.replace("border-gray-600", "border-white")} />
                  処理中...
                </>
              ) : (
                '提出を取り消し'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
