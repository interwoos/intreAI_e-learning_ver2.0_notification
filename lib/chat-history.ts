// チャット履歴管理のユーティリティ関数
import { supabase } from '@/lib/supabase';

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  message_timestamp: Date;
}

/**
 * チャット履歴をDBから取得
 */
export async function loadChatHistory(
  userId: string,
  taskId: string,
  courseId?: number
): Promise<ChatMessage[]> {
  try {
    console.log('📚 チャット履歴読み込み開始:', { userId, taskId, courseId });

    let query = supabase
      .from('chat_history')
      .select('id, role, content, model, message_timestamp')
      .eq('user_id', userId)
      .eq('task_id', taskId)
      .order('message_timestamp', { ascending: true });

    // 課題用チャットの場合はcourse_idでフィルタ
    if (courseId !== undefined) {
      query = query.eq('course_id', courseId);
    } else {
      // 万能AIの場合はcourse_idがNULLのもの
      query = query.is('course_id', null);
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ チャット履歴読み込みエラー:', error);
      return [];
    }

    const messages = (data || []).map(record => ({
      id: record.id,
      role: record.role as 'user' | 'assistant',
      content: record.content,
      model: record.model || undefined,
      message_timestamp: new Date(record.message_timestamp)
    }));

    console.log('✅ チャット履歴読み込み完了:', messages.length, '件');
    return messages;

  } catch (error) {
    console.error('❌ チャット履歴読み込み例外:', error);
    return [];
  }
}

/**
 * チャット履歴をDBに保存
 */
export async function saveChatMessage(
  userId: string,
  taskId: string,
  role: 'user' | 'assistant',
  content: string,
  model?: string,
  courseId?: number
): Promise<string | null> {
  try {
    console.log('💾 チャットメッセージ保存開始:', { userId, taskId, role, courseId, model });

    const { data, error } = await supabase
      .from('chat_history')
      .insert({
        user_id: userId,
        task_id: taskId,
        course_id: courseId || null,
        role,
        content,
        model: role === 'assistant' ? model : null,
        message_timestamp: new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) {
      console.error('❌ チャットメッセージ保存エラー:', error);
      return null;
    }

    console.log('✅ チャットメッセージ保存完了:', data.id);
    return data.id;

  } catch (error) {
    console.error('❌ チャットメッセージ保存例外:', error);
    return null;
  }
}

/**
 * チャット履歴をクリア
 */
export async function clearChatHistory(
  userId: string,
  taskId: string,
  courseId?: number
): Promise<boolean> {
  try {
    console.log('🗑️ チャット履歴クリア開始:', { userId, taskId, courseId });

    let query = supabase
      .from('chat_history')
      .delete()
      .eq('user_id', userId)
      .eq('task_id', taskId);

    // 課題用チャットの場合はcourse_idでフィルタ
    if (courseId !== undefined) {
      query = query.eq('course_id', courseId);
    } else {
      // 万能AIの場合はcourse_idがNULLのもの
      query = query.is('course_id', null);
    }

    const { error } = await query;

    if (error) {
      console.error('❌ チャット履歴クリアエラー:', error);
      return false;
    }

    console.log('✅ チャット履歴クリア完了');
    return true;

  } catch (error) {
    console.error('❌ チャット履歴クリア例外:', error);
    return false;
  }
}

/**
 * 複数メッセージの一括保存
 */
export async function saveChatMessages(
  userId: string,
  taskId: string,
  messages: Omit<ChatMessage, 'id'>[],
  courseId?: number
): Promise<boolean> {
  try {
    console.log('💾 チャットメッセージ一括保存開始:', { userId, taskId, courseId, count: messages.length });

    const records = messages.map(message => ({
      user_id: userId,
      task_id: taskId,
      course_id: courseId || null,
      role: message.role,
      content: message.content,
      model: message.role === 'assistant' ? message.model : null,
      message_timestamp: message.message_timestamp.toISOString()
    }));

    const { error } = await supabase
      .from('chat_history')
      .insert(records);

    if (error) {
      console.error('❌ チャットメッセージ一括保存エラー:', error);
      return false;
    }

    console.log('✅ チャットメッセージ一括保存完了:', records.length, '件');
    return true;

  } catch (error) {
    console.error('❌ チャットメッセージ一括保存例外:', error);
    return false;
  }
}