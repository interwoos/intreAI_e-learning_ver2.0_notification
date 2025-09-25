import { useState, useCallback } from "react";

export interface TaskData {
  tab_title: string;        // タブ表示名（UI見出し）
  edit_title: string;       // 課題タイトル（本文見出し）
  description: string;
  allow_file_upload: boolean;
}

type SaveField = keyof TaskData;
type SaveValue<F extends SaveField> =
  F extends "allow_file_upload" ? boolean : string;

const DEFAULT_TASK: TaskData = {
  tab_title: "",
  edit_title: "",
  description: "",
  allow_file_upload: false,
};

export function useTaskData() {
  const [taskData, setTaskData] = useState<Record<string, TaskData>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const updateTaskData = useCallback(
    <F extends SaveField>(taskId: string, field: F, value: SaveValue<F>) => {
      setTaskData((prev) => {
        const current = prev[taskId] ?? DEFAULT_TASK;
        return { ...prev, [taskId]: { ...current, [field]: value as TaskData[SaveField] } };
      });
      setHasUnsavedChanges(true);
    },
    []
  );

  const loadTaskData = useCallback((data: Record<string, Partial<TaskData>>) => {
    const normalized: Record<string, TaskData> = {};
    for (const [id, item] of Object.entries(data ?? {})) {
      normalized[id] = {
        tab_title: item.tab_title ?? "",
        edit_title: item.edit_title ?? "",
        description: item.description ?? "",
        allow_file_upload: item.allow_file_upload ?? false,
      };
    }
    setTaskData(normalized);
    setHasUnsavedChanges(false);
  }, []);

  const resetUnsavedChanges = useCallback(() => setHasUnsavedChanges(false), []);

  return { taskData, hasUnsavedChanges, updateTaskData, loadTaskData, resetUnsavedChanges };
}
