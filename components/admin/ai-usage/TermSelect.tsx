"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Term {
  id: string;
  name: string;
  term_number: number;
}

interface TermSelectProps {
  terms: Term[];
  selectedTermId: string;
  onTermChange: (termId: string) => void;
}

export function TermSelect({ terms, selectedTermId, onTermChange }: TermSelectProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-custom-black">
        期を選択
      </label>
      <Select value={selectedTermId} onValueChange={onTermChange}>
        <SelectTrigger className="w-[300px] focus:ring-custom-dark-gray">
          <SelectValue placeholder="期を選択してください" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全期</SelectItem>
          {terms.map((term) => (
            <SelectItem key={term.id} value={term.id}>
              {term.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}