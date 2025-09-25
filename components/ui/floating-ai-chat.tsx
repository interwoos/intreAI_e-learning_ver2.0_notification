"use client";

import { useState, useRef, useEffect } from 'react';
import { supabase } from "@/lib/supabase";
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  MessageSquare, 
  Send, 
  Paperclip, 
  Bot, 
  Trash2,
  RotateCcw,
  Copy,
  FileText,
  Maximize2,
  Minimize2,
  X,
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { loadChatHistory, saveChatMessage, clearChatHistory as clearChatHistoryDB } from '@/lib/chat-history';
import { loadSummaryToken, saveSummaryToken, clearSummaryToken } from '@/lib/summary-client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  message_timestamp: Date;
  isStreaming?: boolean;
}

interface FloatingAiChatProps {
  userId: string;
}

type Citation = {
  title?: string;
  url: string;
  start_index?: number;
  end_index?: number;
};

// DeepResearch用のシステム指示
const DR_SYSTEM = `You are a professional research analyst. Return a structured, citation-rich report.
- Prefer authoritative & up-to-date sources.
- Use clear headings/bullets when helpful.
- Include inline citations; key claims must be traceable.
- If the user language is Japanese, respond in Japanese.`;

// 引用の整形（任意で本文末に追記）
function formatCitations(citations: Citation[] = []) {
  if (!citations?.length) return '';
  const lines = citations.map((c, i) => `［${i + 1}］${c.title || c.url} — ${c.url}`);
  return `\n\n---\n参考:\n${lines.join('\n')}`;
}

// DeepResearch 実行（背景実行 → ポーリング → 完了）
async function runDeepResearch(query: string) {
  // キック（背景実行）
  const kickoff = await fetch('/api/deep-research?background=1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, system: DR_SYSTEM, useRewriter: true }),
  });
  if (!kickoff.ok) throw new Error(await kickoff.text());
  const { id } = await kickoff.json();

  // ポーリング
  while (true) {
    const res = await fetch(`/api/deep-research/${id}`, { cache: 'no-store' });
    const data = await res.json();
    if (data.status === 'completed') {
      const text: string = data.text || '';
      const citations: Citation[] = data.citations || [];
      return { text, citations };
    }
    if (data.status === 'failed' || data.status === 'cancelled') {
      throw new Error(data.error || JSON.stringify(data));
    }
    await new Promise((r) => setTimeout(r, 1800));
  }
}

