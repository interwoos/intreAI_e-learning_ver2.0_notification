import { supabase } from '@/lib/supabase';

export interface Term {
  id: string;
  name: string;
  term_number: number;
}

export async function fetchTerms(): Promise<Term[]> {
  try {
    const { data, error } = await supabase
      .from('terms')
      .select('id, name, term_number')
      .order('term_number', { ascending: true });

    if (error) {
      console.error('期一覧取得エラー:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('期一覧取得例外:', error);
    return [];
  }
}