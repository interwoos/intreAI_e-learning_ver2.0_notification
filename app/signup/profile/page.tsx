"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import Image from "next/image";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function ProfileSetupPage() {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [department, setDepartment] = useState("");
  const [position, setPosition] = useState("");
  const [term, setTerm] = useState("");
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const router = useRouter();

  // 仮の期データ（実際にはデータベースから取得）
  const terms = [
    { id: "2024-1", name: "2024年度第1期" },
    { id: "2024-2", name: "2024年度第2期" },
    { id: "2024-3", name: "2024年度第3期" },
  ];

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfileImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement actual profile setup logic
    router.push("/mypage");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-custom-light-gray to-white">
      <div className="w-full max-w-[440px] p-8 bg-white rounded-2xl shadow-lg">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-8">
            <Image 
              src="/images/logo.png" 
              alt="InterWoos Logo" 
              width={240} 
              height={80} 
              priority
            />
          </div>
          <h1 className="text-2xl font-bold text-custom-black mb-2">プロフィール設定</h1>
          <p className="text-custom-red text-sm">
            プロフィール情報を入力してください
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex justify-center mb-8">
            <div className="relative">
              <div className={`w-32 h-32 rounded-full overflow-hidden border-4 border-custom-dark-gray ${!profileImage ? 'bg-custom-light-gray' : ''}`}>
                {profileImage ? (
                  <img src={profileImage} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Camera className="w-8 h-8 text-gray-400" />
                  </div>
                )}
              </div>
              <label className="absolute bottom-0 right-0 bg-custom-dark-gray rounded-full p-2 cursor-pointer shadow-lg">
                <Camera className="w-4 h-4 text-white" />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                />
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm text-custom-black">
              期を選択
            </label>
            <Select value={term} onValueChange={setTerm}>
              <SelectTrigger className="focus:ring-custom-dark-gray">
                <SelectValue placeholder="期を選択してください" />
              </SelectTrigger>
              <SelectContent>
                {terms.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm text-custom-black">
              氏名
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-12 px-4 border border-gray-200 rounded-lg focus:ring-2 focus:ring-custom-dark-gray focus:border-transparent"
              placeholder="山田 太郎"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm text-custom-black">
              会社名
            </label>
            <Input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="w-full h-12 px-4 border border-gray-200 rounded-lg focus:ring-2 focus:ring-custom-dark-gray focus:border-transparent"
              placeholder="株式会社サンプル"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm text-custom-black">
              部署名
            </label>
            <Input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full h-12 px-4 border border-gray-200 rounded-lg focus:ring-2 focus:ring-custom-dark-gray focus:border-transparent"
              placeholder="営業企画部"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm text-custom-black">
              役職名
            </label>
            <Input
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className="w-full h-12 px-4 border border-gray-200 rounded-lg focus:ring-2 focus:ring-custom-dark-gray focus:border-transparent"
              placeholder="マネージャー"
              required
            />
          </div>

          <Button
            type="submit"
            className="w-full h-12 bg-custom-dark-gray hover:bg-[#2a292a] text-white font-medium rounded-lg transition-colors"
          >
            プロフィールを設定
          </Button>
        </form>
      </div>
    </div>
  );
}