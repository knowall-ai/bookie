import { Info } from 'lucide-react';

/** A quiet banner explaining what the source system can't tell us. */
export function SourceNote({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div
      role="note"
      className="border-info/30 bg-info/5 text-body mb-4 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm"
    >
      <Info className="text-info mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p>{children}</p>
    </div>
  );
}
