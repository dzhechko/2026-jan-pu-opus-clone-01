'use client';

import { VideoUploader } from '@/components/upload/video-uploader';

export default function UploadPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Загрузить видео</h1>
      <VideoUploader />
    </div>
  );
}
