import { Plus } from 'lucide-react';

export interface FaqItem {
  q: string;
  a: React.ReactNode;
}

/** Native disclosure widgets: keyboard and screen-reader friendly with no script. */
export function Faq({ items }: { items: FaqItem[] }) {
  return (
    <div className="border-line border-t">
      {items.map((item) => (
        <details key={item.q} className="group border-line border-b">
          <summary className="text-ink hover:text-brand-bright flex cursor-pointer list-none items-start justify-between gap-6 py-5 text-lg font-medium [&::-webkit-details-marker]:hidden">
            {item.q}
            <Plus
              aria-hidden="true"
              className="text-brand mt-1 h-5 w-5 shrink-0 transition-transform duration-200 group-open:rotate-45"
            />
          </summary>
          <div className="text-body max-w-3xl pb-6 leading-relaxed">{item.a}</div>
        </details>
      ))}
    </div>
  );
}
