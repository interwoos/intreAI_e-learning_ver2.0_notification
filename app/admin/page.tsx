"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Send,
  Trash2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Filter,
} from "lucide-react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Announcement {
  id: string;
  title: string;
  content: string;
  term_id: string | null;
  created_at: string;
}

interface CompletionEvent {
  student_name: string;
  company: string;
  term_name: string;
  task_id: string;
  completed_at: string;
  sheet_link: string;
}

// デフォルトのアナウンス内容
const defaultAnnouncement = {
  title: "",
  content: "",
  targetTerm: "all",
};

// 課題IDの一覧
const taskIds = [
  "1-0", "1-1", "1-2",
  "2-0", "2-1", "2-2", "2-3", "2-4",
  "3-0", "3-1", "3-2", "3-3",
  "4-0",
  "5-0", "5-1", "5-2", "5-3", "5-4",
  "6-0", "6-1", "6-2", "6-3",
  "7-0", "7-1", "7-2", "7-3",
  "8-0", "8-1",
  "9-0"
];

export default function AdminDashboard() {
  const [terms, setTerms] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [allAnnouncements, setAllAnnouncements] = useState<Announcement[]>([]);
  const [completionEvents, setCompletionEvents] = useState<CompletionEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newAnnouncement, setNewAnnouncement] = useState(defaultAnnouncement);
  const [showAllAnnouncements, setShowAllAnnouncements] = useState(false);
  const [selectedAnnouncementTerm, setSelectedAnnouncementTerm] = useState("all");
  const [selectedCompletionTerm, setSelectedCompletionTerm] = useState("all");
  const [selectedTaskId, setSelectedTaskId] = useState("all");

  // 期の一覧を取得
  useEffect(() => {
    supabase
      .from("terms")
      .select("*")
      .order("term_number", { ascending: true })
      .then(({ data, error }) => {
        if (data && !error) setTerms(data);
      });
  }, []);

  // アナウンスの一覧を取得
  useEffect(() => {
    supabase
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (data && !error) {
          setAllAnnouncements(data);
          setAnnouncements(data.slice(0, 3));
        }
      });
  }, []);

  // アナウンスをフィルタリング
  useEffect(() => {
    let filtered = [...allAnnouncements];
    if (selectedAnnouncementTerm !== "all") {
      filtered = filtered.filter(a => 
        selectedAnnouncementTerm === "common" 
          ? a.term_id === null 
          : a.term_id === selectedAnnouncementTerm
      );
    }
    setAnnouncements(filtered.slice(0, showAllAnnouncements ? undefined : 3));
  }, [selectedAnnouncementTerm, showAllAnnouncements, allAnnouncements]);

  // 課題完了フィードを取得
  useEffect(() => {
    const fetchCompletionEvents = async () => {
      const { data: assignments, error } = await supabase
        .from("user_assignments")
        .select(`
          completed_at,
          task_id,
          sheet_link,
          profiles (
            full_name,
            company,
            term_id,
            terms (
              name
            )
          )
        `)
        .eq("completed", true)
        .order("completed_at", { ascending: false });

      if (error) {
        console.error("Error fetching user_assignments:", error);
        return;
      }
      if (!assignments) return;

      const events: CompletionEvent[] = assignments.map((a: any) => ({
        student_name: a.profiles?.full_name || "（不明）",
        company: a.profiles?.company || "",
        term_name: a.profiles?.terms?.name || "（不明）",
        task_id: a.task_id,
        completed_at: a.completed_at,
        sheet_link: a.sheet_link || "#",
      }));

      setCompletionEvents(events);
    };

    fetchCompletionEvents();

    const subscription = supabase
      .channel("user_assignments_changes")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "user_assignments",
          filter: "completed=true",
        },
        () => {
          fetchCompletionEvents();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleAnnouncementSubmit = async () => {
    setIsLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("announcements")
        .insert({
          title: newAnnouncement.title,
          content: newAnnouncement.content,
          term_id:
            newAnnouncement.targetTerm === "all"
              ? null
              : newAnnouncement.targetTerm,
          created_by: user?.id,
        })
        .select()
        .single();
      if (error) throw error;
      if (data) {
        setAllAnnouncements([data, ...allAnnouncements]);
        setAnnouncements([data, ...announcements.slice(0, 2)]);
        
        // 新しいコード主導通知システムでアナウンス送信
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const notificationResponse = await fetch('/api/notifications/announcement', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session?.access_token}`
            },
            body: JSON.stringify({ announcementId: data.id })
          });
          
          const notificationResult = await notificationResponse.json();
          if (notificationResult.success) {
            console.log('✅ アナウンス通知送信成功:', notificationResult.message);
          } else {
            console.error('❌ アナウンス通知送信失敗:', notificationResult.error);
          }
        } catch (notificationError) {
          console.error('❌ アナウンス通知API呼び出しエラー:', notificationError);
        }
      }
      setNewAnnouncement(defaultAnnouncement);
    } catch (err: any) {
      console.error("Error creating announcement:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    try {
      const { error } = await supabase
        .from("announcements")
        .delete()
        .eq("id", id);
      if (error) throw error;
      
      const updatedAnnouncements = allAnnouncements.filter(a => a.id !== id);
      setAllAnnouncements(updatedAnnouncements);
      setAnnouncements(updatedAnnouncements.slice(0, showAllAnnouncements ? undefined : 3));
    } catch (err: any) {
      console.error("Error deleting announcement:", err);
    }
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  // フィルタリング関数
  const getFilteredCompletionEvents = () => {
    let filtered = [...completionEvents];
    
    // 期でフィルタリング
    if (selectedCompletionTerm !== "all") {
      filtered = filtered.filter(e => e.term_name === terms.find(t => t.id === selectedCompletionTerm)?.name);
    }

    // 課題でフィルタリング
    if (selectedTaskId !== "all") {
      filtered = filtered.filter(e => e.task_id === selectedTaskId);
    }

    return filtered;
  };

  return (
    <div className="space-y-8">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-custom-black">
          事務局管理ページ
        </h1>
      </div>

      {/* 全体アナウンス作成 */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold text-custom-black mb-6">
          全体アナウンス作成
        </h2>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-custom-black">
                タイトル
              </label>
              <Input
                value={newAnnouncement.title}
                onChange={(e) =>
                  setNewAnnouncement({
                    ...newAnnouncement,
                    title: e.target.value,
                  })
                }
                placeholder="アナウンスのタイトルを入力"
                className="focus:ring-custom-dark-gray"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-custom-black">
                対象の期
              </label>
              <Select
                value={newAnnouncement.targetTerm}
                onValueChange={(val) =>
                  setNewAnnouncement({ ...newAnnouncement, targetTerm: val })
                }
              >
                <SelectTrigger className="focus:ring-custom-dark-gray">
                  <SelectValue placeholder="対象の期を選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全期共通</SelectItem>
                  {terms.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-custom-black">
              内容
            </label>
            <Textarea
              value={newAnnouncement.content}
              onChange={(e) =>
                setNewAnnouncement({
                  ...newAnnouncement,
                  content: e.target.value,
                })
              }
              placeholder="アナウンスの内容を入力"
              className="min-h-[150px] focus:ring-custom-dark-gray"
            />
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleAnnouncementSubmit}
              disabled={
                isLoading ||
                !newAnnouncement.title ||
                !newAnnouncement.content
              }
              className="flex items-center gap-2 bg-custom-dark-gray hover:bg-[#2a292a] text-white"
            >
              <Send className="w-4 h-4" />
              アナウンスを送信
            </Button>
          </div>
        </div>
      </Card>

      {/* アナウンス一覧 */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-custom-black">
            アナウンス一覧
          </h2>
          <div className="flex items-center gap-4">
            <Select
              value={selectedAnnouncementTerm}
              onValueChange={setSelectedAnnouncementTerm}
            >
              <SelectTrigger className="w-[200px] focus:ring-custom-dark-gray">
                <SelectValue placeholder="期で絞り込み" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべて表示</SelectItem>
                <SelectItem value="common">全期共通</SelectItem>
                {terms.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-4">
          {announcements.map((a) => (
            <div
              key={a.id}
              className="bg-white p-4 rounded-lg border border-gray-200"
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-medium text-custom-black">
                    {a.title}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {formatDate(a.created_at)}{" • "}
                    {a.term_id
                      ? terms.find((t) => t.id === a.term_id)?.name ||
                        "期が見つかりません"
                      : "全期共通"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteAnnouncement(a.id)}
                  className="text-red-500 hover:text-red-700"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              <div className="text-custom-black whitespace-pre-wrap">
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
                  {a.content}
                </ReactMarkdown>
              </div>
            </div>
          ))}
          {allAnnouncements.length > 3 && (
            <Button
              onClick={() => setShowAllAnnouncements(!showAllAnnouncements)}
              variant="outline"
              className="w-full mt-4 flex items-center gap-2"
            >
              {showAllAnnouncements ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  一部を表示
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  すべて表示
                </>
              )}
            </Button>
          )}
        </div>
      </Card>

      {/* 課題完了フィード */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-custom-black">
            課題完了フィード
          </h2>
          <div className="flex items-center gap-4">
            <Select value={selectedCompletionTerm} onValueChange={setSelectedCompletionTerm}>
              <SelectTrigger className="w-[200px] focus:ring-custom-dark-gray">
                <SelectValue placeholder="期で絞り込み" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべての期</SelectItem>
                {terms.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <Select value={selectedTaskId} onValueChange={setSelectedTaskId}>
                <SelectTrigger className="w-[140px] focus:ring-custom-dark-gray">
                  <SelectValue placeholder="課題で絞り込み" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">すべての課題</SelectItem>
                  {taskIds.map((taskId) => (
                    <SelectItem key={taskId} value={taskId}>
                      課題 {taskId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-custom-black">期</TableHead>
                <TableHead className="text-custom-black">受講生名</TableHead>
                <TableHead className="text-custom-black">会社名</TableHead>
                <TableHead className="text-custom-black">課題</TableHead>
                <TableHead className="text-custom-black">完了日時</TableHead>
                <TableHead className="text-custom-black text-center">
                  課題シート
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {getFilteredCompletionEvents().map((e, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">
                    {e.term_name}
                  </TableCell>
                  <TableCell>{e.student_name}</TableCell>
                  <TableCell>{e.company}</TableCell>
                  <TableCell>{e.task_id}</TableCell>
                  <TableCell>{formatDate(e.completed_at)}</TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        window.open(e.sheet_link, "_blank")
                      }
                      className="flex items-center gap-1 border-custom-dark-gray text-custom-dark-gray hover:bg-custom-dark-gray hover:text-white"
                      disabled={!e.sheet_link || e.sheet_link === "#"}
                    >
                      <ExternalLink className="w-4 h-4" />
                      開く
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}