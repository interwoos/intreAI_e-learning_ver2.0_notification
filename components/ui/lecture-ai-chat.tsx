"use client";

import { useState, useRef, useEffect, memo } from 'react';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { 
  Bot, 
  Send, 
  Paperclip, 
  X, 
  Trash2, 
  RotateCcw, 
  AlertTriangle, 
  Copy,
  Maximize2,
  Minimize2
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from '@/lib/supabase';
import { loadChatHistory, saveChatMessage, clearChatHistory as clearChatHistoryDB } from '@/lib/chat-history';
import { loadSummaryToken, saveSummaryToken, clearSummaryToken } from '@/lib/summary-client';
import { toast } from 'sonner';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  message_timestamp: Date;
  isStreaming?: boolean;
}

interface LectureAiChatProps {
  userId: string;
}

export function LectureAiChat({ userId }: LectureAiChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [message, setMessage] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [currentStreamingMessage, setCurrentStreamingMessage] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('gpt-4o-search-preview');
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const taskId = 'general-support';

  // 初期位置設定
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPosition({
        x: window.innerWidth - 400 - 20,
        y: window.innerHeight - 620 - 20
      });
    }
  }, []);

  // チャット履歴をDBから読み込み
  useEffect(() => {
    if (!userId || !isOpen) return;

    const loadHistory = async () => {
      try {
        const historyMessages = await loadChatHistory(userId, taskId);
        
        if (historyMessages.length > 0) {
          setMessages(historyMessages);
        } else {
          // 万能AIの初期メッセージ
          setMessages([{
            role: 'assistant',
            content: 'イントレ壁打ちAIです。',
            message_timestamp: new Date(),
          }]);
        }
        
        console.log('✅ 万能AIチャット履歴読み込み完了:', historyMessages.length, '件');
      } catch (error) {
        console.error('❌ 万能AIチャット履歴読み込み失敗:', error);
        setMessages([{
          role: 'assistant',
          content: 'イントレ壁打ちAIです。',
          message_timestamp: new Date(),
        }]);
      }
    };

    loadHistory();
  }, [userId, isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentStreamingMessage]);

  // ドラッグ機能
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isFullscreen) return;
    
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
      
      // 画面境界チェック
      const maxX = window.innerWidth - 400;
      const maxY = window.innerHeight - 600;
      
      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY))
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, isFullscreen]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatTime = (date: Date) =>
    new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' }).format(date);

  const handleMessageSubmit = async () => {
    if (!message.trim() && !selectedFile) return;

    const userText = message;
    setMessage('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const userMessage: Message = {
      role: 'user',
      content: userText + (selectedFile ? `\n[添付ファイル: ${selectedFile.name}]` : ''),
      message_timestamp: new Date(),
    };

    // ユーザーメッセージをDBに保存
    if (userId) {
      await saveChatMessage(
        userId,
        taskId,
        'user',
        userMessage.content,
        undefined,
        undefined // 万能AIなのでcourse_idはundefined
      );
    }

    const nextMessages: Message[] = [...messages, userMessage];
    setMessages(nextMessages);
    setIsChatLoading(true);
    setCurrentStreamingMessage('');

    // 前回のリクエストがあればキャンセル
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // 新しいAbortControllerを作成
    abortControllerRef.current = new AbortController();

    try {
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

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

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
        
        // 要約トークンの抽出
        if (chunk.includes('__SUMMARY_TOKEN__:')) {
          const tokenMatch = chunk.match(/__SUMMARY_TOKEN__:([^\n\r]+)/);
          if (tokenMatch) {
            newSummaryToken = tokenMatch[1];
            // トークン部分を除去してメッセージに追加
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
        console.log('✅ 講義AI要約トークン保存完了');
      }

      // アシスタントメッセージをDBに保存
      if (userId && accumulatedMessage) {
        await saveChatMessage(
          userId,
          taskId,
          'assistant',
          accumulatedMessage,
          selectedModel,
          undefined // 万能AIなのでcourse_idはundefined
        );
      }

      setMessages(prev => {
        const newMessages = [...prev];
        const lastMessage = newMessages[newMessages.length - 1];
        if (lastMessage && lastMessage.isStreaming) {
          lastMessage.content = accumulatedMessage;
          lastMessage.isStreaming = false;
          lastMessage.message_timestamp = new Date();
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
        setMessages(prev => [
          ...prev,
          { 
            role: 'assistant',
            content: 'エラーが発生しました。チャット履歴が多すぎる可能性があります。履歴をクリアしてもう一度お試しください。',
            message_timestamp: new Date()
          }
        ]);

        // エラーメッセージもDBに保存
        if (userId) {
          await saveChatMessage(
            userId,
            taskId,
            'assistant',
            'エラーが発生しました。チャット履歴が多すぎる可能性があります。履歴をクリアしてもう一度お試しください。',
            selectedModel,
            undefined
          );
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

  // チャット履歴をクリアする関数
  const clearChatHistory = async () => {
    if (!userId) return;

    // DBから履歴をクリア
    const success = await clearChatHistoryDB(userId, taskId);
    if (success) {
      console.log('✅ 万能AIチャット履歴クリア完了');
      toast.success('チャット履歴をクリアしました');
    } else {
      console.error('❌ 万能AIチャット履歴クリア失敗');
      toast.error('履歴のクリアに失敗しました');
    }
    
    // 要約トークンもクリア
    clearSummaryToken('general-support');
    console.log('✅ 講義AI要約トークンクリア完了');

    // ローカル状態をクリア
    setMessages([{
      role: 'assistant',
      content: 'イントレ壁打ちAIです。',
      message_timestamp: new Date(),
    }]);
    setCurrentStreamingMessage('');
    
    // 進行中のリクエストがあればキャンセル
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsChatLoading(false);
    }
  };

  // コピー機能
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  // 小さい状態（右下隅のボタン）
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-6 right-6 w-16 h-16 bg-custom-dark-gray hover:bg-[#2a292a] text-white rounded-full shadow-lg flex items-center justify-center z-40 transition-all duration-200 hover:scale-105"
        title="壁打ちAI"
      >
        <Bot className="w-8 h-8" />
      </button>
    );
  }

  // 開いているときのパネル（ドラッグ可 / ヘッダーを掴む）
  return (
    <div
      ref={panelRef}
      className={`fixed z-50 bg-white border border-gray-200 shadow-xl flex flex-col ${
        isFullscreen
          ? 'inset-2 md:inset-4 rounded-lg'
          : 'rounded-lg'
      }`}
      style={
        isFullscreen
          ? {}
          : {
              left: position.x,
              top: position.y,
              width: '384px',
              height: '600px'
            }
      }
    >
      {/* ヘッダー（ドラッグハンドル） */}
      <div 
        className={`p-4 border-b bg-white rounded-t-lg ${!isFullscreen ? 'cursor-move' : ''}`}
        onMouseDown={handleMouseDown}
      >
        {/* タイトル行 */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`bg-gradient-to-br from-custom-light-gray to-white rounded-full flex items-center justify-center shadow-inner flex-shrink-0 ${
              isFullscreen ? 'w-10 h-10' : 'w-8 h-8'
            }`}>
              <Bot className={`text-custom-dark-gray ${isFullscreen ? 'w-6 h-6' : 'w-5 h-5'}`} />
            </div>
            <div>
              <h4 className={`font-semibold text-custom-black ${isFullscreen ? 'text-lg' : 'text-base'}`}>
                イントレ壁打ちAI
              </h4>
              <p className={`text-custom-red ${isFullscreen ? 'text-sm' : 'text-xs'}`}>
                学習サポート
              </p>
            </div>
          </div>
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

        {/* コントロール行 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="w-[160px] h-8 text-xs">
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
          </div>
          
          <div className="flex items-center gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-600 text-gray-600"
                  disabled={isChatLoading || messages.length <= 1}
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
                    現在のチャット履歴をすべて削除します。この操作は取り消せません。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>キャンセル</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={clearChatHistory}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    履歴をクリア
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="h-8 w-8 p-0 hover:bg-gray-100 text-gray-600"
              title={isFullscreen ? "縮小" : "拡大"}
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4" />
              ) : (
                <Maximize2 className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* チャットエリア */}
      <div className={`flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 ${
        isFullscreen ? 'max-h-none' : 'max-h-[400px]'
      }`}>
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`relative flex w-full ${
              msg.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {msg.role === 'assistant' ? (
              <div className="w-8 h-8 bg-gradient-to-br from-custom-light-gray to-white rounded-full flex items-center justify-center shadow-inner self-end flex-shrink-0">
                <Bot className="w-5 h-5 text-custom-dark-gray" />
              </div>
            ) : (
              <div className="w-8 h-8 opacity-0 flex-shrink-0" />
            )}
          
            <div
              className={`flex flex-col gap-1 max-w-[80%] ${
                msg.role === 'user' ? 'items-end' : 'items-start'
              }`}
            >
              <div
                className={`p-3 rounded-2xl ${
                  msg.role === 'user'
                    ? 'bg-custom-dark-gray text-white'
                    : 'bg-white text-custom-black shadow-sm'
                }`}
              >
                <div className={`whitespace-pre-wrap ${isFullscreen ? 'text-sm' : 'text-xs'}`}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p: ({ children }) => <span>{children}</span>,
                      strong: ({ children }) => <strong className="font-bold">{children}</strong>,
                      em: ({ children }) => <em className="italic">{children}</em>,
                      a: ({ href, children }) => (
                        <a 
                          href={href} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-blue-600 hover:text-blue-800 underline"
                        >
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
                          <a 
                            href={href} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-blue-600 hover:text-blue-800 underline"
                          >
                            {children}
                          </a>
                        ),
                      }}
                    >
                      {currentStreamingMessage}
                    </ReactMarkdown>
                  )}
                  {msg.isStreaming && (
                    <span className="inline-block w-2 h-4 ml-1 bg-gray-400 animate-pulse" />
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">
                  {formatTime(msg.message_timestamp)}
                </span>
                <button
                  onClick={() => copyToClipboard(msg.content)}
                  className="p-1 bg-white border border-gray-200 rounded-full shadow-sm hover:bg-gray-50 text-gray-600"
                  title="メッセージをコピー"
                >
                  <Copy className="w-3 h-3" />
                </button>
              </div>
            </div>
          
            {msg.role === 'user' ? (
              <div className="w-8 h-8 opacity-0 self-end flex-shrink-0" />
            ) : (
              <div className="w-8 h-8 flex-shrink-0" />
            )}
          </div>
        ))}
        {isChatLoading && !currentStreamingMessage && (
          <div className="flex items-end gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-custom-light-gray to-white rounded-full flex items-center justify-center shadow-inner flex-shrink-0">
              <Bot className="w-5 h-5 text-custom-dark-gray" />
            </div>
            <div className="bg-white p-4 rounded-2xl shadow-sm">
              <div className="flex gap-1">
                <span
                  className="w-2 h-2 bg-gray-300 rounded-full animate-bounce"
                  style={{ animationDelay: '0s' }}
                />
                <span
                  className="w-2 h-2 bg-gray-300 rounded-full animate-bounce"
                  style={{ animationDelay: '0.2s' }}
                />
                <span
                  className="w-2 h-2 bg-gray-300 rounded-full animate-bounce"
                  style={{ animationDelay: '0.4s' }}
                />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 入力エリア */}
      <div className="p-4 border-t bg-white space-y-2 rounded-b-lg">
        {selectedFile && (
          <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
            <FileText className="w-4 h-4 text-custom-dark-gray" />
            <span className="flex-1 text-sm truncate text-custom-black">{selectedFile.name}</span>
            <button
              onClick={handleRemoveFile}
              className="p-1 hover:bg-gray-200 rounded-full"
            >
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
            className={`min-h-[48px] max-h-[120px] resize-none pr-12 focus:ring-2 focus:ring-custom-dark-gray rounded-xl border-gray-200 ${
              isFullscreen ? 'text-sm' : 'text-xs'
            }`}
            rows={1}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isChatLoading}
            className="h-[48px] px-4 bg-custom-light-gray hover:bg-gray-200 rounded-xl transition-colors flex-shrink-0"
          >
            <Paperclip className="w-5 h-5 text-custom-dark-gray" />
          </Button>
          <Button
            onClick={handleMessageSubmit}
            disabled={isChatLoading || (!message.trim() && !selectedFile)}
            className="h-[48px] px-4 bg-custom-dark-gray hover:bg-[#2a292a] rounded-xl transition-colors flex-shrink-0"
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}