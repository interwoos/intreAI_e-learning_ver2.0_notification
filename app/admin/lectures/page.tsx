"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { BookOpen, Settings } from "lucide-react";

interface Term {
  id: string;
  name: string;
  term_number: number;
}

export default function LectureEditorPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [selectedTerm, setSelectedTerm] = useState<string>("");
  const router = useRouter();

  useEffect(() => {
    fetchTerms();
  }, []);

  const fetchTerms = async () => {
    const { data: termsData, error } = await supabase
      .from('terms')
      .select('*')
      .order('term_number', { ascending: true });

    if (termsData && !error) {
      setTerms(termsData);
    }
  };

  const handleTermSelect = (termId: string) => {
    setSelectedTerm(termId);
    router.push(`/admin/lectures/${termId}`);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-custom-black">講義編集</h1>
      </div>

      <Card className="p-8">
        <div className="text-center space-y-6">
          <div className="flex justify-center">
            <BookOpen className="w-16 h-16 text-custom-dark-gray" />
          </div>
          
          <div>
            <h2 className="text-xl font-semibold text-custom-black mb-2">
              編集する期を選択してください
            </h2>
            <p className="text-gray-600">
              選択した期の講義内容、動画、チャットプロンプトなどを編集できます
            </p>
          </div>

          <div className="max-w-md mx-auto">
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

          {terms.length === 0 && (
            <div className="text-gray-500 text-sm">
              編集可能な期がありません。まず受講者管理から期を作成してください。
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}