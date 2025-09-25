"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Upload, Save, Loader2, X, FileText, Link2 } from "lucide-react";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useCSVUpload } from "@/lib/hooks/use-file-upload";
import { StudentDeleteButton } from "@/components/admin/StudentDeleteButton";

interface Profile {
  id: string;
  email: string;
  full_name: string;
  company: string;
  department: string;
  position: string;
  term_id: string;
}

interface NewTerm {
  name: string;
  start_date: string;
  end_date: string;
  template_link: string;
  folder_link: string;
}

const isValidUrl = (url: string) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

function chunkArray<T>(arr: T[], size: number): T[][] {
  const res: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    res.push(arr.slice(i, i + size));
  }
  return res;
}

export default function StudentsPage() {
  const [selectedTerm, setSelectedTerm] = useState<string>("");
  const [terms, setTerms] = useState<any[]>([]);
  const [students, setStudents] = useState<Profile[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [uploadResults, setUploadResults] = useState<any[]>([]);
  const [newCandidates, setNewCandidates] = useState<any[]>([]);
  const [parsedHeader, setParsedHeader] = useState<string[]>([]);
  const [newTerm, setNewTerm] = useState<NewTerm>({
    name: "",
    start_date: "",
    end_date: "",
    template_link: "",
    folder_link: ""
  });

  // CSVは6項目チェック
  const { 
    file: selectedFile,
    preview: previewData,
    isLoading: isParsingCSV,
    fileInputRef,
    handleFileSelect,
    triggerFileSelect,
    reset: resetFileUploadBase
  } = useCSVUpload({
    validateHeaders: ['full_name', 'email', 'password', 'company', 'department', 'position'],
    onError: (error) => toast.error(error),
    previewRows: 5
  });

  const resetFileUpload = () => {
    resetFileUploadBase();
    setNewCandidates([]);
    setParsedHeader([]);
  };

  useEffect(() => {
    fetchTerms();
  }, []);

  useEffect(() => {
    // 期を切り替えたとき新規候補もリセット
    setNewCandidates([]);
    setParsedHeader([]);
  }, [selectedTerm]);

  const isFormValid = () => {
    return (
      newTerm.name.trim() !== "" &&
      newTerm.start_date &&
      newTerm.end_date &&
      isValidUrl(newTerm.template_link) &&
      isValidUrl(newTerm.folder_link)
    );
  };

  const fetchTerms = async () => {
    const { data: termsData, error: termsError } = await supabase
      .from('terms')
      .select('*')
      .order('term_number', { ascending: true });

    if (termsData && !termsError) {
      setTerms(termsData);
    }
  };

  const handleTermSelect = async (termId: string) => {
    setSelectedTerm(termId);

    const { data: studentsData, error: studentsError } = await supabase
      .from('profiles')
      .select('*')
      .eq('term_id', termId)
      .eq('role', 'student')
      .order('full_name');

    if (studentsData && !studentsError) {
      setStudents(studentsData);
    }

    const { data: lectures, error: lecturesError } = await supabase
      .from('lectures')
      .select('*')
      .eq('term_id', termId)
      .order('lecture_number');

    if (lecturesError) {
      console.error('Error fetching lectures:', lecturesError);
      return;
    }

    if (!lectures || lectures.length === 0) {
      const newLectures = Array(9).fill(null).map((_, i) => ({
        term_id: termId,
        lecture_number: i + 1,
        mode: 'オンライン',
        assignment_deadline_time: '17:00'
      }));

      const { error: insertError } = await supabase
        .from('lectures')
        .insert(newLectures);

      if (insertError) {
        console.error('Error creating lectures:', insertError);
        toast.error('講義レコードの作成に失敗しました');
      }
    }
    resetFileUpload();
  };

  const addNewTerm = async () => {
    console.log("✅ 期追加ボタンが押された");
    console.log("🧪 フォームバリデーション:", isFormValid());
    console.log("📝 newTerm 値:", newTerm);
    
    if (!isFormValid()) {
      console.log("❌ バリデーションエラー: フォームが無効です");
      toast.error("すべての項目を正しく入力してください");
      return;
    }

    try {
      console.log("🚀 期追加処理を開始します");
      
      // 新しいAPIエンドポイントを呼び出し
      const response = await fetch('/api/create-term', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTerm.name,
          start_date: newTerm.start_date,
          end_date: newTerm.end_date,
          folder_link: newTerm.folder_link,
          template_link: newTerm.template_link  // 管理者が入力したテンプレートURL
        })
      });

      console.log("🌐 API レスポンス状態:", response.status, response.statusText);
      
      // レスポンスのContent-Typeをチェック
      const contentType = response.headers.get('content-type');
      console.log("📄 レスポンスContent-Type:", contentType);
      
      if (!contentType || !contentType.includes('application/json')) {
        console.error("❌ APIがJSONではなくHTMLを返しています");
        const htmlText = await response.text();
        console.error("📄 HTMLレスポンス内容:", htmlText.substring(0, 500));
        throw new Error('APIサーバーでエラーが発生しました。詳細はコンソールを確認してください。');
      }
      
      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (jsonError) {
          console.error("❌ エラーレスポンスのJSON解析失敗:", jsonError);
          const errorText = await response.text();
          console.error("📄 エラーレスポンス内容:", errorText);
          throw new Error(`APIエラー (${response.status}): レスポンスの解析に失敗しました`);
        }
        console.error("❌ API エラーレスポンス:", errorData);
        throw new Error(errorData.error || 'API呼び出しに失敗しました');
      }

      let responseData;
      try {
        responseData = await response.json();
      } catch (jsonError) {
        console.error("❌ 成功レスポンスのJSON解析失敗:", jsonError);
        const responseText = await response.text();
        console.error("📄 成功レスポンス内容:", responseText);
        throw new Error('APIレスポンスの解析に失敗しました');
      }
      
      const { term, originalTemplateUrl, copiedTemplateUrl, lectureConfig } = responseData;
      console.log("✅ 期作成API成功:", { 
        term, 
        originalTemplateUrl, 
        copiedTemplateUrl,
        lectureConfig 
      });
      
      if (term && term.id) {
        console.log("🔄 UI更新処理を開始...");
        await handleTermSelect(term.id);
        await fetchTerms();
        setNewTerm({
          name: "",
          start_date: "",
          end_date: "",
          template_link: "",
          folder_link: ""
        });
        setIsDialogOpen(false);
        console.log("🎉 期追加完了!");
        toast.success(`新しい期を追加しました（講義回数: ${lectureConfig.totalLectures}回、コピーテンプレート: ${copiedTemplateUrl}）`);
      } else {
        console.error("❌ 期の作成は成功したが、termまたはterm.idが取得できませんでした");
        console.error("🔍 返却されたterm:", term);
        throw new Error('期の作成後のデータ取得に失敗しました');
      }
    } catch (err: any) {
      console.error("🔥 期追加エラー:", err);
      console.error("🔥 エラー詳細:", {
        message: err.message,
        stack: err.stack,
        name: err.name
      });
      toast.error("期の追加に失敗しました: " + (err.message || "不明なエラー"));
    }
  };

  // CSVアップロード時に新規候補のみ抽出
  const handleFileInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    handleFileSelect(file);

    // 新規候補者抽出
    const text = await file.text();
    const lines = text.split("\n").filter(line => line.trim() !== "");
    if (lines.length < 2) {
      setNewCandidates([]);
      setParsedHeader([]);
      return;
    }
    const header = lines[0].split(",");
    setParsedHeader(header);

    const userRows = lines.slice(1)
      .map(line => line.split(",").map((v) => v.trim()))
      .filter(cells => cells.length >= 6)
      .map(cells =>
        Object.fromEntries(header.map((key, i) => [key.trim(), cells[i] || ""]))
      );

    const existingEmails = new Set(students.map(s => s.email));
    const uniqueNewRows = userRows.filter(row => !existingEmails.has(row.email));
    setNewCandidates(uniqueNewRows);
  };

  // 新規のみを2人ずつサーバーへPOST
  const handleUpload = async () => {
    if (!selectedFile || !selectedTerm) {
      if (!selectedTerm) toast.error("期を選択してください");
      return;
    }
    if (newCandidates.length === 0) {
      toast.error("新規追加者がいません");
      return;
    }

    setIsUploading(true);
    setUploadResults([]);
    setUploadProgress({ current: 0, total: 0 });

    try {
      const header = parsedHeader.length ? parsedHeader : ['full_name', 'email', 'password', 'company', 'department', 'position'];
      const chunks = chunkArray(newCandidates, 2);
      setUploadProgress({ current: 0, total: newCandidates.length });

      let allResults: any[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const csvChunk =
          header.join(",") + "\n" +
          chunks[i].map(row => header.map(h => row[h]).join(",")).join("\n");
        const blob = new Blob([csvChunk], { type: "text/csv" });
        const formData = new FormData();
        formData.append("file", blob, "users.csv");
        formData.append("termId", selectedTerm);

        const response = await fetch('/api/upload_users', {
          method: 'POST',
          body: formData,
        });
        const data = await response.json();
        if (data.results) {
          allResults = [...allResults, ...data.results];
        }
        setUploadResults([...allResults]);
        setUploadProgress({
          current: Math.min((i + 1) * 2, newCandidates.length),
          total: newCandidates.length,
        });
        await new Promise(res => setTimeout(res, 200));
      }

      const successCount = allResults.filter(r => r.status === "success").length;
      const errorCount = allResults.filter(r => r.status === "error").length;
      if (successCount > 0) toast.success(`${successCount}件のユーザーを登録しました`);
      if (errorCount > 0) toast.error(`${errorCount}件の登録に失敗しました`);

      await handleTermSelect(selectedTerm);
      resetFileUpload();

    } catch (err) {
      console.error('Error uploading users:', err);
      toast.error('ユーザーの登録に失敗しました');
    } finally {
      setIsUploading(false);
      setUploadProgress({ current: 0, total: 0 });
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-custom-black">受講者管理</h1>
      </div>

      <Card className="p-6">
        <div className="flex items-end gap-4 mb-6">
          <div className="flex-1 space-y-2">
            <label className="block text-sm font-medium text-custom-black">期を選択</label>
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

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-custom-dark-gray text-custom-dark-gray hover:bg-custom-dark-gray hover:text-white">
                期の追加/ログイン管理
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>期の追加/ログイン管理</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <label className="text-sm font-medium">期の名前</label>
                  <Input
                    type="text"
                    value={newTerm.name}
                    onChange={e => setNewTerm({ ...newTerm, name: e.target.value })}
                    placeholder="例: 2024年度第1期、春期コース、など"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">開始日</label>
                    <Input
                      type="date"
                      value={newTerm.start_date}
                      onChange={e => setNewTerm({ ...newTerm, start_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">終了日</label>
                    <Input
                      type="date"
                      value={newTerm.end_date}
                      onChange={e => setNewTerm({ ...newTerm, end_date: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Link2 className="w-4 h-4" />
                    テンプレートリンク
                  </label>
                  <Input
                    type="url"
                    value={newTerm.template_link}
                    onChange={e => setNewTerm({ ...newTerm, template_link: e.target.value })}
                    placeholder="https://example.com/template"
                    className={!isValidUrl(newTerm.template_link) && newTerm.template_link ? 'border-red-500' : ''}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Link2 className="w-4 h-4" />
                    フォルダリンク
                  </label>
                  <Input
                    type="url"
                    value={newTerm.folder_link}
                    onChange={e => setNewTerm({ ...newTerm, folder_link: e.target.value })}
                    placeholder="https://example.com/folder"
                    className={!isValidUrl(newTerm.folder_link) && newTerm.folder_link ? 'border-red-500' : ''}
                  />
                </div>
                <Button 
                  onClick={addNewTerm} 
                  disabled={!isFormValid()}
                  className="w-full bg-custom-dark-gray hover:bg-[#2a292a] text-white disabled:opacity-50"
                >
                  期を追加
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {selectedTerm && (
          <div className="space-y-6">
            {/* ログイン管理セクション */}
            <LoginPermissionManager termId={selectedTerm} />
            
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-custom-black">
                受講者一覧
              </h2>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileInputChange}
                  className="hidden"
                  disabled={isUploading || isParsingCSV}
                />
                <Button 
                  onClick={triggerFileSelect}
                  variant="outline" 
                  className="cursor-pointer flex items-center gap-2 border-custom-dark-gray text-custom-dark-gray hover:bg-custom-dark-gray hover:text-white"
                  disabled={isUploading || isParsingCSV}
                >
                  <Upload className="w-4 h-4" />
                  CSVを選択
                </Button>

                {selectedFile && (
                  <Button
                    onClick={handleUpload}
                    disabled={isUploading || isParsingCSV || newCandidates.length === 0}
                    className="flex items-center gap-2 bg-custom-dark-gray hover:bg-[#2a292a] text-white"
                  >
                    {(isUploading || isParsingCSV) ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {(isUploading || isParsingCSV) ? "処理中..." : "アップロード"}
                  </Button>
                )}
              </div>
            </div>

            {/* 進捗バー */}
            {isUploading && (
              <div className="mb-4">
                <div>
                  {uploadProgress.current} / {uploadProgress.total} 完了
                  <span className="ml-2 text-sm text-gray-500">アップロード中です。他の操作はお控えください。</span>
                </div>
                <div style={{ background: "#eee", height: "8px", width: "100%", borderRadius: 4 }}>
                  <div
                    style={{
                      width: uploadProgress.total > 0
                        ? `${(uploadProgress.current / uploadProgress.total) * 100}%`
                        : "0%",
                      background: "#4ade80",
                      height: "100%",
                      borderRadius: 4,
                      transition: "width 0.3s",
                    }}
                  />
                </div>
              </div>
            )}

            {/* アップロード結果 */}
            {uploadResults.length > 0 && (
              <Card className="p-4 mb-4">
                <h3 className="text-base font-bold mb-2">アップロード結果</h3>
                <div className="space-y-1">
                  {uploadResults.map((r, i) => (
                    <div key={i} className={r.status === "success" ? "text-green-600" : "text-red-600"}>
                      {r.email}: {r.status}
                      {r.message && <>（{r.message}）</>}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* 新規追加者プレビュー */}
            {selectedFile && (
              <Card className="p-4 bg-gray-50 border-2 border-dashed">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-custom-dark-gray" />
                    <span className="font-medium text-custom-black">{selectedFile.name}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetFileUpload}
                    className="text-gray-500 hover:text-red-500"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>氏名</TableHead>
                        <TableHead>メールアドレス</TableHead>
                        <TableHead>会社名</TableHead>
                        <TableHead>部署</TableHead>
                        <TableHead>役職</TableHead>
                        <TableHead>パスワード</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {newCandidates.slice(0, 5).map((row, index) => (
                        <TableRow key={index}>
                          <TableCell>{row.full_name}</TableCell>
                          <TableCell>{row.email}</TableCell>
                          <TableCell>{row.company || '-'}</TableCell>
                          <TableCell>{row.department || '-'}</TableCell>
                          <TableCell>{row.position || '-'}</TableCell>
                          <TableCell>••••••••</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {newCandidates.length > 0 && (
                    <p className="text-sm text-gray-500 mt-2">
                      ※ 新規登録予定の最初の5名のみ表示しています（{newCandidates.length}名が新規追加対象です）
                    </p>
                  )}
                  {newCandidates.length === 0 && (
                    <p className="text-sm text-gray-500 mt-2">
                      既存の受講生と重複するため新規追加者はいません
                    </p>
                  )}
                </div>
              </Card>
            )}

            {/* アップロード中オーバーレイ */}
            {isUploading && (
              <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
                <div className="bg-white px-6 py-4 rounded shadow-lg text-lg">
                  アップロード処理中です。他の操作はお控えください。
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>氏名</TableHead>
                    <TableHead>メールアドレス</TableHead>
                    <TableHead>会社名</TableHead>
                    <TableHead>部署</TableHead>
                    <TableHead>役職</TableHead>
                    <TableHead className="text-center">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((student) => (
                    <TableRow key={student.id}>
                      <TableCell>{student.full_name}</TableCell>
                      <TableCell>{student.email}</TableCell>
                      <TableCell>{student.company || '-'}</TableCell>
                      <TableCell>{student.department || '-'}</TableCell>
                      <TableCell>{student.position || '-'}</TableCell>
                      <TableCell className="text-center">
                        <StudentDeleteButton 
                          student={student} 
                          onDeleteSuccess={() => handleTermSelect(selectedTerm)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ログイン許可管理コンポーネント
function LoginPermissionManager({ termId }: { termId: string }) {
  const [loginStatus, setLoginStatus] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // 現在のログイン許可状況を取得
  useEffect(() => {
    const fetchLoginStatus = async () => {
      setIsLoading(true);
      try {
        const { data: profiles, error } = await supabase
          .from('profiles')
          .select('login_permission')
          .eq('term_id', termId)
          .eq('role', 'student')
          .limit(1);

        if (profiles && profiles.length > 0) {
          setLoginStatus(profiles[0].login_permission);
        } else {
          setLoginStatus(null);
        }
      } catch (error) {
        console.error('ログイン状況取得エラー:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (termId) {
      fetchLoginStatus();
    }
  }, [termId]);

  // ログイン許可の切り替え
  const toggleLoginPermission = async () => {
    if (loginStatus === null) return;

    setIsUpdating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        toast.error('認証セッションが無効です');
        return;
      }

      const newStatus = !loginStatus;
      
      const response = await fetch('/api/toggle-term-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          termId,
          allowLogin: newStatus
        })
      });

      const result = await response.json();
      
      if (result.success) {
        setLoginStatus(newStatus);
        toast.success(result.message);
      } else {
        toast.error(result.error || 'ログイン許可設定に失敗しました');
      }
    } catch (error) {
      console.error('ログイン許可切り替えエラー:', error);
      toast.error('ログイン許可設定に失敗しました');
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="p-4 bg-blue-50 border-blue-200">
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
          <span className="text-sm text-blue-800">ログイン状況を確認中...</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 bg-blue-50 border-blue-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${
            loginStatus === true ? 'bg-green-500' : 
            loginStatus === false ? 'bg-red-500' : 'bg-gray-400'
          }`} />
          <div>
            <h3 className="text-sm font-medium text-blue-900">
              この期のログイン状況
            </h3>
            <p className="text-xs text-blue-700">
              {loginStatus === true ? 'ログイン許可中' : 
               loginStatus === false ? 'ログイン停止中' : 
               '状況不明'}
            </p>
          </div>
        </div>
        
        <Button
          onClick={toggleLoginPermission}
          disabled={isUpdating || loginStatus === null}
          className={`flex items-center gap-2 ${
            loginStatus === true 
              ? 'bg-red-600 hover:bg-red-700 text-white' 
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
          size="sm"
        >
          {isUpdating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              更新中...
            </>
          ) : (
            <>
              {loginStatus === true ? (
                <>
                  <X className="w-4 h-4" />
                  ログインを停止
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  ログインを許可
                </>
              )}
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}