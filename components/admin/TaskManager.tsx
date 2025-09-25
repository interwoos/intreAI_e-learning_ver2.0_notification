"use client";

import { Card } from '@/components/ui/card';
import { FileText } from 'lucide-react';
import { TaskData } from '@/hooks/useTaskData';

interface TaskManagerProps {
  selectedCourse: {
    id: number;
    title: string;
    subThemes: Array<{
      id: string;
      title: string;
    }>;
  } | null;
  termId: string;
  activeTaskTab: string;
  taskData: Record<string, TaskData>;
  onTabChange: (tabId: string) => void;
  onTaskDataChange: (taskId: string, field: 'title' | 'description', value: string) => void;
}

export function TaskManager({
  selectedCourse,
  termId,
  activeTaskTab,
  taskData,
  onTabChange,
  onTaskDataChange,
}: TaskManagerProps) {

  if (!selectedCourse || selectedCourse.subThemes.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p>課題が設定されていません</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-custom-dark-gray flex items-center gap-2">
          <FileText className="w-5 h-5" />
          事前課題管理
        </h2>
      </div>
      {/* TaskManagerは見出しのみを表示し、実際のタブ・コンテンツは親コンポーネントで管理 */}
    </div>
  );
}