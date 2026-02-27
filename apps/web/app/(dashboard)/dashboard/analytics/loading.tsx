export default function AnalyticsLoading() {
  return (
    <div className="space-y-6 animate-pulse" role="status" aria-label="Загрузка аналитики">
      <div className="h-8 w-40 bg-gray-200 rounded" />
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border p-6 space-y-3">
            <div className="h-4 w-20 bg-gray-200 rounded" />
            <div className="h-7 w-16 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border p-6 h-64" />
    </div>
  );
}
