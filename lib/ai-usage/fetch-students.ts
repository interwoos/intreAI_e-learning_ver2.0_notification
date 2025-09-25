import { supabase } from '@/lib/supabase';

export interface Student {
  user_id: string;
  name: string;
  company_name: string;
  term_id: string;
}

export async function fetchStudents(termId: string = "all"): Promise<Student[]> {
  try {
    let query = supabase
      .from('profiles')
      .select('id, full_name, company, term_id')
      .eq('role', 'student')
      .order('full_name');

    if (termId !== "all") {
      query = query.eq('term_id', termId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('受講者一覧取得エラー:', error);
      return [];
    }

    return (data || []).map(profile => ({
      user_id: profile.id,
      name: profile.full_name || "名前未設定",
      company_name: profile.company || "会社名未設定",
      term_id: profile.term_id || ""
    }));
  } catch (error) {
    console.error('受講者一覧取得例外:', error);
    return [];
  }
}