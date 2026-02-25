export default function Loading() {
  return (
    <div className="flex flex-col h-full animate-pulse">
      <div className="px-6 py-3">
        <div className="h-4 w-64 bg-muted rounded" />
      </div>
      <div className="flex flex-1 gap-4 p-6">
        {/* Video preview skeleton */}
        <div className="flex-1 flex flex-col gap-4">
          <div className="aspect-[9/16] max-h-[60vh] bg-muted rounded-lg" />
          <div className="h-16 bg-muted rounded" />
        </div>
        {/* Side panel skeleton */}
        <div className="w-80 flex flex-col gap-4">
          <div className="h-10 bg-muted rounded" />
          <div className="h-32 bg-muted rounded" />
          <div className="h-48 bg-muted rounded" />
        </div>
      </div>
    </div>
  );
}
