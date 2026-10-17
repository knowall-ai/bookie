'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/** A timestamp in the viewer's own time zone (UTC until hydrated, so SSR stays stable). */
export function LocalTime({ iso }: { iso: string }) {
  const local = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return <span>{iso}</span>;
  const text = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...(local ? {} : { timeZone: 'UTC', timeZoneName: 'short' }),
  }).format(date);
  return <time dateTime={iso}>{text}</time>;
}
