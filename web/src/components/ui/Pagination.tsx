import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ButtonLink } from './Button';

export function Pagination({
  page,
  hasMore,
  basePath,
  params = {},
}: {
  page: number;
  hasMore: boolean;
  basePath: string;
  params?: Record<string, string | undefined>;
}) {
  if (page <= 1 && !hasMore) return null;
  const href = (p: number) => {
    const query = new URLSearchParams(
      Object.entries({ ...params, page: p > 1 ? String(p) : undefined }).filter(
        (e): e is [string, string] => !!e[1]
      )
    );
    return `${basePath}${query.size ? `?${query}` : ''}`;
  };
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-end gap-2">
      {page > 1 && (
        <ButtonLink href={href(page - 1)} size="sm" variant="ghost">
          <ChevronLeft className="h-4 w-4" /> Previous
        </ButtonLink>
      )}
      <span className="text-muted px-2 text-sm">Page {page}</span>
      {hasMore && (
        <ButtonLink href={href(page + 1)} size="sm" variant="ghost">
          Next <ChevronRight className="h-4 w-4" />
        </ButtonLink>
      )}
    </nav>
  );
}
