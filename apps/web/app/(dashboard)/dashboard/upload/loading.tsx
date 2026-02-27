export default function UploadLoading() {
  return (
    <div className="max-w-2xl animate-pulse" role="status" aria-label="Загрузка">
      <div className="h-8 w-48 bg-gray-200 rounded mb-6" />
      <div className="bg-white rounded-xl border p-8 space-y-4">
        <div className="h-32 bg-gray-100 rounded-lg border-2 border-dashed" />
        <div className="h-4 w-64 bg-gray-200 rounded" />
      </div>
    </div>
  );
}
