"use client";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  Bell,
  Mail,
  Settings,
  Users
} from "lucide-react";
import { Card } from "@/components/ui/card";

export default function AdminSettings() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-custom-black">管理設定</h1>
      </div>

      {/* 通知設定 */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold text-custom-black mb-6 flex items-center gap-2">
          <Bell className="w-5 h-5" />
          通知設定
        </h2>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-base text-custom-black">課題提出通知</Label>
              <p className="text-sm text-custom-red">
                受講生が課題を提出した際の通知
              </p>
            </div>
            <Switch />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-base text-custom-black">メッセージ通知</Label>
              <p className="text-sm text-custom-red">
                受講生からのメッセージ受信時の通知
              </p>
            </div>
            <Switch />
          </div>
        </div>
      </Card>
    </div>
  );
}