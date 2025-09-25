'use client';

import Link from "next/link";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { UserMenu } from "@/components/ui/user-menu";
import { InitialAvatar } from "@/components/ui/initial-avatar";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Database } from "@/lib/supabase";
import { 
  GraduationCap, 
  BookOpen,
  ChevronRight,
  ChevronLeft,
  ChevronDown, 
  ChevronUp,
  Calendar,
  CheckCircle2,
  Circle,
  Trophy,
  Edit,
  Play,
  Bell,
  AlertCircle,
  MessageSquare
} from "lucide-react";
import { CONSULTATION_LINKS } from "@/lib/constants";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FloatingAiChat } from "@/components/ui/floating-ai-chat";

type Profile = Database['public']['Tables']['profiles']['Row'];
type Term = Database['public']['Tables']['terms']['Row'];
type Lecture = Database['public']['Tables']['lectures']['Row'];

interface Announcement {
  id: string;
  title: string;
  manual_link: string;
  content: string;
  term_id: string | null;
  created_at: string;
}

interface TaskProgress {
  lectureNumber: number;
  status: 'not_started' | 'in_progress' | 'completed';
  completedTasks: number;
  totalTasks: number;
  assignments: { task_id: string; completed: boolean }[];
}

interface DynamicCourse {
  id: number;
  title: string;
  subThemes: Array<{
    id: string;
    title: string;
  }>;
}

