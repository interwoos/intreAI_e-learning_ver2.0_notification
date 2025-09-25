// app/loading.tsx
'use client';

import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <div className="
      fixed inset-0        /* 画面全体を覆う */
      flex items-center justify-center  /* 中央寄せ */
      bg-white/80          /* 少し透過した白背景 */
      backdrop-blur-sm     /* 背景を軽くぼかす */
      z-50                 /* 一番手前に出す */
    ">
      <Loader2 className="w-16 h-16 text-custom-dark-gray animate-spin" />
    </div>
  );
}
