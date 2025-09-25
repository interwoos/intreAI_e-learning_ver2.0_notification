"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { Bot, User, Copy, ChevronLeft, ChevronRight } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  message_timestamp: string;
}

interface ChatViewerProps {
  userId: string;
  taskId: string;
  studentName: string;
  taskTitle: string;
}

export function ChatViewer({ 
  userId, 
  taskId, 
  studentName, 
  taskTitle 
}: ChatViewerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [initialized, setInitialized] = useState(false);
  const pageSize = 50;

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 下端（最新）へオートスクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // チャット履歴を取得（古い→新しいの昇順で取得）
  useEffect(() => {
    const fetchMessages = async () => {
      setIsLoading(true);
      try {
        // course_idを取得（課題チャットの場合）
        let courseId: number | null = null;
        if (taskId !== 'general-support') {
          const lectureNumber = parseInt(taskId.split('-')[0]);
          if (!isNaN(lectureNumber)) {
            courseId = lectureNumber;
          }
        }

        let query = supabase
          .from("chat_history")
          .select("id, role, content, model, message_timestamp", { count: 'exact' })
          .eq("user_id", userId)
          .eq("task_id", taskId)
          // ★ 古い→新しい（昇順）
          .order("message_timestamp", { ascending: true })
          .range((currentPage - 1) * pageSize, currentPage * pageSize - 1);

        // course_idでフィルタ
        if (courseId !== null) {
          query = query.eq("course_id", courseId);
        } else if (taskId === 'general-support') {
          query = query.is("course_id", null);
        }

        const { data, error, count } = await query;

        if (error) {
          console.error("チャット履歴取得エラー:", error);
          return;
        }

        const total = Math.max(0, count ?? 0);
        const lastPage = Math.max(1, Math.ceil(total / pageSize));
        setTotalPages(lastPage);

        // 初回ロード時は最新ページへジャンプ
        if (!initialized) {
          setInitialized(true);
          if (currentPage !== lastPage) {
            setCurrentPage(lastPage);
            return; // 一旦終了し、ページ番号が変わった次のループで再フェッチ
          }
        }

        setMessages(data || []);
      } catch (error) {
        console.error("チャット履歴取得例外:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMessages();
  }, [userId, taskId, currentPage, initialized]);

  // ユーザー/タスクが変わったらページ状態を初期化
  useEffect(() => {
    setCurrentPage(1);
    setInitialized(false);
  }, [userId, taskId]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <div className="text-center py-8 text-gray-500">
        読み込み中...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ヘッダー情報 */}
      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
        <div className="flex items-center gap-2 text-blue-800">
          <User className="w-4 h-4" />
          <span className="font-medium">{studentName}</span>
          <span className="text-blue-600">-</span>
          <span>{taskTitle}</span>
        </div>
        <div className="text-sm text-blue-600 mt-1">
          表示件数: {messages.length}件（{currentPage}/{totalPages}）
        </div>
      </div>

      {/* チャット履歴（古い→新しい／下に最新が来る） */}
      <div className="space-y-4 max-h-[600px] overflow-y-auto">
        {messages.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Bot className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>チャット履歴がありません</p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex w-full ${
                message.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {message.role === 'assistant' && (
                <div className="w-8 h-8 bg-gradient-to-br from-custom-light-gray to-white rounded-full flex items-center justify-center shadow-inner self-end mr-2">
                  <Bot className="w-5 h-5 text-custom-dark-gray" />
                </div>
              )}
              
              <div className={`flex flex-col gap-1 max-w-[80%] ${
                message.role === 'user' ? 'items-end' : 'items-start'
              }`}>
                <div className={`p-3 rounded-2xl ${
                  message.role === 'user'
                    ? 'bg-custom-dark-gray text-white'
                    : 'bg-white text-custom-black shadow-sm border'
                }`}>
                  <div className="text-sm whitespace-pre-wrap">
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
                      {message.content}
                    </ReactMarkdown>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">
                    {formatTime(message.message_timestamp)}
                  </span>
                  {message.model && (
                    <span className="text-xs text-gray-400">
                      {message.model}
                    </span>
                  )}
                  <button
                    onClick={() => copyToClipboard(message.content)}
                    className="p-1 bg-white border border-gray-200 rounded-full shadow-sm hover:bg-gray-50 text-gray-600"
                    title="メッセージをコピー"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {message.role === 'user' && (
                <div className="w-8 h-8 bg-custom-dark-gray rounded-full flex items-center justify-center shadow-sm self-end ml-2">
                  <User className="w-5 h-5 text-white" />
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ページネーション */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-gray-600">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
