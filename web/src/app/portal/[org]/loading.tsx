export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse space-y-4">
      <div className="bg-surface-2 h-8 w-64 rounded-lg" />
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card h-36" />
        ))}
      </div>
      <div className="card h-80" />
    </div>
  );
}
