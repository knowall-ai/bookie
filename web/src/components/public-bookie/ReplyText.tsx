import { Fragment, type ReactNode } from 'react';
import { isAllowedLink } from '@/lib/public-bookie/links';

/**
 * Renders the public helper's replies: paragraphs, bullet lists, **bold** and
 * links. Deliberately tiny (no markdown library, no HTML): only allowed links
 * are clickable and nothing else can be injected.
 */
export function ReplyText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split('\n');
        if (lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l))) {
          return (
            <ul key={i} className="my-1.5 list-disc space-y-1 pl-5">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ''))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="my-1.5 first:mt-0 last:mb-0">
            {lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </>
  );
}

const TOKEN = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|(https:\/\/[^\s)]+[^\s).,;:!?])/g;

function inline(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of line.matchAll(TOKEN)) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const [whole, label, href, bold, bare] = m;
    if (bold) out.push(<strong key={m.index}>{bold}</strong>);
    else out.push(link(label ?? bare, href ?? bare, m.index) ?? label ?? whole);
    last = m.index + whole.length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

function link(label: string, href: string, key: number) {
  if (!isAllowedLink(href)) return undefined;
  const external = href.startsWith('https://');
  return (
    <a
      key={key}
      href={href}
      className="text-brand-bright underline underline-offset-2 hover:no-underline"
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {label}
    </a>
  );
}