export default function MyPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [term, setTerm] = useState<Term | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [showAllAnnouncements, setShowAllAnnouncements] = useState(false);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [taskProgress, setTaskProgress] = useState<TaskProgress[]>([]);
  const [dynamicCourses, setDynamicCourses] = useState<DynamicCourse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string>('');

  const fetchProfileAndData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setUserId(user.id);

    // プロフィール取得
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    if (!profileData || profileError) {
      setIsLoading(false);
      return;
    }
    setProfile(profileData);

    // 期取得
    if (!profileData.term_id) {
      setIsLoading(false);
      return;
    }
    const { data: termData, error: termError } = await supabase
      .from('terms')
      .select('*, manual_link')
      .eq('id', profileData.term_id)
      .single();
    if (!termData || termError) {
      setIsLoading(false);
      return;
    }
    setTerm(termData);

    // 講義スケジュール取得（1回だけ）
    const { data: lecturesData, error: lecturesError } = await supabase
      .from('lectures')
      .select('*')
      .eq('term_id', termData.id)
      .order('lecture_number', { ascending: true });
    if (!lecturesData || lecturesError) {
      setIsLoading(false);
      return;
    }
    setLectures(lecturesData);

    // lecture_config がある場合のみ動的コース生成
    if (termData.lecture_config) {
      const courses = generateDynamicCourses(termData.lecture_config, lecturesData);
      setDynamicCourses(courses);
    }

    // アナウンス取得（1回だけ）
    const { data: announcementsRows, error: announcementsErr } = await supabase
      .from('announcements')
      .select('*')
      .or(`term_id.is.null,term_id.eq.${termData.id}`)
      .order('created_at', { ascending: false });
    if (announcementsRows && !announcementsErr) {
      setAnnouncements(announcementsRows as Announcement[]);
    }

    // 進捗（ユーザー課題）取得
    const { data: uaRows, error: uaError } = await supabase
      .from('user_assignments')
      .select('lecture_id, task_id, completed')
      .eq('user_id', user.id);
    if (uaError || !uaRows) {
      console.error('Error fetching user_assignments:', uaError);
      setIsLoading(false);
      return;
    }

    const progressArray: TaskProgress[] = lecturesData.map((lec) => {
      const rowsForLecture = uaRows.filter(r => r.lecture_id === lec.id);
      const totalTasks = rowsForLecture.length;
      const completedTasks = rowsForLecture.filter(r => r.completed).length;
      const status: TaskProgress['status'] =
        completedTasks === 0
          ? 'not_started'
          : completedTasks === totalTasks
          ? 'completed'
          : 'in_progress';

      return {
        lectureNumber: lec.lecture_number,
        status,
        completedTasks,
        totalTasks,
        assignments: rowsForLecture.map(r => ({
          task_id: r.task_id,
          completed: r.completed,
        })),
      };
    });

    setTaskProgress(progressArray);
    setIsLoading(false);
  };

  // 講義構造から動的コースデータを生成
  const generateDynamicCourses = (lectureConfig: any, lecturesData: Lecture[]): DynamicCourse[] => {
    return lectureConfig.lectures.map((lecture: any) => {
      // 対応する lectures テーブルのレコードを取得
      const lectureRecord = lecturesData.find(l => l.lecture_number === lecture.lectureNumber);
      const customTitle = lectureRecord?.custom_title || '';
      
      return {
        id: lecture.lectureNumber,
        title: `第${lecture.lectureNumber}回講義${customTitle ? `：${customTitle}` : ''}`,
        subThemes: lecture.tasks.map((task: any) => ({
          id: task.taskId,
          title: task.title
        }))
      };
    });
  };

  useEffect(() => {
    fetchProfileAndData();
  }, []);

  const isTaskCompleted = (courseId: number, taskId: string) => {
    const progress = taskProgress.find(p => p.lectureNumber === courseId);
    if (!progress) return false;
    const assignment = progress.assignments.find(a => a.task_id === taskId);
    return assignment?.completed ?? false;
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!profile) {
    return <div>Profile not found</div>;
  }

  const totalCompletedTasks = taskProgress.reduce((sum, p) => sum + p.completedTasks, 0);
  const totalTasks = taskProgress.reduce((sum, p) => sum + p.totalTasks, 0);
  const progressPercentage = totalTasks > 0 ? (totalCompletedTasks / totalTasks) * 100 : 0;

  const today = new Date();
  const nextLectureDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);

  const getButtonConfig = (courseId: number) => {
    const progress = taskProgress.find(p => p.lectureNumber === courseId);
    if (!progress) return {
      text: "開始する",
      variant: "default" as const,
      icon: Play,
      color: "text-white"
    };

    switch (progress.status) {
      case 'completed':
        return {
          text: "提出済み",
          variant: "outline" as const,
          icon: CheckCircle2,
          color: "text-green-600"
        };
      case 'in_progress':
        return {
          text: "未完了",
          variant: "outline" as const,
          icon: Edit,
          color: "text-custom-dark-gray"
        };
      default:
        return {
          text: "開始する",
          variant: "default" as const,
          icon: Play,
          color: "text-white"
        };
    }
  };

  const getLectureSchedule = (lectureNumber: number) => {
    return lectures.find(l => l.lecture_number === lectureNumber);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatScheduleDate = (date: string | null) => {
    if (!date) return null;
    return new Date(date).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  const displayAnnouncements = showAllAnnouncements
    ? announcements
    : announcements.slice(0, 3);

  return (
    <main className="min-h-screen bg-custom-light-gray">
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <GraduationCap className="w-8 h-8 text-custom-dark-gray" />
            <nav className="flex gap-6">
              <Link 
                href="/mypage" 
                className="text-custom-dark-gray font-medium px-3 py-2 rounded-md bg-custom-light-gray"
              >
                マイページ
              </Link>
              {term?.manual_link && (
                <a
                  href={term.manual_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-600 hover:text-custom-black px-3 py-2"
                >
                  受講マニュアル
                </a>
              )}
              <a 
                href={CONSULTATION_LINKS.MEETING}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-600 hover:text-custom-black px-3 py-2 flex items-center gap-1"
              >
                <MessageSquare className="w-4 h-4" />
                個別相談
              </a>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-custom-black">{profile.full_name}</span>
            <UserMenu 
              name={profile.full_name || ''} 
              onProfileUpdate={fetchProfileAndData}
            />
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-[1200px]">
        {/* プロフィール */}
        <div className="mb-8">
          <Card className="p-6 bg-white">
            <div className="flex items-start gap-6">
              <InitialAvatar name={profile.full_name || ''} size="xl" />
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 bg-custom-light-gray text-custom-dark-gray rounded-full text-sm font-medium">
                    {term ? term.name : '期未設定'}
                  </span>
                  <h2 className="text-2xl font-bold text-custom-black">{profile.full_name}</h2>
                </div>
                <div className="space-y-1">
                  <p className="text-custom-black">{profile.company || '--'}</p>
                  <p className="text-custom-black">{profile.department || '--'}</p>
                  <p className="text-custom-black">{profile.position || '--'}</p>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* 全体アナウンス */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-custom-black">全体アナウンス</h2>
            <div className="flex items-center gap-2 text-custom-red">
              <Bell className="w-4 h-4" />
              <span className="text-sm">最新の通知</span>
            </div>
          </div>
          <div className="space-y-4">
            {displayAnnouncements.map((announcement) => (
              <Card key={announcement.id} className="p-4 bg-white">
                <div className="flex items-start gap-4">
                  <div className="mt-1 text-custom-dark-gray">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-medium text-custom-black">{announcement.title}</h3>
                      <span className="text-sm text-custom-red">
                        {formatDate(announcement.created_at)}
                      </span>
                    </div>
                    <div className="text-custom-black text-sm whitespace-pre-wrap">
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
                        {announcement.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
          {announcements.length > 3 && (
            <div className="flex justify-center mt-4">
              <Button
                variant="outline"
                className="flex items-center gap-2"
                onClick={() => setShowAllAnnouncements(!showAllAnnouncements)}
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
            </div>
          )}
        </div>

        {/* 進捗状況 */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-custom-black">学習状況</h2>
            <div className="flex items-center gap-2 text-custom-red">
              <Calendar className="w-4 h-4" />
              <span className="text-sm">
                次回: 第2回 ({nextLectureDate.getMonth() + 1}/{nextLectureDate.getDate()})
              </span>
            </div>
          </div>
          <Card className="p-6 bg-white">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-custom-black">カリキュラム進捗</span>
                  <span className="text-sm font-medium text-custom-black">{progressPercentage.toFixed(1)}%</span>
                </div>
                <Progress value={progressPercentage} className="h-2" />
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-custom-light-gray rounded-lg">
                <Trophy className="w-5 h-5 text-custom-dark-gray" />
                <span className="text-sm font-medium text-custom-black">
                  完了コース数: {taskProgress.filter(p => p.status === 'completed').length}/{dynamicCourses.length}
                </span>
              </div>
            </div>
          </Card>
        </div>

        {/* カリキュラム一覧 */}
        <div>
          <h2 className="text-xl font-bold text-custom-black mb-6">あなたのカリキュラム</h2>
          <div className="space-y-4">
            {dynamicCourses.map((course) => {
              const progress = taskProgress.find(p => p.lectureNumber === course.id);
              const buttonConfig = getButtonConfig(course.id);
              const IconComponent = buttonConfig.icon;
              const schedule = getLectureSchedule(course.id);
              
              return (
                <Card 
                  key={course.id}
                  className={`p-4 ${progress?.status === 'completed' ? 'bg-custom-light-gray' : 'bg-white'}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {progress?.status === 'completed' && (
                          <span className="px-2 py-1 text-xs font-medium text-green-700 bg-green-50 rounded">
                            受講済
                          </span>
                        )}
                        {progress?.status === 'in_progress' && (
                          <span className="px-2 py-1 text-xs font-medium text-custom-dark-gray bg-custom-light-gray rounded">
                            受講中
                          </span>
                        )}
                        {(!progress || progress.status === 'not_started') && (
                          <span className="px-2 py-1 text-xs font-medium text-custom-black bg-custom-light-gray rounded">
                            未完了
                          </span>
                        )}
                        {schedule && (
                          <span className="px-2 py-1 text-xs font-medium text-custom-black bg-custom-light-gray rounded flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatScheduleDate(schedule.schedule)} ({schedule.mode})
                          </span>
                        )}
                        {schedule?.assignment_deadline_date && (
                          <span className="text-xs text-custom-red flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            提出期限: {formatScheduleDate(schedule.assignment_deadline_date)} {schedule.assignment_deadline_time}
                          </span>
                        )}
                      </div>
                      <h3 className="text-lg font-medium text-custom-black mb-1">
                        {course.title}
                      </h3>
                    </div>
                    <Link href={`/lecture/${course.id}`}>
                      <Button 
                        variant={buttonConfig.variant}
                        className={`flex items-center gap-2 ${
                          buttonConfig.variant === 'outline' 
                            ? buttonConfig.color + ' border-custom-dark-gray hover:bg-custom-dark-gray hover:text-white' 
                            : 'bg-custom-dark-gray hover:bg-[#2a292a]'
                        }`}
                      >
                        <IconComponent className="w-4 h-4" />
                        {buttonConfig.text}
                      </Button>
                    </Link>
                  </div>
                  {course.subThemes.length > 0 && (
                    <div className="mt-4 pl-4 flex flex-wrap gap-2">
                      {course.subThemes.map((theme) => {
                        const isCompleted = isTaskCompleted(course.id, theme.id);
                        return (
                          <div 
                            key={theme.id}
                            className="flex items-center gap-2 px-3 py-1.5 bg-custom-light-gray rounded-full"
                          >
                            {isCompleted ? (
                              <CheckCircle2 className="w-4 h-4 text-green-600" />
                            ) : (
                              <Circle className="w-4 h-4 text-gray-400" />
                            )}
                            <span className="text-sm text-custom-black">
                              {theme.title}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      {/* 万能AIチャットボタン（生徒用マイページのみ） */}
      {userId && <FloatingAiChat userId={userId} />}
    </main>
  );
}
