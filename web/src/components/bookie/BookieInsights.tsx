import { Sparkles } from 'lucide-react';

/**
 * "Bookie's take" on the home dashboard: a short, plain-English read of the
 * organisation's position. Placeholder until the agent summary is wired in;
 * safe to render from a server component.
 */
export function BookieInsights({ orgKey }: { orgKey: string }) {
  void orgKey;
  return (
    <section
      aria-labelledby="bookie-take"
      className="card from-brand/10 via-surface to-surface relative overflow-hidden bg-gradient-to-br px-5 py-4"
    >
      <div className="flex items-start gap-3">
        <span className="bg-brand/15 text-brand-bright ring-brand/30 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1">
          <Sparkles className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="bookie-take" className="text-ink text-[15px] font-semibold">
            Bookie&rsquo;s take
          </h2>
          <p className="text-muted mt-0.5 text-sm">
            Bookie will summarise what needs your attention here: cash, who owes you, what&rsquo;s
            due, and anything unusual in the books.
          </p>
        </div>
      </div>
    </section>
  );
}
