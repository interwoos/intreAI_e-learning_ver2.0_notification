"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users } from "lucide-react";

interface Student {
  user_id: string;
  name: string;
  company_name: string;
  term_id: string;
}

interface Task {
  id: string;
  title: string;
}

interface StudentTableProps {
  students: Student[];
  tasks: Task[];
  onChatSelect: (userId: string, taskId: string) => void;
  isLoading: boolean;
}

export function StudentTable({ 
  students, 
  tasks, 
  onChatSelect, 
  isLoading 
}: StudentTableProps) {
  if (isLoading) {
    return (
      <div className="text-center py-8 text-gray-500">
        読み込み中...
      </div>
    );
  }

  if (students.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>受講者が見つかりません</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-custom-black">企業名</TableHead>
            <TableHead className="text-custom-black">氏名</TableHead>
            <TableHead className="text-custom-black">チャット選択</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {students.map((student) => (
            <TableRow key={student.user_id}>
              <TableCell className="font-medium">
                {student.company_name}
              </TableCell>
              <TableCell>{student.name}</TableCell>
              <TableCell>
                <Select onValueChange={(taskId) => onChatSelect(student.user_id, taskId)}>
                  <SelectTrigger className="w-[200px] focus:ring-custom-dark-gray">
                    <SelectValue placeholder="チャットを選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {tasks.map((task) => (
                      <SelectItem key={task.id} value={task.id}>
                        {task.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}