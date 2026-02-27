export default function VideoDetailLoading() {
  return (
    <div className="animate-pulse" role="status" aria-label="Загрузка видео">
      <div className="mb-6">
        <div className="h-8 w-72 bg-gray-200 rounded mb-2" />
        <div className="h-4 w-48 bg-gray-200 rounded" />
      </div>
      <div className="space-y-6">
        <div className="bg-white rounded-xl border p-4 h-16" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border overflow-hidden">
              <div className="aspect-[9/16] bg-gray-200" />
              <div className="p-4 space-y-2">
                <div className="h-4 w-3/4 bg-gray-200 rounded" />
                <div className="h-3 w-1/2 bg-gray-200 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