export function FloatingAiChat({ userId }: FloatingAiChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [currentStreamingMessage, setCurrentStreamingMessage] = useState('');
  const [selectedModel, setSelectedModel] = useState('gpt-4o');

  // ▼ フロート（ドラッグ移動）
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // ▼ ファイル添付
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const taskId = 'general-support';

  // 初期位置（右上寄り）
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPosition({
        x: window.innerWidth - 400 - 20,
        y: 20
      });
    }
  }, []);

  // 履歴ロード（初期メッセージなし）
  useEffect(() => {
    if (!isOpen || !userId) return;

    const loadHistoryFn = async () => {
      try {
        const historyMessages = await loadChatHistory(userId, taskId);
        setMessages(historyMessages);
      } catch (error) {
        console.error('❌ 万能AIチャット履歴読み込み失敗:', error);
        setMessages([]);
      }
    };

    loadHistoryFn();
  }, [isOpen, userId]);

  // 自動スクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentStreamingMessage]);

  // ドラッグ操作
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isFullscreen) return; // フルスクリーン中はドラッグ不可
    setIsDragging(true);
    const rect = panelRef.current?.getBoundingClientRect();
    if (rect) {
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
  };
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || isFullscreen) return;
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;
      const maxX = window.innerWidth - 400;
      const maxY = window.innerHeight - 600;
      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY))
      });
    };
    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, isFullscreen]);

  // ファイル添付ハンドラ
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file);
    } else if (file) {
      alert('PDFファイルのみ添付できます');
      if (fileInputRef.current) fileInputRef.current.value = '';
      setSelectedFile(null);
    }
  };
  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // 履歴クリア
  const handleClearHistory = async () => {
    if (!userId) return;
    const success = await clearChatHistoryDB(userId, taskId);
    if (!success) console.error('❌ 万能AIチャット履歴クリア失敗');
    setMessages([]);
    setCurrentStreamingMessage('');
    
    // 要約トークンもクリア
    clearSummaryToken('general-support');
    console.log('✅ 万能AI要約トークンクリア完了');
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsChatLoading(false);
    }
  };

  // メッセージ送信
  const handleMessageSubmit = async () => {
    if (!message.trim() && !selectedFile) return;

    const userText = message;
    setMessage('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const displayText = userText + (selectedFile ? `\n[添付ファイル: ${selectedFile.name}]` : '');

    const userMessage: Message = {
      role: 'user',
      content: displayText,
      message_timestamp: new Date(),
    };

    if (userId) {
      await saveChatMessage(
        userId,
        taskId,
        'user',
        userMessage.content,
        undefined,
        undefined
      );
    }

    const nextMessages: Message[] = [...messages, userMessage];
    setMessages(nextMessages);
    setIsChatLoading(true);
    setCurrentStreamingMessage('');

    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    try {
      // DeepResearch は専用APIへ（非ストリーミング、背景実行＋ポーリング）
      if (selectedModel === 'deepresearch') {
        // ※ 添付PDFは DeepResearch 専用APIでは未対応。必要なら別経路に。
        const { text, citations } = await runDeepResearch(userText);
        const finalText = text + formatCitations(citations);

        setMessages(prev => [...prev, {
          role: 'assistant',
          content: finalText,
          message_timestamp: new Date(),
        }]);

        if (userId) {
          await saveChatMessage(userId, taskId, 'assistant', finalText, 'o4-mini-deep-research', undefined);
        }

        // 送信後に添付クリア
        handleRemoveFile();
        return;
      }

      // ここからは従来どおり（GPT-4o系）: /api/chat に投げてストリーミング受信
      const form = new FormData();
      form.append('history', JSON.stringify(
        nextMessages.map(m => ({ role: m.role, content: m.content }))
      ));
      form.append('message', userText);
      form.append('taskId', taskId);
      form.append('model', selectedModel);
      
      // 要約トークンを取得してリクエストに含める
      const summaryToken = loadSummaryToken('general-support');
      if (summaryToken) {
        form.append('summaryToken', summaryToken);
      }
      
      if (selectedFile) form.append('pdf', selectedFile);

      // ★ 追加: Supabaseセッションを取得してAuthorizationヘッダーに設定
      const { data: { session } } = await supabase.auth.getSession();

      const headers: Record<string, string> = {
        Authorization: `Bearer ${session?.access_token ?? ""}`,
      };
      
      // 要約トークンをヘッダーにも設定（優先）
      if (summaryToken) {
        headers['X-Summary-Token'] = summaryToken;
      }
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: form,
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Response body is null');

      const assistantMessage: Message = {
        role: 'assistant',
        content: '',
        message_timestamp: new Date(),
        isStreaming: true
      };
      setMessages(prev => [...prev, assistantMessage]);

      let accumulatedMessage = '';
      let newSummaryToken = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = new TextDecoder().decode(value);
        
          if (chunk.includes('__SUMMARY_TOKEN__:')) {
            const tokenMatch = chunk.match(/__SUMMARY_TOKEN__:([^\n\r]+)/);
          if (tokenMatch) {
            newSummaryToken = tokenMatch[1];
              const cleanChunk = chunk.replace(/__SUMMARY_TOKEN__:[^\n\r]+/, '');
            accumulatedMessage += cleanChunk;
            setCurrentStreamingMessage(accumulatedMessage);
            continue;
          }
        }
        
        accumulatedMessage += chunk;
        setCurrentStreamingMessage(accumulatedMessage);
      }
      
      // 新しい要約トークンを保存
      if (newSummaryToken) {
        saveSummaryToken('general-support', newSummaryToken);
        console.log('✅ 万能AI要約トークン保存完了');
      }

      if (userId && accumulatedMessage) {
        await saveChatMessage(
          userId,
          taskId,
          'assistant',
          accumulatedMessage,
          selectedModel,
          undefined
        );
      }

      setMessages(prev => {
        const newMessages = [...prev];
        const last = newMessages[newMessages.length - 1];
        if (last && last.isStreaming) {
          last.content = accumulatedMessage;
          last.isStreaming = false;
          last.message_timestamp = new Date();
        }
        return newMessages;
      });

      setCurrentStreamingMessage('');
      handleRemoveFile();

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Request was cancelled');
      } else {
        console.error('Error:', error);
        const msg =
          'エラーが発生しました。チャット履歴が多すぎる可能性があります。履歴をクリアしてもう一度お試しください。';
        setMessages(prev => [...prev, { role: 'assistant', content: msg, message_timestamp: new Date() }]);
        if (userId) {
          await saveChatMessage(userId, taskId, 'assistant', msg, selectedModel, undefined);
        }
      }
    } finally {
      setIsChatLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleMessageSubmit();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const formatTime = (date: Date) =>
    new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' }).format(new Date(date));

  // 小さいフローティングボタン（起動用）
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-16 h-16 bg-custom-dark-gray hover:bg-[#2a292a] text-white rounded-full shadow-lg flex items-center justify-center z-40 transition-all duration-200 hover:scale-105"
        title="壁打ちAI"
      >
        <MessageSquare className="w-6 h-6" />
      </button>
    );
  }

  // ドラッグ可能なフローティングパネル（拡大対応）
  return (
    <div
      ref={panelRef}
      className={`fixed z-50 bg-white border border-gray-200 shadow-xl flex flex-col rounded-lg ${isFullscreen ? 'inset-2 md:inset-4' : ''}`}
      style={
        isFullscreen
          ? {}
          : { left: position.x, top: position.y, width: '384px', height: '600px' }
      }
    >
      {/* ヘッダー */}
      <div
        className={`p-4 border-b bg-white rounded-t-lg ${isFullscreen ? '' : 'cursor-move'}`}
        onMouseDown={handleMouseDown}
      >
        {/* タイトル & 操作列 */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-custom-light-gray to-white rounded-full flex items-center justify-center shadow-inner">
              <Bot className="w-5 h-5 text-custom-dark-gray" />
            </div>
            <div>
              <h4 className="font-semibold text-custom-black text-base">
                イントレ壁打ちAI
              </h4>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* 拡大/縮小ボタン */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsFullscreen(f => !f)}
              className="h-8 w-8 p-0 hover:bg-gray-100 rounded-full"
              title={isFullscreen ? '縮小' : '拡大'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>

            {/* 閉じる */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="h-8 w-8 p-0 hover:bg-gray-100 rounded-full"
              title="閉じる"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* モデル選択 & 履歴削除 */}
        <div className="flex items-center justify-between">
          <Select value={selectedModel} onValueChange={setSelectedModel}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gpt-4o">
                <div className="flex flex-col">
                  <span className="font-medium">GPT-4o</span>
                  <span className="text-xs text-gray-500">標準・高速</span>
                </div>
              </SelectItem>
              <SelectItem value="gpt-4o-search-preview">
                <div className="flex flex-col">
                  <span className="font-medium">GPT-4o リサーチ</span>
                  <span className="text-xs text-gray-500">検索機能付き</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 hover:bg-red-50 hover:text-red-600 text-gray-600"
                disabled={isChatLoading || messages.length === 0}
                title="履歴削除"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <RotateCcw className="w-5 h-5 text-custom-dark-gray" />
                  チャット履歴をクリア
                </AlertDialogTitle>
                <AlertDialogDescription>
                  チャット履歴をすべて削除します。この操作は取り消せません。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>キャンセル</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleClearHistory}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  履歴をクリア
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* メッセージ表示 */}
      <div className={`flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 ${isFullscreen ? 'max-h-none' : 'max-h-[400px]'}`}>
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`relative flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' ? (
              <div className="w-8 h-8 bg-gradient-to-br from-custom-light-gray to-white rounded-full flex items-center justify-center shadow-inner self-end">
                <Bot className="w-5 h-5 text-custom-dark-gray" />
              </div>
            ) : (
              <div className="w-8 h-8 opacity-0" />
            )}

            <div className={`flex flex-col gap-1 max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`p-3 rounded-2xl ${msg.role === 'user' ? 'bg-custom-dark-gray text-white' : 'bg-white text-custom-black shadow-sm'}`}>
                <div className={`${isFullscreen ? 'text-sm' : 'text-sm'} whitespace-pre-wrap`}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p: ({ children }) => <span>{children}</span>,
                      strong: ({ children }) => <strong className="font-bold">{children}</strong>,
                      em: ({ children }) => <em className="italic">{children}</em>,
                      a: ({ href, children }) => (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">
                          {children}
                        </a>
                      ),
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>

                  {msg.isStreaming && (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({ children }) => <span>{children}</span>,
                        strong: ({ children }) => <strong className="font-bold">{children}</strong>,
                        em: ({ children }) => <em className="italic">{children}</em>,
                        a: ({ href, children }) => (
                          <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">
                            {children}
                          </a>
                        ),
                      }}
                    >
                      {currentStreamingMessage}
                    </ReactMarkdown>
                  )}
                  {msg.isStreaming && <span className="inline-block w-2 h-4 ml-1 bg-gray-400 animate-pulse" />}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{formatTime(msg.message_timestamp)}</span>
                <button
                  onClick={() => copyToClipboard(msg.content)}
                  className="p-1 bg-white border border-gray-200 rounded-full shadow-sm hover:bg-gray-50 text-gray-600"
                  title="メッセージをコピー"
                >
                  <Copy className="w-3 h-3" />
                </button>
              </div>
            </div>

            {msg.role === 'user' ? <div className="w-8 h-8 opacity-0 self-end" /> : <div className="w-8 h-8" />}
          </div>
        ))}
        {isChatLoading && !currentStreamingMessage && (
          <div className="flex items-end gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-custom-light-gray to-white rounded-full flex items-center justify-center shadow-inner">
              <Bot className="w-5 h-5 text-custom-dark-gray" />
            </div>
            <div className="bg-white p-4 rounded-2xl shadow-sm">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
                <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 入力 + 添付 + 送信 */}
      <div className="p-4 border-t bg-white rounded-b-lg">
        {selectedFile && (
          <div className="flex items-center gap-2 p-2 mb-2 bg-gray-50 rounded-lg">
            <FileText className="w-4 h-4 text-custom-dark-gray" />
            <span className="flex-1 text-sm truncate text-custom-black">{selectedFile.name}</span>
            <button onClick={handleRemoveFile} className="p-1 hover:bg-gray-200 rounded-full" title="添付を外す">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        )}

        <div className="relative flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder="メッセージを入力 (⌘+Enter で送信)"
            className={`min-h-[48px] max-h-[120px] resize-none pr-12 focus:ring-2 focus:ring-custom-dark-gray rounded-xl border-gray-200 ${isFullscreen ? 'text-sm' : 'text-sm'}`}
            rows={1}
          />

          {/* hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* 添付ボタン */}
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isChatLoading}
            className="h-[48px] px-4 bg-custom-light-gray hover:bg-gray-200 rounded-xl transition-colors flex-shrink-0"
            title="PDFを添付"
          >
            <Paperclip className="w-5 h-5 text-custom-dark-gray" />
          </Button>

          {/* 送信 */}
          <Button
            onClick={handleMessageSubmit}
            disabled={isChatLoading || (!message.trim() && !selectedFile)}
            className="h-[48px] px-4 bg-custom-dark-gray hover:bg-[#2a292a] rounded-xl transition-colors flex-shrink-0"
            title="送信"
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
