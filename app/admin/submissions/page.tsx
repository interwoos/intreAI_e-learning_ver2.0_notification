"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
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
  CheckCircle2,
  Clock,
  ExternalLink,
  Users,
  TrendingUp,
  FileVideo,
} from "lucide-react";
import { UploadedFileStatus } from "@/components/ui/uploaded-file-status";

interface Student {
  id: string;
  full_name: string;
  company: string;
  term_id: string;
}

interface Assignment {
  user_id: string;
  task_id: string;
  completed: boolean;
  completed_at: string | null;
  sheet_link: string;
  status: string;
  submission_count: number;
  last_cancelled_at: string | null;
  drive_webview_link: string | null;
  upload_file_name: string | null;
}

interface Term {
  id: string;
  name: string;
  term_number: number;
}

interface Lecture {
  id: number;
  lecture_number: number;
  term_id: string;
}

interface StudentProgress {
  student: Student;
  assignments: Assignment[];
  completedCount: number;
  totalCount: number;
  progressPercentage: number;
  preAssignments: Record<string, { allow_file_upload: boolean }>;
}

// 課題IDの定義
const TASK_IDS = [
  { id: '1-0', title: '動画の感想', lecture: 1 },
  { id: '1-1', title: '業界の未来', lecture: 1 },
  { id: '1-2', title: '経営資源', lecture: 1 },
  { id: '2-0', title: '動画の感想', lecture: 2 },
  { id: '2-1', title: 'アイデアシート', lecture: 2 },
  { id: '2-2', title: 'アンゾフのマトリクス', lecture: 2 },
  { id: '2-3', title: '5W2Hシート', lecture: 2 },
  { id: '2-4', title: '3分説明動画', lecture: 2 },
  { id: '3-0', title: '動画の感想', lecture: 3 },
  { id: '3-1', title: 'ヒアリングシート', lecture: 3 },
  { id: '3-2', title: 'ビジネスモデルシート', lecture: 3 },
  { id: '3-3', title: '3分説明動画', lecture: 3 },
  { id: '4-0', title: '動画の感想', lecture: 4 },
  { id: '5-0', title: '動画の感想', lecture: 5 },
  { id: '5-1', title: 'ヒアリングシートver2', lecture: 5 },
  { id: '5-2', title: 'ビジネスモデルシートver2', lecture: 5 },
  { id: '5-3', title: '五ヵ年計画', lecture: 5 },
  { id: '5-4', title: '3分説明動画', lecture: 5 },
  { id: '6-0', title: '動画の感想', lecture: 6 },
  { id: '6-1', title: '五ヵ年計画ver2', lecture: 6 },
  { id: '6-2', title: 'チラシ', lecture: 6 },
  { id: '6-3', title: '3分説明動画', lecture: 6 },
  { id: '7-0', title: '動画の感想', lecture: 7 },
  { id: '7-1', title: 'アレンジメントシート', lecture: 7 },
  { id: '7-2', title: '事業計画書', lecture: 7 },
  { id: '7-3', title: '5分プレゼン動画', lecture: 7 },
  { id: '8-0', title: '動画の感想', lecture: 8 },
  { id: '8-1', title: '最終プレゼン資料', lecture: 8 },
  { id: '9-0', title: '終了後アンケート', lecture: 9 },
];

