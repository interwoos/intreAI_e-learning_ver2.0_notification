"use client";

import { useState, useRef, useEffect, useMemo, memo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { VideoModal } from '@/components/ui/video-modal';
import { EnhancedVideoModal } from '@/components/ui/enhanced-video-modal';
import { StudentVideoList } from '@/components/ui/student-video-list';
import { useLectureVideos } from '@/hooks/useLectureVideos';
import TaskContent from './task-content';
import { ArrowLeft, Play, Bot, Send, FileText, X, Trash2, RotateCcw, AlertTriangle, Copy } from 'lucide-react';
import { Paperclip } from 'lucide-react';
import { IntegratedTabContent, TabItem } from '@/components/ui/integrated-tab-content';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
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
import { SubThemeTabs } from '@/components/ui/sub-theme-tabs';
import { LectureVideoList } from '@/components/ui/lecture-video-list';
import { PromptDebugPanel } from '@/components/ui/prompt-debug-panel';
import { LectureAiChat } from '@/components/ui/lecture-ai-chat';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { supabase } from '@/lib/supabase';
import { loadChatHistory, saveChatMessage, clearChatHistory as clearChatHistoryDB } from '@/lib/chat-history';

interface Course {
  id: number;
  title: string;
  videoTabs: Array<{ id: string; title: string }>;
  subThemes: Array<{ id: string; title: string }>;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  message_timestamp: Date;
  isStreaming?: boolean;
}

interface LectureClientProps {
  courseId: number;
}

/** ← 追加：DBからの allow_file_upload の型揺れを吸収 */
const toBool = (v: any): boolean => v === true || v === 1 || v === "true";

// 事前課題データをプリロードするためのコンテキスト
interface PreAssignmentData {
  assignment_id: string;
  title: string;
  edit_title: string;
  description: string;
  initial_message?: string;
  ai_name?: string;
  ai_description?: string;
  /** ← 追加：学生側でも使う */
  allow_file_upload?: boolean;
}

// メモ化されたTaskContentコンポーネント（プリロードデータ＋termId付き）
const MemoizedTaskContent = memo(({ activeTab, termId, preloadedData }: {
  activeTab: string;
  termId: string;
  preloadedData: PreAssignmentData | null;
}) => (
  <TaskContent activeTab={activeTab} termId={termId} preloadedData={preloadedData} />
));

// メモ化されたビデオタブボタン
const VideoTabButton = memo(({ id, title, isSelected, onClick }: {
  id: string;
  title: string;
  isSelected: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={`py-1.5 sm:py-2 px-3 sm:px-4 rounded-lg text-sm sm:text-base font-medium transition-all ${
      isSelected
        ? 'bg-custom-dark-gray text-white shadow-md'
        : 'bg-custom-light-gray text-custom-black hover:bg-gray-200'
    }`}
  >
    {title}
  </button>
));

function LectureClient({ courseId }: LectureClientProps) {
  const [course, setCourse] = useState<Course | null>(null);
  const [preAssignmentsData, setPreAssignmentsData] = useState<Record<string, PreAssignmentData>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [currentStreamingMessage, setCurrentStreamingMessage] = useState<string>('');
  const [hoveredMessageIndex, setHoveredMessageIndex] = useState<number | null>(null);
  const [userId, setUserId] = useState<string>('');
  const [termId, setTermId] = useState<string>(''); // ← 追加：TaskContentへ渡す
  const [starterMessage, setStarterMessage] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('gpt-4o-search-preview');
  const [currentTaskId, setCurrentTaskId] = useState<string>('');
  const [currentAiName, setCurrentAiName] = useState<string>('');
  const [currentAiDescription, setCurrentAiDescription] = useState<string>('');
  
  // 講義動画取得フック
  const { 
    videos: lectureVideos, 
    isLoading: videosLoading, 
    error: videosError, 
    refetch: refetchVideos 
  } = useLectureVideos(courseId);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const router = useRouter();

  // 講義データを動的に取得
  useEffect(() => {
    const fetchCourseData = async () => {
      try {
        console.log('🎯 講義データ取得開始:', { courseId });
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.error('❌ ユーザー認証失敗');
          router.push('/login');
          return;
        }
        
        console.log('✅ ユーザー認証成功:', user.id);
        setUserId(user.id);

        // ユーザーの期を取得
        const { data: profile } = await supabase
          .from('profiles')
          .select('term_id')
          .eq('id', user.id)
          .single();

        if (!profile?.term_id) {
          console.error('❌ ユーザーの期が見つかりません:', profile);
          setIsLoading(false);
          return;
        }
        
        console.log('✅ ユーザーの期取得成功:', profile.term_id);
        setTermId(profile.term_id); // ← 追加：TaskContentへ渡したいので保持

        // 講義データを取得してカスタムタイトルを適用
        const { data: lectureData, error: lectureError } = await supabase
          .from('lectures')
          .select('custom_title')
          .eq('term_id', profile.term_id)
          .eq('lecture_number', courseId)
          .single();

        let customTitle = '';
        if (!lectureError && lectureData?.custom_title) {
          customTitle = lectureData.custom_title;
        }

        // pre_assignmentsテーブルから該当講義のタスクタイトル等を取得
        console.log('📋 事前課題データ取得開始:', { termId: profile.term_id, courseId });
        
        const { data: preAssignments, error: preAssignmentsError } = await supabase
          .from('pre_assignments')
          .select('assignment_id, title, edit_title, description, initial_message, ai_name, ai_description, allow_file_upload') // ← allow_file_upload 追加
          .eq('term_id', profile.term_id);

        if (preAssignmentsError) {
          console.error('❌ 事前課題データ取得エラー:', preAssignmentsError);
          setIsLoading(false);
          return;
        }

        if (!preAssignments) {
          console.error('❌ 事前課題データが見つかりません');
          setIsLoading(false);
          return;
        }
        
        console.log('✅ 事前課題データ取得成功:', {
          count: preAssignments.length,
          assignments: preAssignments.map(a => ({ id: a.assignment_id, title: a.title }))
        });

        // 事前課題データをマップ形式で保存（allow_file_upload を boolean に正規化）
        const preAssignmentsMap: Record<string, PreAssignmentData> = {};
        preAssignments.forEach((assignment: any) => {
          preAssignmentsMap[assignment.assignment_id] = {
            assignment_id: assignment.assignment_id,
            title: assignment.title,
            edit_title: assignment.edit_title,
            description: assignment.description,
            initial_message: assignment.initial_message,
            ai_name: assignment.ai_name,
            ai_description: assignment.ai_description,
            allow_file_upload: toBool(assignment.allow_file_upload), // ← ここが重要
          };
        });
        setPreAssignmentsData(preAssignmentsMap);
        
        console.log('✅ 事前課題マップ作成完了:', Object.keys(preAssignmentsMap));
        
        // 該当講義のタスクのみをフィルタリング（courseId-xx）
        const lectureTaskIds = preAssignments
          .filter((assignment: any) => assignment.assignment_id.startsWith(`${courseId}-`))
          .sort((a: any, b: any) => {
            // サブタスク番号でソート（例: 1-0, 1-1, 1-2）
            const aSubTask = parseInt(String(a.assignment_id).split('-')[1]);
            const bSubTask = parseInt(String(b.assignment_id).split('-')[1]);
            return aSubTask - bSubTask;
          });
          
        console.log('✅ 該当講義のタスクフィルタリング完了:', {
          courseId,
          filteredTasks: lectureTaskIds.map((t: any) => ({ id: t.assignment_id, title: t.title }))
        });

        // Course データを構築
        const courseData: Course = {
          id: courseId,
          title: `第${courseId}回講義${customTitle ? `：${customTitle}` : ''}`,
          videoTabs: [], // 動画タブは別途実装
          subThemes: lectureTaskIds.map((assignment: any) => ({
            id: assignment.assignment_id,
            title: assignment.title || `課題 ${assignment.assignment_id}` // 元のタスク名のみ使用
          }))
        };
        
        console.log('✅ コースデータ構築完了:', {
          courseId: courseData.id,
          title: courseData.title,
          subThemesCount: courseData.subThemes.length,
          subThemes: courseData.subThemes
        });

        setCourse(courseData);
        if (courseData.subThemes.length > 0) {
          setActiveTab(courseData.subThemes[0].id);
          console.log('✅ 初期アクティブタブ設定:', courseData.subThemes[0].id);
        } else {
          console.warn('⚠️ サブテーマが0件のため、アクティブタブを設定できません');
        }
      } catch (error) {
        console.error('❌ 講義データ取得例外:', error);
      } finally {
        console.log('🏁 講義データ取得処理完了');
        setIsLoading(false);
      }
    };

    fetchCourseData();
  }, [courseId, router]);

  // アクティブタブ変更時にstarterメッセージ等を更新
  useEffect(() => {
    console.log('🎯 アクティブタブ変更:', { 
      activeTab, 
      hasPreAssignmentsData: !!preAssignmentsData[activeTab],
      preAssignmentsDataKeys: Object.keys(preAssignmentsData)
    });
    
    // 現在のタスクIDを更新
    setCurrentTaskId(activeTab);
    
    if (activeTab && preAssignmentsData[activeTab]) {
      const taskData = preAssignmentsData[activeTab];
      
      console.log('📋 タスクデータ詳細:', {
        taskId: activeTab,
        ai_name: taskData.ai_name,
        ai_description: taskData.ai_description,
        initial_message: taskData.initial_message,
        allow_file_upload: taskData.allow_file_upload
      });
      
      // スターターメッセージ更新
      if (taskData.initial_message) {
        setStarterMessage(taskData.initial_message);
        console.log('✅ スターターメッセージ更新:', taskData.initial_message.substring(0, 50) + '...');
      } else {
        setStarterMessage('');
      }
      
      // AI名前と説明を更新
      const aiName = taskData.ai_name || '';
      const aiDescription = taskData.ai_description || '';
      
      setCurrentAiName(aiName);
      setCurrentAiDescription(aiDescription);
      
      console.log('✅ AI情報更新:', { 
        aiName: aiName || '(未設定)', 
        aiDescription: aiDescription || '(未設定)',
        taskId: activeTab
      });
    } else {
      setStarterMessage('');
      setCurrentAiName('');
      setCurrentAiDescription('');
      console.log('⚠️ タスクデータなし:', { 
        activeTab, 
        hasData: !!preAssignmentsData[activeTab],
        availableKeys: Object.keys(preAssignmentsData)
      });
    }
  }, [activeTab, preAssignmentsData]);

  const [currentVideo, setCurrentVideo] = useState<any>(null);

  // チャット履歴をクリアする関数
  const clearChatHistory = async () => {
    if (!userId || !currentTaskId) return;

    // DBから履歴をクリア
    const success = await clearChatHistoryDB(userId, currentTaskId, courseId);
    if (success) {
      console.log('✅ 課題チャット履歴クリア完了');
    } else {
      console.error('❌ 課題チャット履歴クリア失敗');
    }
    
    // 要約トークンもクリア
    clearSummaryToken(currentTaskId);
    console.log('✅ 要約トークンクリア完了:', { taskId: currentTaskId });

    // ローカル状態をクリア
    setMessages(starterMessage ? [{
      role: 'assistant',
      content: starterMessage,
      message_timestamp: new Date(),
    }] : []);
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
  
  // チャット履歴をDBから読み込み
  useEffect(() => {
    if (!userId || !currentTaskId) return;

    const loadHistory = async () => {
      try {
        const historyMessages = await loadChatHistory(userId, currentTaskId, courseId);
        
        if (historyMessages.length > 0) {
          setMessages(historyMessages);
        } else if (starterMessage) {
          setMessages([{
            role: 'assistant',
            content: starterMessage,
            message_timestamp: new Date(),
          }]);
        } else {
          setMessages([]);
        }
        
        console.log('✅ 課題チャット履歴読み込み完了:', historyMessages.length, '件');
      } catch (error) {
        console.error('❌ 課題チャット履歴読み込み失敗:', error);
        if (starterMessage) {
          setMessages([{
            role: 'assistant',
            content: starterMessage,
            message_timestamp: new Date(),
          }]);
        } else {
          setMessages([]);
        }
      }
    };

    loadHistory();
  }, [userId, currentTaskId, courseId, starterMessage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentStreamingMessage]);

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
    if (userId && currentTaskId) {
      await saveChatMessage(
        userId,
        currentTaskId,
        'user',
        userMessage.content,
        undefined,
        courseId
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
  
      // 履歴をAPIに送信
      form.append('history', JSON.stringify(
        nextMessages.map(m => ({ role: m.role, content: m.content }))
      ));
  
      form.append('message', userText);
      form.append('taskId', currentTaskId);
      form.append('model', selectedModel);
      
      // 要約トークンを取得してリクエストに含める
      const summaryToken = loadSummaryToken(currentTaskId);
      if (summaryToken) {
        form.append('summaryToken', summaryToken);
      }
      
      if (selectedFile) form.append('pdf', selectedFile);
  
      // Supabaseセッションを取得してAuthorizationヘッダーに設定
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
        signal: abortControllerRef.current!.signal
      });
  
      // デバッグ: レスポンスヘッダーからプロンプト情報を確認
      console.log('🔍 チャットAPI呼び出し完了:', {
        status: response.status,
        taskId: currentTaskId,
        timestamp: new Date().toISOString()
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

      // アシスタントの回答を表示するためのメッセージを追加（ストリーミング用）
      setMessages(prev => [...prev, assistantMessage]);
      
      let accumulatedMessage = '';
      let newSummaryToken = '';
      let aiInfoReceived = false;
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
  
        const chunk = new TextDecoder().decode(value);
        
        // AI情報の抽出（ストリーム開始時）
        if (chunk.includes('__AI_INFO__:') && !aiInfoReceived) {
          const aiInfoMatch = chunk.match(/__AI_INFO__:([^\n\r]+)/);
          if (aiInfoMatch) {
            try {
              const aiInfo = JSON.parse(aiInfoMatch[1]);
              setCurrentAiName(aiInfo.ai_name || '');
              setCurrentAiDescription(aiInfo.ai_description || '');
              aiInfoReceived = true;
              console.log('✅ AI情報更新:', aiInfo);
              // AI情報部分を除去してメッセージに追加
              const cleanChunk = chunk.replace(/__AI_INFO__:[^\n\r]+\n?/, '');
              if (cleanChunk) {
                accumulatedMessage += cleanChunk;
                setCurrentStreamingMessage(accumulatedMessage);
              }
              continue;
            } catch (parseError) {
              console.error('❌ AI情報解析エラー:', parseError);
            }
          }
        }
        
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
        saveSummaryToken(currentTaskId, newSummaryToken);
        console.log('✅ 要約トークン保存完了:', { taskId: currentTaskId });
      }
  
      // アシスタントメッセージをDBに保存
      if (userId && currentTaskId && accumulatedMessage) {
        await saveChatMessage(
          userId,
          currentTaskId,
          'assistant',
          accumulatedMessage,
          selectedModel,
          courseId
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
        if (userId && currentTaskId) {
          await saveChatMessage(
            userId,
            currentTaskId,
            'assistant',
            'エラーが発生しました。チャット履歴が多すぎる可能性があります。履歴をクリアしてもう一度お試しください。',
            selectedModel,
            courseId
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

  const renderChat = () => (
    <Card className="flex flex-col h-full">
      <div className="flex flex-col p-4 border-b gap-1">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h4 className="font-semibold text-custom-black">
              {currentAiName || 'チャットサポート'}
            </h4>
            <p className="text-xs text-custom-red">
              {currentAiDescription || '課題についてサポートします'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="w-[200px] h-8 text-xs">
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
                  className="flex items-center gap-1 px-3 py-1 h-8 hover:bg-red-50 hover:text-red-600 text-gray-600 whitespace-nowrap"
                  disabled={isChatLoading || messages.length <= 1}
                  title="チャット履歴をクリア"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="text-xs">履歴削除</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <RotateCcw className="w-5 h-5 text-custom-dark-gray" />
                    チャット履歴をクリア
                  </AlertDialogTitle>
                  <AlertDialogDescription className="space-y-2">
                    <p>現在のチャット履歴をすべて削除します。この操作は取り消せません。</p>
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
          </div>
        </div>
        
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 max-h-[600px]">
        {messages.map((msg, idx) => (
         <div
          key={idx}
          className={`relative flex w-full ${
            msg.role === 'user' ? 'justify-end' : 'justify-start'
          }`}
          onMouseEnter={() => setHoveredMessageIndex(idx)}
          onMouseLeave={() => setHoveredMessageIndex(null)}
        >
          {msg.role === 'assistant' ? (
            <div className="w-8 h-8 bg-gradient-to-br from-custom-light-gray to-white rounded-full flex items-center justify-center shadow-inner self-end">
              <Bot className="w-5 h-5 text-custom-dark-gray" />
            </div>
          ) : (
            <div className="w-8 h-8 opacity-0" />
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
            <div className="w-8 h-8 opacity-0 self-end" />
          ) : (
            <div className="w-8 h-8" />
          )}
        </div>
        ))}
        {isChatLoading && !currentStreamingMessage && (
          <div className="flex items-end gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-custom-light-gray to-white rounded-full flex items-center justify-center shadow-inner">
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

      <div className="p-4 border-t bg-white space-y-2">

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
            className="min-h-[48px] max-h-[120px] resize-none pr-12 focus:ring-2 focus:ring-custom-dark-gray rounded-xl border-gray-200 text-sm"
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
    </Card>
  );

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-lg">講義データを読み込み中...</div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-custom-black mb-2">
            講義が見つかりません
          </h2>
          <p className="text-gray-600 mb-4">
            指定された講義は存在しないか、アクセス権限がありません。
          </p>
          <Button onClick={() => router.back()}>
            戻る
          </Button>
        </div>
      </div>
    );
  }

  return (
    <main className="h-screen container mx-auto py-4 px-2 sm:px-4 max-w-[1440px] flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => router.back()}
          className="p-2 border-2 border-custom-dark-gray rounded-lg text-custom-dark-gray hover:bg-custom-dark-gray hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl sm:text-2xl font-bold px-3 sm:px-4 py-2 border-2 border-custom-dark-gray rounded-lg bg-custom-dark-gray text-white tracking-tight shadow-sm">
          {course.title}
        </h1>
      </div>

      <div className="flex-1 flex">
        <ResizablePanelGroup direction="horizontal" className="flex-1 flex overflow-visible">
          <ResizablePanel defaultSize={50} minSize={30} className="flex flex-col overflow-auto">
            <Card className="flex-1 flex flex-col p-4">
              {/* データベースから取得した講義動画 */}
              <StudentVideoList
                videos={lectureVideos}
                isLoading={videosLoading}
                error={videosError}
                onVideoPlay={(video) => {
                  // 動画データを適切な形式に変換
                  const videoData = {
                    title: video.title,
                    url: video.url || '',
                    type: video.url?.includes('youtube.com') || video.url?.includes('youtu.be') 
                      ? 'youtube' 
                      : 'upload'
                  };
                  setCurrentVideo(videoData);
                  setIsVideoModalOpen(true);
                }}
                onRefresh={refetchVideos}
              />

              <h2 className="text-lg sm:text-xl font-semibold text-custom-dark-gray mb-3">
                事前課題
              </h2>
              
              <IntegratedTabContent
                tabs={course.subThemes.map((theme): TabItem => ({
                  id: theme.id,
                  title: theme.title,
                  content: (
                    <MemoizedTaskContent 
                      activeTab={theme.id} 
                      termId={termId}
                      preloadedData={preAssignmentsData[theme.id] || null}
                    />
                  )
                }))}
                defaultActiveTab={activeTab}
                onTabChange={setActiveTab}
                className="flex-1"
              />
            </Card>
          </ResizablePanel>

          <ResizableHandle className="relative w-1 bg-gray-300 hover:bg-gray-400 cursor-col-resize">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-16 flex flex-col items-center justify-center gap-2 bg-gray-200">
              <div className="w-1 h-1 bg-gray-500" />
              <div className="w-1 h-1 bg-gray-500" />
              <div className="w-1 h-1 bg-gray-500" />
            </div>
          </ResizableHandle>

          <ResizablePanel minSize={30} className="flex flex-col overflow-hidden p-4">
            {renderChat()}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* 万能AIチャット（講義画面用・右上配置） */}
      {userId && <LectureAiChat userId={userId} />}

      {currentVideo && (
        (currentVideo.type === 'youtube' || 
         currentVideo.url?.includes('youtube.com') || 
         currentVideo.url?.includes('youtu.be')) ? (
          <VideoModal
            isOpen={isVideoModalOpen}
            onClose={() => setIsVideoModalOpen(false)}
            title={currentVideo.title}
            videoUrl={currentVideo.url}
          />
        ) : (
          <EnhancedVideoModal
            isOpen={isVideoModalOpen}
            onClose={() => setIsVideoModalOpen(false)}
            title={currentVideo.title}
            videoPath={currentVideo.url}
          />
        )
      )}
    </main>
  );
}

export default LectureClient;
