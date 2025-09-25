'use client';

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Save, FileText } from "lucide-react";

interface LectureSchedule {
  lectureNumber: number;
  date: string;
  format: "対面" | "オンライン";
  taskDeadline: string;
  taskDeadlineTime: string;
  settings: {
    timeSchedule: string;
    roleAssignment: string;
    materialLinks: string;
    storageFolder: string;
    notes: string;
  };
}

interface Term {
  id: string;
  name: string;
  term_number: number;
  start_date: string;
  end_date: string;
  manual_link: string;
  schedules: LectureSchedule[];
}

export default function SchedulePage() {
  const [selectedTerm, setSelectedTerm] = useState<string>("");
  const [terms, setTerms] = useState<Term[]>([]);

  useEffect(() => {
    fetchTerms();
  }, []);

  const fetchTerms = async () => {
    const { data: termsData, error: termsError } = await supabase
      .from('terms')
      .select('*, manual_link')
      .order('term_number', { ascending: true });

    if (termsData && !termsError) {
      const termsWithSchedules = termsData.map(term => ({
        ...term,
        manual_link: term.manual_link || '',
        schedules: [] as LectureSchedule[]
      }));
      setTerms(termsWithSchedules);
    }
  };

  const handleTermSelect = async (termId: string) => {
    setSelectedTerm(termId);

    const { data: lectures, error: lecturesError } = await supabase
      .from('lectures')
      .select('*')
      .eq('term_id', termId)
      .order('lecture_number');

    if (lecturesError) {
      console.error('Error fetching lectures:', lecturesError);
      return;
    }

    if (!lectures || lectures.length === 0) {
      // 8回分の講義を自動生成
      const newLectures = Array(9).fill(null).map((_, i) => ({
        term_id: termId,
        lecture_number: i + 1,
        mode: 'オンライン',
        assignment_deadline_date: null,
        assignment_deadline_time: '17:00'
      }));

      const { error: insertError } = await supabase
        .from('lectures')
        .insert(newLectures);

      if (insertError) {
        console.error('Error creating lectures:', insertError);
        return;
      }

      const { data: createdLectures } = await supabase
        .from('lectures')
        .select('*')
        .eq('term_id', termId)
        .order('lecture_number');

      if (createdLectures) {
        const schedules = createdLectures.map(lecture => ({
          lectureNumber: lecture.lecture_number,
          date: lecture.schedule || "",
          format: (lecture.mode as "対面" | "オンライン") || "オンライン",
          taskDeadline: lecture.assignment_deadline_date || "",
          taskDeadlineTime: lecture.assignment_deadline_time || "17:00",
          settings: {
            timeSchedule: lecture.time_schedule || "",
            roleAssignment: lecture.roles || "",
            materialLinks: lecture.materials_link || "",
            storageFolder: lecture.folder || "",
            notes: lecture.remarks || ""
          }
        }));
        setTerms(prev =>
          prev.map(term => term.id === termId ? { ...term, schedules } : term)
        );
      }
    } else {
      const schedules = lectures.map(lecture => ({
        lectureNumber: lecture.lecture_number,
        date: lecture.schedule || "",
        format: (lecture.mode as "対面" | "オンライン") || "オンライン",
        taskDeadline: lecture.assignment_deadline_date || "",
        taskDeadlineTime: lecture.assignment_deadline_time || "17:00",
        settings: {
          timeSchedule: lecture.time_schedule || "",
          roleAssignment: lecture.roles || "",
          materialLinks: lecture.materials_link || "",
          storageFolder: lecture.folder || "",
          notes: lecture.remarks || ""
        }
      }));
      setTerms(prev =>
        prev.map(term => term.id === termId ? { ...term, schedules } : term)
      );
    }
  };

  const updateSchedule = (
    termId: string,
    lectureNumber: number,
    field: keyof LectureSchedule | keyof LectureSchedule['settings'],
    value: string
  ) => {
    setTerms(terms.map(term =>
      term.id === termId
        ? {
            ...term,
            schedules: term.schedules.map(s =>
              s.lectureNumber === lectureNumber
                ? field in s
                  ? { ...s, [field]: value }
                  : { ...s, settings: { ...s.settings, [field]: value } }
                : s
            )
          }
        : term
    ));
  };

  const updateTermField = (termId: string, field: string, value: string) => {
    setTerms(terms.map(term =>
      term.id === termId
        ? { ...term, [field]: value }
        : term
    ));
  };

  const saveSchedules = async () => {
    try {
      const current = terms.find(t => t.id === selectedTerm);
      if (!current) return;

      // 期の基本情報を更新
      const { error: termError } = await supabase
        .from('terms')
        .update({
          manual_link: current.manual_link
        })
        .eq('id', selectedTerm);

      if (termError) {
        console.error('期情報更新エラー:', termError);
        alert('期情報の保存に失敗しました');
        return;
      }

      // 講義スケジュールを更新
      const updates = current.schedules.map(s => ({
        term_id: current.id,
        lecture_number: s.lectureNumber,
        schedule: s.date || null,
        mode: s.format,
        assignment_deadline_date: s.taskDeadline || null,
        assignment_deadline_time: s.taskDeadlineTime || null,
        time_schedule: s.settings.timeSchedule,
        roles: s.settings.roleAssignment,
        materials_link: s.settings.materialLinks,
        folder: s.settings.storageFolder,
        remarks: s.settings.notes
      }));

      const { error } = await supabase
        .from('lectures')
        .upsert(updates, { onConflict: 'term_id,lecture_number' });

      if (error) throw error;
      alert("スケジュールと期情報を保存しました");
    } catch (err) {
      console.error("Error saving schedules:", err);
      alert("スケジュールまたは期情報の保存に失敗しました");
    }
  };

  const currentTerm = terms.find(t => t.id === selectedTerm);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-custom-black">講義スケジュール管理</h1>
        <Button onClick={saveSchedules} className="flex items-center gap-2 bg-custom-dark-gray hover:bg-[#2a292a] text-white">
          <Save className="w-4 h-4" />
          保存
        </Button>
      </div>

      <Card className="p-6">
        <div className="flex items-end gap-4 mb-6">
          <div className="flex-1 space-y-2">
            <label className="block text-sm font-medium text-custom-black">期を選択</label>
            <Select value={selectedTerm} onValueChange={handleTermSelect}>
              <SelectTrigger className="focus:ring-custom-dark-gray">
                <SelectValue placeholder="期を選択してください" />
              </SelectTrigger>
              <SelectContent>
                {terms.map(term => (
                  <SelectItem key={term.id} value={term.id}>
                    {term.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {currentTerm && (
          <>
            <h2 className="mb-4 text-lg font-semibold text-custom-black">
              {currentTerm.name}のスケジュール
            </h2>
            
            {/* 期の基本設定 */}
            <Card className="p-4 mb-6 bg-blue-50 border-blue-200">
              <h3 className="text-md font-semibold text-blue-900 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5" />
                期の基本設定
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-blue-900 mb-2">
                    受講マニュアルリンク
                  </label>
                  <Input
                    type="url"
                    value={currentTerm.manual_link}
                    onChange={(e) => updateTermField(selectedTerm, 'manual_link', e.target.value)}
                    placeholder="https://docs.google.com/document/d/..."
                    className="focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-xs text-blue-700 mt-1">
                    この期の受講生のマイページヘッダーに表示されるマニュアルリンクです
                  </p>
                </div>
              </div>
            </Card>
            
            <Accordion type="single" collapsible className="mb-8">
              {currentTerm.schedules.map(s => (
                <AccordionItem key={s.lectureNumber} value={`lec-${s.lectureNumber}`}>
                  <AccordionTrigger>
                    <div className="flex items-center justify-between">
                      <span>第{s.lectureNumber}回講義</span>
                      {s.date && <span className="text-sm text-custom-red">{s.date} ({s.format})</span>}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    {/* 日程設定 */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="text-sm font-medium">日程</label>
                        <Input
                          type="date"
                          value={s.date}
                          onChange={e => updateSchedule(selectedTerm, s.lectureNumber, 'date', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">形式</label>
                        <Select
                          value={s.format}
                          onValueChange={(val: "対面" | "オンライン") =>
                            updateSchedule(selectedTerm, s.lectureNumber, 'format', val)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="対面">対面</SelectItem>
                            <SelectItem value="オンライン">オンライン</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-sm font-medium">課題締切日</label>
                        <Input
                          type="date"
                          value={s.taskDeadline}
                          onChange={e => updateSchedule(selectedTerm, s.lectureNumber, 'taskDeadline', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">締切時刻</label>
                        <Input
                          type="time"
                          value={s.taskDeadlineTime}
                          onChange={e => updateSchedule(selectedTerm, s.lectureNumber, 'taskDeadlineTime', e.target.value)}
                        />
                      </div>
                    </div>
                    {/* 詳細設定 */}
                    <div className="space-y-4">
                      <div>
                        <label className="flex items-center gap-2 text-sm font-medium">
                          <FileText className="w-4 h-4" />
                          タイムスケジュール
                        </label>
                        <Textarea
                          value={s.settings.timeSchedule}
                          onChange={e => updateSchedule(selectedTerm, s.lectureNumber, 'timeSchedule', e.target.value)}
                          className="min-h-[100px]"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">役割分担</label>
                        <Textarea
                          value={s.settings.roleAssignment}
                          onChange={e => updateSchedule(selectedTerm, s.lectureNumber, 'roleAssignment', e.target.value)}
                          className="min-h-[100px]"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">使用資料リンク</label>
                        <Textarea
                          value={s.settings.materialLinks}
                          onChange={e => updateSchedule(selectedTerm, s.lectureNumber, 'materialLinks', e.target.value)}
                          className="min-h-[100px]"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">格納フォルダ</label>
                        <Input
                          value={s.settings.storageFolder}
                          onChange={e => updateSchedule(selectedTerm, s.lectureNumber, 'storageFolder', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">備考</label>
                        <Textarea
                          value={s.settings.notes}
                          onChange={e => updateSchedule(selectedTerm, s.lectureNumber, 'notes', e.target.value)}
                          className="min-h-[100px]"
                        />
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </>
        )}
      </Card>
    </div>
  );
}