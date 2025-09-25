#!/usr/bin/env node

/**
 * ローカル開発用のメールキュー処理スクリプト
 * 本番環境ではVercel Cronが自動実行するため不要
 */

const INTERVAL_MS = 2 * 60 * 1000; // 2分間隔
const API_URL = 'http://localhost:3000/api/jobs/process-queue?key=dev-cron';

let isRunning = false;

async function processQueue() {
  if (isRunning) {
    console.log('⏳ 前回の処理がまだ実行中のためスキップ');
    return;
  }

  isRunning = true;
  const timestamp = new Date().toISOString();
  
  try {
    console.log(`🤖 [${timestamp}] メールキュー処理開始`);
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const result = await response.json();
    
    if (result.ok) {
      console.log(`✅ [${timestamp}] 処理完了:`, {
        sent: result.sent,
        failed: result.failed,
        skipped: result.skipped,
        processed: result.processed,
        executionTime: `${result.executionTimeMs}ms`
      });
    } else {
      console.error(`❌ [${timestamp}] 処理失敗:`, result.error);
    }
  } catch (error) {
    console.error(`❌ [${timestamp}] API呼び出しエラー:`, error.message);
  } finally {
    isRunning = false;
  }
}

// 初回実行
console.log('🚀 ローカル開発用メールキュー処理を開始します');
console.log(`📅 実行間隔: ${INTERVAL_MS / 1000}秒`);
console.log(`🌐 API URL: ${API_URL}`);
console.log('');

processQueue();

// 定期実行
const interval = setInterval(processQueue, INTERVAL_MS);

// Ctrl+Cでの終了処理
process.on('SIGINT', () => {
  console.log('\n🛑 メールキュー処理を停止します...');
  clearInterval(interval);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 メールキュー処理を停止します...');
  clearInterval(interval);
  process.exit(0);
});