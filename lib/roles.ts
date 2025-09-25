// lib/roles.ts
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function isAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  if (error) return false;
  return data?.role === "admin";
}