export default function SubmissionsPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [selectedTerm, setSelectedTerm] = useState<string>("all");
  const [selectedLecture, setSelectedLecture] = useState<string>("all");
  const [studentProgress, setStudentProgress] = useState<StudentProgress[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 期の一覧を取得
  useEffect(() => {
    const fetchTerms = async () => {
      const { data, error } = await supabase
        .from("terms")
        .select("*")
        .order("term_number", { ascending: true });

      if (data && !error) {
        setTerms(data);
      }
    };

    fetchTerms();
  }, []);

  // 学生の進捗データを取得
  useEffect(() => {
    const fetchStudentProgress = async () => {
      setIsLoading(true);

      try {
        // 学生一覧を取得
        let studentsQuery = supabase
          .from("profiles")
          .select("id, full_name, company, term_id")
          .eq("role", "student")
          .order("full_name");

        if (selectedTerm !== "all") {
          studentsQuery = studentsQuery.eq("term_id", selectedTerm);
        }

        const { data: students, error: studentsError } = await studentsQuery;

        if (studentsError || !students) {
          console.error("Error fetching students:", studentsError);
          return;
        }

        // 課題提出状況を取得
        const { data: assignments, error: assignmentsError } = await supabase
          .from("user_assignments")
          .select("user_id, task_id, completed, completed_at, sheet_link, status, submission_count, last_cancelled_at, drive_webview_link, upload_file_name");

        if (assignmentsError || !assignments) {
          console.error("Error fetching assignments:", assignmentsError);
          return;
        }

        // 事前課題設定を取得（ファイルアップロード許可フラグ）
        const termIds = [...new Set(students.map(s => s.term_id))];
        const { data: preAssignments, error: preAssignmentsError } = await supabase
          .from("pre_assignments")
          .select("term_id, assignment_id, allow_file_upload")
          .in("term_id", termIds);

        if (preAssignmentsError) {
          console.error("Error fetching pre_assignments:", preAssignmentsError);
        }

        // 事前課題設定をマップ化
        const preAssignmentsMap: Record<string, Record<string, { allow_file_upload: boolean }>> = {};
        preAssignments?.forEach(pa => {
          if (!preAssignmentsMap[pa.term_id]) {
            preAssignmentsMap[pa.term_id] = {};
          }
          preAssignmentsMap[pa.term_id][pa.assignment_id] = {
            allow_file_upload: !!pa.allow_file_upload
          };
        });
        // 学生ごとの進捗を計算
        const progressData: StudentProgress[] = students.map((student) => {
          const studentAssignments = assignments.filter(
            (assignment) => assignment.user_id === student.id
          );

          // 講義フィルターが適用されている場合
          let filteredTasks = TASK_IDS;
          if (selectedLecture !== "all") {
            const lectureNumber = parseInt(selectedLecture);
            filteredTasks = TASK_IDS.filter(task => task.lecture === lectureNumber);
          }

          const relevantAssignments = studentAssignments.filter(assignment =>
            filteredTasks.some(task => task.id === assignment.task_id)
          );

          // 提出済み（submitted または resubmitted）をカウント
          const completedCount = relevantAssignments.filter(
            (assignment) => assignment.status === 'submitted' || assignment.status === 'resubmitted'
          ).length;

          const totalCount = filteredTasks.length;
          const progressPercentage = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

          return {
            student,
            assignments: relevantAssignments,
            completedCount,
            totalCount,
            progressPercentage,
            preAssignments: preAssignmentsMap[student.term_id] || {}
          };
        });

        setStudentProgress(progressData);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStudentProgress();
  }, [selectedTerm, selectedLecture]);

  // 表示する課題を取得
  const getDisplayTasks = () => {
    if (selectedLecture !== "all") {
      const lectureNumber = parseInt(selectedLecture);
      return TASK_IDS.filter(task => task.lecture === lectureNumber);
    }
    return TASK_IDS;
  };

  // 課題の提出状況を取得（背景色付き）
  const getTaskStatusCell = (studentId: string, taskId: string, preAssignments: Record<string, { allow_file_upload: boolean }>) => {
    const assignment = studentProgress
      .find(p => p.student.id === studentId)
      ?.assignments.find(a => a.task_id === taskId);

    const isFileUploadTask = preAssignments[taskId]?.allow_file_upload || false;
    if (!assignment) {
      return {
        icon: <Clock className="w-4 h-4 text-amber-600" />,
        bgColor: "bg-amber-50",
        completed: false,
        assignment: null,
        status: 'not_started',
        isFileUploadTask,
        hasFile: false
      };
    }

    const hasFile = !!assignment.drive_webview_link;

    // ステータス別の表示を決定
    switch (assignment.status) {
      case 'submitted':
        return {
          icon: (
            <div className="flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4 text-green-700" />
              {(isFileUploadTask ? assignment.drive_webview_link : assignment.sheet_link) && (
                <button
                  onClick={() => window.open(
                    isFileUploadTask ? assignment.drive_webview_link! : assignment.sheet_link, 
                    "_blank"
                  )}
                  className="p-1 hover:bg-green-100 rounded transition-colors"
                >
                  <ExternalLink className="w-3 h-3 text-green-600" />
                </button>
              )}
            </div>
          ),
          bgColor: "bg-green-50",
          completed: true,
          assignment,
          status: 'submitted',
          isFileUploadTask,
          hasFile
        };

      case 'resubmitted':
        return {
          icon: (
            <div className="flex items-center gap-1">
              <div className="relative">
                <CheckCircle2 className="w-4 h-4 text-blue-700" />
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full"></div>
              </div>
              <span className="text-xs font-bold text-blue-700 bg-blue-100 px-1 py-0.5 rounded">再</span>
              {(isFileUploadTask ? assignment.drive_webview_link : assignment.sheet_link) && (
                <button
                  onClick={() => window.open(
                    isFileUploadTask ? assignment.drive_webview_link! : assignment.sheet_link, 
                    "_blank"
                  )}
                  className="p-1 hover:bg-blue-100 rounded transition-colors"
                >
                  <ExternalLink className="w-3 h-3 text-blue-600" />
                </button>
              )}
            </div>
          ),
          bgColor: "bg-blue-50",
          completed: true,
          assignment,
          status: 'resubmitted',
          isFileUploadTask,
          hasFile
        };

      case 'cancelled':
        return {
          icon: (
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 text-orange-600 relative">
                <CheckCircle2 className="w-4 h-4 opacity-50" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-3 h-0.5 bg-orange-600 rotate-45"></div>
                  <div className="w-3 h-0.5 bg-orange-600 -rotate-45 absolute"></div>
                </div>
              </div>
              <span className="text-xs font-bold text-orange-700 bg-orange-100 px-1 py-0.5 rounded">取消</span>
            </div>
          ),
          bgColor: "bg-orange-50",
          completed: false,
          assignment,
          status: 'cancelled',
          isFileUploadTask,
          hasFile
        };

      default:
      return {
          icon: <Clock className="w-4 h-4 text-amber-600" />,
          bgColor: "bg-amber-50",
          completed: false,
          assignment,
          status: 'not_started',
          isFileUploadTask,
          hasFile
      };
    }
  };

  // 完了日時をフォーマット
  const formatCompletedAt = (studentId: string, taskId: string) => {
    const assignment = studentProgress
      .find(p => p.student.id === studentId)
      ?.assignments.find(a => a.task_id === taskId);

    if (assignment?.completed_at) {
      const date = new Date(assignment.completed_at).toLocaleDateString('ja-JP', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      // 提出回数を表示
      const count = assignment.submission_count || 1;
      return count > 1 ? `${date} (v${count})` : date;
    }

    // 取り消し日時を表示
    if (assignment?.last_cancelled_at) {
      return new Date(assignment.last_cancelled_at).toLocaleDateString('ja-JP', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }) + ' (取消)';
    }

    return null;
  };

  // 統計情報を計算
  const totalStudents = studentProgress.length;
  const overallCompletionRate = totalStudents > 0 
    ? studentProgress.reduce((sum, p) => sum + p.progressPercentage, 0) / totalStudents 
    : 0;

  const displayTasks = getDisplayTasks();

  if (isLoading) {
    return <div>読み込み中...</div>;
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-custom-black">課題提出状況</h1>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-blue-600">
            <Users className="w-4 h-4" />
            <span className="text-sm font-medium">受講生: {totalStudents}名</span>
          </div>
          <div className="flex items-center gap-2 text-green-600">
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm font-medium">完了率: {overallCompletionRate.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* フィルター */}
      <Card className="p-6">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-custom-black mb-2">
              期を選択
            </label>
            <Select value={selectedTerm} onValueChange={setSelectedTerm}>
              <SelectTrigger className="focus:ring-custom-dark-gray">
                <SelectValue placeholder="期を選択" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべての期</SelectItem>
                {terms.map((term) => (
                  <SelectItem key={term.id} value={term.id}>
                    {term.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-custom-black mb-2">
              講義で絞り込み
            </label>
            <Select value={selectedLecture} onValueChange={setSelectedLecture}>
              <SelectTrigger className="focus:ring-custom-dark-gray">
                <SelectValue placeholder="講義を選択" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべての講義</SelectItem>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                  <SelectItem key={num} value={num.toString()}>
                    第{num}回
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* 提出状況テーブル */}
      <Card className="p-6">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-custom-black font-semibold min-w-[200px] w-[200px]">受講生</TableHead>
                <TableHead className="text-custom-black font-semibold">進捗</TableHead>
                {displayTasks.map((task) => (
                  <TableHead key={task.id} className="text-custom-black font-semibold text-center min-w-[100px]">
                    <div className="flex flex-col items-center">
                      <span className="text-xs">第{task.lecture}回</span>
                      <span className="text-xs">{task.id}</span>
                      <span className="text-xs text-gray-500">{task.title}</span>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {studentProgress.map((progress) => (
                <TableRow key={progress.student.id}>
                  <TableCell>
                    <div className="min-w-[180px]">
                      <div className="font-medium text-custom-black">
                        {progress.student.full_name}
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        {progress.student.company}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 transition-all duration-300"
                          style={{ width: `${progress.progressPercentage}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-custom-black">
                        {progress.completedCount}/{progress.totalCount}
                      </span>
                      <span className="text-xs text-gray-500">
                        {progress.progressPercentage.toFixed(0)}%
                      </span>
                    </div>
                  </TableCell>
                  {displayTasks.map((task) => {
                    const taskStatus = getTaskStatusCell(progress.student.id, task.id, progress.preAssignments);
                    return (
                      <TableCell 
                        key={task.id} 
                        className={`text-center ${taskStatus.bgColor} border-l border-r border-gray-100`}
                      >
                        <div className="flex flex-col items-center gap-1 py-2">
                          {taskStatus.icon}
                          <span className="text-xs text-gray-600">
                            {formatCompletedAt(progress.student.id, task.id)}
                          </span>
                          {/* ファイルアップロード課題の場合は状況表示 */}
                          {taskStatus.isFileUploadTask && (
                            <div className="mt-1">
                              {taskStatus.hasFile ? (
                                <div className="inline-flex items-center gap-1 justify-center">
                                  <span className="text-xs whitespace-nowrap break-keep leading-none">
                                    動画あり
                                  </span>
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-1 justify-center">
                                  <span className="text-xs whitespace-nowrap break-keep leading-none">
                                    動画なし
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}