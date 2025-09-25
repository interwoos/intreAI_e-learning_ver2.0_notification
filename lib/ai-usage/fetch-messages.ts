import { supabase } from '@/lib/supabase';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  message_timestamp: string;
}

export interface FetchMessagesResult {
  messages: ChatMessage[];
  totalCount: number;
  totalPages: number;
}

export async function fetchMessages(
  userId: string,
  taskId: string,
  page: number = 1,
  pageSize: number = 50
): Promise<FetchMessagesResult> {
  try {
    // course_idを決定
    let courseId: number | null = null;
    if (taskId !== 'general-support') {
      const lectureNumber = parseInt(taskId.split('-')[0]);
      if (!isNaN(lectureNumber)) {
        courseId = lectureNumber;
      }
    }

    let query = supabase
      .from("chat_history")
      .select("id, role, content, model, message_timestamp", { count: 'exact' })
      .eq("user_id", userId)
      .eq("task_id", taskId)
      .order("message_timestamp", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    // course_idでフィルタ
    if (courseId !== null) {
      query = query.eq("course_id", courseId);
    } else if (taskId === 'general-support') {
      query = query.is("course_id", null);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('チャット履歴取得エラー:', error);
      return {
        messages: [],
        totalCount: 0,
        totalPages: 0
      };
    }

    return {
      messages: data || [],
      totalCount: count || 0,
      totalPages: Math.ceil((count || 0) / pageSize)
    };
  } catch (error) {
    console.error('チャット履歴取得例外:', error);
    return {
      messages: [],
      totalCount: 0,
      totalPages: 0
    };
  }
}