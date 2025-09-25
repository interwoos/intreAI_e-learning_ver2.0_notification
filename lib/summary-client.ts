/**
 * クライアント側要約トークン管理ユーティリティ
 * localStorage を使用した永続化
 */

const STORAGE_PREFIX = 'summary:';

/**
 * 要約トークンをlocalStorageから取得
 */
export function loadSummaryToken(taskId: string): string | null {
  if (typeof window === 'undefined') {
    // SSR環境では null を返す
    return null;
  }

  try {
    const key = `${STORAGE_PREFIX}${taskId}`;
    return localStorage.getItem(key);
  } catch (error) {
    // localStorage アクセスエラー（プライベートモード等）
    console.warn('localStorage access failed:', error);
    return null;
  }
}

/**
 * 要約トークンをlocalStorageに保存
 */
export function saveSummaryToken(taskId: string, token: string): boolean {
  if (typeof window === 'undefined') {
    // SSR環境では何もしない
    return false;
  }

  try {
    const key = `${STORAGE_PREFIX}${taskId}`;
    localStorage.setItem(key, token);
    return true;
  } catch (error) {
    // localStorage 書き込みエラー（容量不足等）
    console.warn('localStorage save failed:', error);
    return false;
  }
}

/**
 * 要約トークンをlocalStorageから削除
 */
export function clearSummaryToken(taskId: string): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const key = `${STORAGE_PREFIX}${taskId}`;
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.warn('localStorage clear failed:', error);
    return false;
  }
}

/**
 * 特定タスクの要約トークン存在チェック
 */
export function hasSummaryToken(taskId: string): boolean {
  return loadSummaryToken(taskId) !== null;
}

/**
 * 全要約トークンをクリア（デバッグ用）
 */
export function clearAllSummaryTokens(): number {
  if (typeof window === 'undefined') {
    return 0;
  }

  try {
    let cleared = 0;
    const keys = Object.keys(localStorage);
    
    for (const key of keys) {
      if (key.startsWith(STORAGE_PREFIX)) {
        localStorage.removeItem(key);
        cleared++;
      }
    }
    
    return cleared;
  } catch (error) {
    console.warn('localStorage clear all failed:', error);
    return 0;
  }
}

/**
 * 要約トークン一覧取得（デバッグ用）
 */
export function listSummaryTokens(): Array<{ taskId: string; hasToken: boolean }> {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const keys = Object.keys(localStorage);
    const summaryKeys = keys.filter(key => key.startsWith(STORAGE_PREFIX));
    
    return summaryKeys.map(key => ({
      taskId: key.replace(STORAGE_PREFIX, ''),
      hasToken: true
    }));
  } catch (error) {
    console.warn('localStorage list failed:', error);
    return [];
  }
}