export default function SettingsLoading() {
  return (
    <div className="max-w-2xl animate-pulse" role="status" aria-label="Загрузка настроек">
      <div className="h-8 w-40 bg-gray-200 rounded mb-6" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border p-6 mb-6 space-y-3">
          <div className="h-5 w-32 bg-gray-200 rounded" />
          <div className="h-4 w-64 bg-gray-200 rounded" />
        </div>
      ))}
    </div>
  );
}
