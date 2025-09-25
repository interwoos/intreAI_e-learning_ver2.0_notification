"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TermSelect } from "@/components/admin/ai-usage/TermSelect";
import { StudentTable } from "@/components/admin/ai-usage/StudentTable";
import { ChatViewer } from "@/components/admin/ai-usage/ChatViewer";
import { MessageSquare, Users } from "lucide-react";

interface Term {
  id: string;
  name: string;
  term_number: number;
}

interface Student {
  user_id: string;
  name: string;
  company_name: string;
  term_id: string;
}

interface Task {
  id: string;
  title: string;
}

interface SelectedChat {
  userId: string;
  taskId: string;
  studentName: string;
  taskTitle: string;
}

export default function AiUsageMessagesPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [selectedTermId, setSelectedTermId] = useState<string>("all");
  const [students, setStudents] = useState<Student[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedChat, setSelectedChat] = useState<SelectedChat | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 期一覧を取得
  useEffect(() => {
    const fetchTerms = async () => {
      const { data, error } = await supabase
        .from("terms")
        .select("id, name, term_number")
        .order("term_number", { ascending: true });

      if (data && !error) {
        setTerms(data);
      }
    };

    fetchTerms();
  }, []);

  // 受講者一覧を取得
  useEffect(() => {
    const fetchStudents = async () => {
      if (!selectedTermId) return;

      setIsLoading(true);
      try {
        let query = supabase
          .from("profiles")
          .select("id, full_name, company, term_id")
          .eq("role", "student")
          .order("full_name");

        if (selectedTermId !== "all") {
          query = query.eq("term_id", selectedTermId);
        }

        const { data, error } = await query;

        if (data && !error) {
          const studentData: Student[] = data.map(profile => ({
            user_id: profile.id,
            name: profile.full_name || "名前未設定",
            company_name: profile.company || "会社名未設定",
            term_id: profile.term_id || ""
          }));
          setStudents(studentData);
        }
      } catch (error) {
        console.error("受講者取得エラー:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStudents();
  }, [selectedTermId]);

  // タスク一覧を取得
  useEffect(() => {
    const fetchTasks = async () => {
      const taskList: Task[] = [
        { id: "general-support", title: "壁打ちAI" }
      ];

      // 事前課題を取得
      if (selectedTermId !== "all") {
        const { data: preAssignments } = await supabase
          .from("pre_assignments")
          .select("assignment_id, title, edit_title")
          .eq("term_id", selectedTermId)
          .order("assignment_id");

        if (preAssignments) {
          preAssignments.forEach(assignment => {
            taskList.push({
              id: assignment.assignment_id,
              title: assignment.edit_title || assignment.title || `課題 ${assignment.assignment_id}`
            });
          });
        }
      }

      setTasks(taskList);
    };

    fetchTasks();
  }, [selectedTermId]);

  const handleChatSelect = (userId: string, taskId: string) => {
    const student = students.find(s => s.user_id === userId);
    const task = tasks.find(t => t.id === taskId);
    
    if (student && task) {
      setSelectedChat({
        userId,
        taskId,
        studentName: student.name,
        taskTitle: task.title
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* 期選択 */}
      <Card className="p-6">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-custom-black mb-2">
              期を選択
            </label>
            <Select value={selectedTermId} onValueChange={setSelectedTermId}>
              <SelectTrigger className="w-[300px] focus:ring-custom-dark-gray">
                <SelectValue placeholder="期を選択してください" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全期</SelectItem>
                {terms.map((term) => (
                  <SelectItem key={term.id} value={term.id}>
                    {term.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 text-gray-600">
            <Users className="w-4 h-4" />
            <span className="text-sm">受講者: {students.length}名</span>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 受講者一覧 */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-custom-black mb-4 flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            受講者一覧
          </h2>
          
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">
              読み込み中...
            </div>
          ) : students.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              受講者が見つかりません
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>企業名</TableHead>
                    <TableHead>氏名</TableHead>
                    <TableHead>チャット選択</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((student) => (
                    <TableRow key={student.user_id}>
                      <TableCell className="font-medium">
                        {student.company_name}
                      </TableCell>
                      <TableCell>{student.name}</TableCell>
                      <TableCell>
                        <Select onValueChange={(taskId) => handleChatSelect(student.user_id, taskId)}>
                          <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="チャットを選択" />
                          </SelectTrigger>
                          <SelectContent>
                            {tasks.map((task) => (
                              <SelectItem key={task.id} value={task.id}>
                                {task.id === 'general-support' ? task.title : task.id}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>

        {/* チャット表示 */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-custom-black mb-4">
            チャット内容
          </h2>
          
          {selectedChat ? (
            <ChatViewer
              userId={selectedChat.userId}
              taskId={selectedChat.taskId}
              studentName={selectedChat.studentName}
              taskTitle={selectedChat.taskTitle}
            />
          ) : (
            <div className="text-center py-12 text-gray-500">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>受講者とチャットを選択してください</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}