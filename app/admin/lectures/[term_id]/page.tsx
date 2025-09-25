"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useVideos } from "@/hooks/useVideos";
import { useTaskData } from "@/hooks/useTaskData";
import { VideoManager } from "@/components/admin/VideoManager";
import { PreAssignmentEditor } from "@/components/admin/PreAssignmentEditor";
import { TermImportModal } from "@/components/admin/TermImportModal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IntegratedTabContent, TabItem } from "@/components/ui/integrated-tab-content";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";

interface Term {
  id: string;
  name: string;
  term_number: number;
  lecture_config?: {
    totalLectures: number;
    lectures: Array<{
      lectureNumber: number;
      tasks: Array<{
        taskId: string;
        title: string;
        lectureNumber: number;
        subTaskNumber: number;
      }>;
    }>;
  };
}

interface DynamicCourse {
  id: number;
  title: string;
  subThemes: Array<{ id: string; title: string }>;
}

interface LectureEditorPageProps {
  params: { term_id: string };
}

type SaveField = "tab_title" | "edit_title" | "description" | "allow_file_upload";

export default function LectureEditorPage({ params }: LectureEditorPageProps) {
  // ---------------- State (hooksは常にトップレベルで宣言) ----------------
  const [term, setTerm] = useState<Term | null>(null);
  const [dynamicCourses, setDynamicCourses] = useState<DynamicCourse[]>([]);
  const [selectedLecture, setSelectedLecture] = useState<string>("1");
  const [activeTaskTab, setActiveTaskTab] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [currentEditingTaskId, setCurrentEditingTaskId] = useState<string>("");
  const [lectureCustomTitles, setLectureCustomTitles] = useState<Record<number, string>>({});

  // hooks
  const videoManager = useVideos(params.term_id, selectedLecture);
  const taskManager = useTaskData();

  // ---------------- Data loaders ----------------
  useEffect(() => {
    fetchTerm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.term_id]);

  useEffect(() => {
    if (selectedLecture && term?.lecture_config) {
      loadVideosForLecture(selectedLecture);
      loadTaskDataForLecture(selectedLecture);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLecture, term]);

  async function loadVideosForLecture(lectureId: string) {
    try {
      const { data: videos, error } = await supabase
        .from("lecture_videos")
        .select("id, title, subtitle, url, display_order")
        .eq("term_id", params.term_id)
        .eq("lecture_number", parseInt(lectureId))
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) {
        console.error("❌ 講義動画取得エラー:", error);
        return;
      }

      const videoData =
        videos?.map((v: any) => ({
          id: String(v.id),
          title: v.title || "",
          subtitle: v.subtitle || "",
          type:
            v.url?.includes("youtube.com") || v.url?.includes("youtu.be")
              ? "youtube"
              : "upload",
          url: v.url || "",
        })) ?? [];

      videoManager.loadVideos(videoData);
    } catch (e) {
      console.error("❌ 動画読み込み例外:", e);
      videoManager.loadVideos([]);
    }
  }

  async function loadTaskDataForLecture(lectureId: string) {
    try {
      const { data: rows, error } = await supabase
        .from("pre_assignments")
        .select("assignment_id, tab_title, edit_title, description, allow_file_upload")
        .eq("term_id", params.term_id)
        .like("assignment_id", `${lectureId}-%`);

      if (error) {
        console.error("❌ 課題データ取得エラー:", error);
        return;
      }

      const map: Record<
        string,
        { tab_title: string; edit_title: string; description: string; allow_file_upload: boolean }
      > = {};
      (rows ?? []).forEach((a) => {
        map[a.assignment_id] = {
          tab_title: a.tab_title ?? "",
          edit_title: a.edit_title ?? "",
          description: a.description ?? "",
          allow_file_upload: !!a.allow_file_upload,
        };
      });
      taskManager.loadTaskData(map);
    } catch (e) {
      console.error("❌ 課題データ読み込み例外:", e);
    }
  }

  async function fetchTerm() {
    const { data: termData, error } = await supabase
      .from("terms")
      .select("*, lecture_config")
      .eq("id", params.term_id)
      .single();

    if (error) {
      console.error("❌ terms取得エラー:", error);
      setIsLoading(false);
      return;
    }

    if (termData?.lecture_config) {
      const { data: lecturesData, error: lectureErr } = await supabase
        .from("lectures")
        .select("*")
        .eq("term_id", params.term_id)
        .order("lecture_number", { ascending: true });

      if (lectureErr) {
        console.error("講義データ取得エラー:", lectureErr);
      }

      const courses: DynamicCourse[] = (termData.lecture_config.lectures || []).map(
        (lecture: any) => {
          const lectureRecord = lecturesData?.find(
            (l) => l.lecture_number === lecture.lectureNumber
          );
          const customTitle = lectureRecord?.custom_title || "";
          setLectureCustomTitles((prev) => ({
            ...prev,
            [lecture.lectureNumber]: customTitle,
          }));
          return {
            id: lecture.lectureNumber,
            title: `第${lecture.lectureNumber}回講義${customTitle ? `：${customTitle}` : ""}`,
            subThemes: lecture.tasks.map((t: any) => ({
              id: t.taskId,
              title: t.title,
            })),
          };
        }
      );

      setTerm(termData);
      setDynamicCourses(courses);
      if (courses.length) setSelectedLecture(String(courses[0].id));
    } else {
      setTerm(termData ?? null);
    }

    setIsLoading(false);
  }

  // ---------------- 選択中コース算出（Hookは早期returnより前） ----------------
  const selectedCourse = useMemo(
    () => dynamicCourses.find((c) => c.id === parseInt(selectedLecture)),
    [dynamicCourses, selectedLecture]
  );

  useEffect(() => {
    if (selectedCourse && selectedCourse.subThemes.length > 0) {
      setActiveTaskTab(selectedCourse.subThemes[0].id);
      setCurrentEditingTaskId(selectedCourse.subThemes[0].id);
    }
  }, [selectedCourse]);

  // ---------------- デバウンス保存（useRef + useCallback） ----------------
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const debouncedSaveTaskData = useCallback(
    (taskId: string, field: SaveField, value: string | boolean) => {
      const key = `${taskId}-${field}`;
      const existing = timersRef.current.get(key);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(async () => {
        try {
          const payload: Record<string, any> = {
            term_id: params.term_id,
            assignment_id: taskId,
            updated_at: new Date().toISOString(),
          };
          payload[field] =
            field === "allow_file_upload" ? !!value : String(value ?? "");

          const { error } = await supabase
            .from("pre_assignments")
            .upsert(payload, { onConflict: "term_id,assignment_id" });

          if (error) {
            console.error("❌ 保存エラー:", error);
            toast.error(`保存に失敗しました: ${error.message}`);
          }
        } catch (e) {
          console.error("❌ 保存例外:", e);
          toast.error("保存に失敗しました");
        } finally {
          timersRef.current.delete(key);
        }
      }, 500);

      timersRef.current.set(key, timer);
    },
    [params.term_id]
  );

  // ---------------- 他のハンドラ（フックの後） ----------------
  const handleSaveVideoData = async () => {
    setIsSaving(true);
    try {
      if (!term?.id) throw new Error("期の情報が取得できません");
      toast.success("設定を保存しました");
    } catch (e) {
      console.error("❌ 保存エラー:", e);
      toast.error(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTabTitleChange = (taskId: string, v: string) => {
    taskManager.updateTaskData(taskId, "tab_title", v);
    debouncedSaveTaskData(taskId, "tab_title", v);
  };
  const handleTaskTitleChange = (taskId: string, v: string) => {
    taskManager.updateTaskData(taskId, "edit_title", v);
    debouncedSaveTaskData(taskId, "edit_title", v);
  };
  const handleDescriptionChange = (taskId: string, v: string) => {
    taskManager.updateTaskData(taskId, "description", v);
    debouncedSaveTaskData(taskId, "description", v);
  };
  const handleAllowUploadToggle = (taskId: string, checked: boolean) => {
    taskManager.updateTaskData(taskId, "allow_file_upload", checked);
    debouncedSaveTaskData(taskId, "allow_file_upload", checked);
  };
  const handleTaskTabChange = (taskId: string) => {
    setActiveTaskTab(taskId);
    setCurrentEditingTaskId(taskId);
  };

  // ---------------- ここで初めて早期return（全フックの後） ----------------
  if (isLoading) return <div>読み込み中...</div>;
  if (!term) return <div>期が見つかりません</div>;

  // ---------------- Render ----------------
  return (
    <main className="min-h-screen bg-gradient-to-br from-custom-light-gray to-white flex flex-col">
      {/* ヘッダー */}
      <div className="p-4 border-b bg-white/80 backdrop-blur-sm flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/students">
            <Button
              variant="outline"
              className="p-2 border-2 border-custom-dark-gray text-custom-dark-gray hover:bg-custom-dark-gray hover:text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>

          <div className="flex items-center gap-4">
            <div className="px-4 py-2 bg-custom-dark-gray text-white rounded-lg font-medium">
              {term.name} ({term.lecture_config?.totalLectures}回講義)
            </div>

            <Select value={selectedLecture} onValueChange={setSelectedLecture}>
              <SelectTrigger className="w-[200px] focus:ring-custom-dark-gray">
                <SelectValue placeholder="講義を選択" />
              </SelectTrigger>
              <SelectContent>
                {dynamicCourses.map((course) => (
                  <SelectItem key={course.id} value={String(course.id)}>
                    {course.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <TermImportModal
            targetTermId={params.term_id}
            targetTermName={term?.name || ""}
            onImportComplete={() => {
              fetchTerm();
              if (selectedLecture && term?.lecture_config) {
                loadVideosForLecture(selectedLecture);
                loadTaskDataForLecture(selectedLecture);
              }
            }}
          />
          <Button
            onClick={handleSaveVideoData}
            disabled={isSaving}
            className="bg-custom-dark-gray hover:bg-[#2a292a] text-white"
          >
            {isSaving ? (
              <>
                <div className="w-4 h-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                保存中...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                設定を保存
              </>
            )}
          </Button>
        </div>
      </div>

      {/* メイン */}
      <div className="flex-1 flex">
        <ResizablePanelGroup direction="horizontal" className="flex-1 flex overflow-visible">
          {/* 左パネル */}
          <ResizablePanel defaultSize={50} minSize={30} className="flex flex-col overflow-auto">
            <Card className="flex-1 flex flex-col p-4">
              <VideoManager
                videos={videoManager.videos}
                isVideoUploading={videoManager.isVideoUploading}
                uploadProgress={videoManager.uploadProgress}
                isSaving={videoManager.isSaving}
                isDeleting={videoManager.isDeleting}
                deleteConfirmVideo={videoManager.deleteConfirmVideo}
                onAddVideo={videoManager.addVideo}
                onDeleteVideo={videoManager.deleteVideo}
                onDeleteClick={videoManager.setDeleteConfirmVideo}
                onCancelDelete={() => videoManager.setDeleteConfirmVideo(null)}
                isReloading={videoManager.isReloading}
                onReload={videoManager.reloadVideos}
              />

              {selectedCourse && (
                <IntegratedTabContent
                  tabs={selectedCourse.subThemes.map(
                    (theme): TabItem => ({
                      id: theme.id,
                      title: taskManager.taskData[theme.id]?.tab_title || theme.title,
                      isEditable: true,
                      onTitleEdit: (newTitle) => handleTabTitleChange(theme.id, newTitle),
                      originalTitle: theme.title,
                      content: (
                        <div className="bg-gradient-to-br from-custom-light-gray to-white p-4 rounded-lg border-t-0 rounded-t-none">
                          <div className="space-y-3">
                            <div>
                              <label className="block text-sm font-medium text-custom-black mb-1">
                                課題タイトル（本文見出し）
                              </label>
                              <Input
                                value={taskManager.taskData[theme.id]?.edit_title || ""}
                                onChange={(e) => handleTaskTitleChange(theme.id, e.target.value)}
                                placeholder={theme.title}
                              />
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-custom-black mb-1">
                                課題の説明・指示
                              </label>
                              <Textarea
                                placeholder="説明・指示を入力してください"
                                className="min-h-[120px]"
                                value={taskManager.taskData[theme.id]?.description || ""}
                                onChange={(e) => handleDescriptionChange(theme.id, e.target.value)}
                              />
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-custom-black mb-1">
                                ファイルアップロード設定
                              </label>
                              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                                <input
                                  type="checkbox"
                                  checked={!!taskManager.taskData[theme.id]?.allow_file_upload}
                                  onChange={(e) =>
                                    handleAllowUploadToggle(theme.id, e.target.checked)
                                  }
                                  className="w-4 h-4 text-custom-dark-gray focus:ring-custom-dark-gray border-gray-300 rounded"
                                />
                                <span className="text-sm text-custom-black">
                                  学生にファイルアップロードを許可する
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 mt-1">
                                有効にすると、学生画面に「ファイルを選択」ボタンが表示されます。
                              </p>
                            </div>
                          </div>
                        </div>
                      ),
                    })
                  )}
                  defaultActiveTab={activeTaskTab}
                  onTabChange={handleTaskTabChange}
                  className="flex-1"
                />
              )}
            </Card>
          </ResizablePanel>

          <ResizableHandle className="relative w-1 bg-gray-300 hover:bg-gray-400 cursor-col-resize" />

          {/* 右パネル */}
          <ResizablePanel minSize={30} className="flex flex-col overflow-hidden">
            <PreAssignmentEditor
              termId={params.term_id}
              assignmentId={currentEditingTaskId}
              taskTitle={
                selectedCourse?.subThemes.find((t) => t.id === activeTaskTab)?.title || ""
              }
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </main>
  );
}
