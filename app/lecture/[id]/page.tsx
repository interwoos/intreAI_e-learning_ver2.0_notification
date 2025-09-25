// app/lecture/[id]/page.tsx

import { notFound } from 'next/navigation';
import LectureClient from './client';

// 動的ルーティングのため、generateStaticParamsは削除

interface LecturePageProps {
  params: {
    id: string;
  };
}

export default function LecturePage({ params }: LecturePageProps) {
  // 講義IDの基本的な検証のみ
  const courseId = parseInt(params.id, 10);
  if (isNaN(courseId) || courseId < 1) {
    return notFound();
  }

  return <LectureClient courseId={courseId} />;
}
