import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/options';
import { prisma } from '@clipmaker/db';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const [user, videoCount, clipCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { minutesUsed: true, minutesLimit: true, planId: true, billingPeriodStart: true },
    }),
    prisma.video.count({ where: { userId: session.user.id } }),
    prisma.clip.count({ where: { userId: session.user.id } }),
  ]);

  if (!user) return null;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Панель управления</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard
          label="Минут использовано"
          value={`${user.minutesUsed} / ${user.minutesLimit}`}
        />
        <StatCard label="Видео загружено" value={String(videoCount)} />
        <StatCard label="Клипов создано" value={String(clipCount)} />
      </div>

      <section>
        <h2 className="text-xl font-semibold mb-4">Последние видео</h2>
        <VideoList userId={session.user.id} />
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-6 bg-white rounded-xl border">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

async function VideoList({ userId }: { userId: string }) {
  const videos = await prisma.video.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      title: true,
      status: true,
      durationSeconds: true,
      createdAt: true,
      _count: { select: { clips: true } },
    },
  });

  if (videos.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-xl border">
        <p className="text-gray-500 mb-4">Пока нет видео</p>
        <a href="/dashboard/upload" className="text-brand-600 hover:underline">
          Загрузить первое видео
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {videos.map((video) => (
        <a
          key={video.id}
          href={`/dashboard/videos/${video.id}`}
          className="block p-4 bg-white rounded-xl border hover:shadow-sm transition"
        >
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-medium">{video.title}</h3>
              <p className="text-sm text-gray-500">
                {video.durationSeconds ? `${Math.round(video.durationSeconds / 60)} мин` : '—'} · {video._count.clips} клипов
              </p>
            </div>
            <span className="text-sm px-2 py-1 rounded bg-gray-100">{video.status}</span>
          </div>
        </a>
      ))}
    </div>
  );
}
