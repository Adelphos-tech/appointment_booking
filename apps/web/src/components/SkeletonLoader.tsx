export function SkeletonCard() {
  return (
    <div className="glass-card p-5 space-y-3">
      <div className="flex items-start justify-between">
        <div className="skeleton w-11 h-11" />
        <div className="skeleton w-12 h-8" />
      </div>
      <div className="skeleton w-20 h-4" />
      <div className="skeleton w-full h-0.5 mt-3" />
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 p-4 border-b border-white/[0.04]">
      <div className="skeleton w-8 h-8 rounded-full" />
      <div className="flex-1 space-y-2">
        <div className="skeleton w-1/3 h-4" />
        <div className="skeleton w-1/2 h-3" />
      </div>
      <div className="skeleton w-16 h-6 rounded-full" />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="glass-card overflow-hidden">
      <div className="p-4 border-b border-white/[0.06]">
        <div className="skeleton w-40 h-5" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}

export function SkeletonDashboard() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="skeleton w-48 h-8" />
        <div className="skeleton w-72 h-4" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-6 space-y-4">
          <div className="skeleton w-40 h-5" />
          <div className="skeleton w-40 h-40 mx-auto" />
        </div>
        <div className="glass-card p-6 space-y-4">
          <div className="skeleton w-40 h-5" />
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
