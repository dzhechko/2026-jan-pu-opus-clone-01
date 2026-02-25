export default function DashboardLoading() {
  return (
    <div className="space-y-8 animate-pulse" role="status" aria-label="Загрузка дашборда">
      <div className="h-8 w-40 bg-gray-200 rounded" />

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-white p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 bg-gray-200 rounded" />
              <div className="h-4 w-24 bg-gray-200 rounded" />
            </div>
            <div className="h-7 w-20 bg-gray-200 rounded" />
            <div className="h-2 w-full bg-gray-100 rounded-full" />
          </div>
        ))}
      </div>

      <div className="h-6 w-32 bg-gray-200 rounded" />

      <div className="rounded-xl border bg-white shadow-sm divide-y">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4">
            <div className="h-12 w-20 bg-gray-200 rounded" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 bg-gray-200 rounded" />
              <div className="h-3 w-1/3 bg-gray-200 rounded" />
            </div>
            <div className="h-5 w-20 bg-gray-200 rounded-full" />
            <div className="h-4 w-16 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
