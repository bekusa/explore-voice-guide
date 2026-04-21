export function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-soft">
      <div className="shimmer aspect-[4/3] w-full" />
      <div className="space-y-2 p-4">
        <div className="shimmer h-5 w-3/4 rounded" />
        <div className="shimmer h-3 w-1/2 rounded" />
      </div>
    </div>
  );
}
