import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InitialAvatar } from "@/components/ui/initial-avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LogOut, UserCircle, Camera } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

interface UserMenuProps {
  name: string;
  isAdmin?: boolean;
  onProfileUpdate?: () => void;
}

export function UserMenu({ name, isAdmin, onProfileUpdate }: UserMenuProps) {
  const router = useRouter();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    company: "",
    department: "",
    position: "",
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleOpenDialog = () => {
    setIsDialogOpen(true);
  };

  const handleUpdateProfile = async () => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('profiles')
        .update({
          company: formData.company,
          department: formData.department,
          position: formData.position,
        })
        .eq('id', user.id);

      if (error) throw error;
      
      setIsDialogOpen(false);
      if (onProfileUpdate) {
        onProfileUpdate();
      }
    } catch (error) {
      console.error('Error updating profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="p-2 rounded-full">
            <InitialAvatar name={name} size="sm" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" forceMount>
          <DropdownMenuItem onClick={handleOpenDialog} className="cursor-pointer flex items-center px-3 py-2 text-sm rounded-md hover:bg-gray-100">
            <UserCircle className="mr-2 h-4 w-4" />
            <span>プロフィールを変更</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className="cursor-pointer flex items-center px-3 py-2 text-sm text-red-600 rounded-md hover:bg-red-50">
            <LogOut className="mr-2 h-4 w-4" />
            <span>ログアウト</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>プロフィール変更</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">会社名</label>
              <Input
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                placeholder="会社名を入力"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">部署名</label>
              <Input
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                placeholder="部署名を入力"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">役職名</label>
              <Input
                value={formData.position}
                onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                placeholder="役職名を入力"
              />
            </div>
            <Button
              onClick={handleUpdateProfile}
              disabled={isLoading}
              className="w-full mt-4"
            >
              {isLoading ? "更新中..." : "更新する"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
