import { supabase } from '@/lib/supabase';

export interface Task {
  id: string;
  title: string;
}

export async function fetchTasks(termId: string = "all"): Promise<Task[]> {
  try {
    const taskList: Task[] = [
      { id: "general-support", title: "壁打ちAI" }
    ];

    // 事前課題を取得
    if (termId !== "all") {
      const { data: preAssignments, error } = await supabase
        .from("pre_assignments")
        .select("assignment_id, title, edit_title")
        .eq("term_id", termId)
        .order("assignment_id");

      if (preAssignments && !error) {
        preAssignments.forEach(assignment => {
          taskList.push({
            id: assignment.assignment_id,
            title: assignment.assignment_id  // タスクIDをそのまま表示
          });
        });
      }
    } else {
      // 全期の場合はデフォルトのタスクIDを使用
      const defaultTasks = [
        '1-0', '1-1', '1-2',
        '2-0', '2-1', '2-2', '2-3', '2-4',
        '3-0', '3-1', '3-2', '3-3',
        '4-0',
        '5-0', '5-1', '5-2', '5-3', '5-4',
        '6-0', '6-1', '6-2', '6-3',
        '7-0', '7-1', '7-2', '7-3',
        '8-0', '8-1',
        '9-0'
      ];

      defaultTasks.forEach(taskId => {
        taskList.push({
          id: taskId,
          title: `課題 ${taskId}`
        });
      });
    }

    return taskList;
  } catch (error) {
    console.error('タスク一覧取得例外:', error);
    return [{ id: "general-support", title: "壁打ちAI" }];
  }
}