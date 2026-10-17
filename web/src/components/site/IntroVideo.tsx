'use client';

import { useId, useRef, useState, useSyncExternalStore } from 'react';
import { formatCueTime, type Cue } from '@/lib/ui/vtt';
import { cn } from '@/lib/ui/cn';

const VIDEO = '/bookie/bookie-intro.mp4';
const POSTER = '/bookie/bookie-intro-poster.jpg';
const CAPTIONS = '/bookie/bookie-intro.vtt';
const noop = () => () => {};

/**
 * Bookie's 30-second introduction. Nothing downloads until someone presses
 * play (preload="none", poster only), it never starts on its own, and it plays
 * with sound and English captions on. The browser's own controls take over
 * once it starts. Without JavaScript the native controls show from the start.
 *
 * The transcript is the same captions file, parsed on the server, so it is in
 * the page's HTML even before anyone opens it.
 */
export function IntroVideo({ cues, className }: { cues: Cue[]; className?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  // False in the server HTML, true once React is running in the browser.
  const enhanced = useSyncExternalStore(
    noop,
    () => true,
    () => false
  );
  const [started, setStarted] = useState(false);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [current, setCurrent] = useState(-1);
  const transcriptId = useId();

  const play = (at?: number) => {
    const el = video.current;
    if (!el) return;
    setStarted(true);
    if (at !== undefined) el.currentTime = at;
    el.muted = false;
    void el.play().catch(() => {
      // Autoplay policy or a decode error: leave the native controls to the person.
    });
    // The poster button unmounts as playback starts: hand keyboard focus to the
    // video's own controls once they render.
    requestAnimationFrame(() => el.focus({ preventScroll: true }));
  };

  const onTime = () => {
    const t = video.current?.currentTime ?? 0;
    setCurrent(cues.findIndex((c) => t >= c.start && t < c.end));
  };

  return (
    <figure className={className}>
      <div className="relative aspect-video overflow-hidden rounded-[20px] bg-[#2a1d12] shadow-[0_30px_80px_-35px_rgb(255_190_90/0.4)] ring-1 ring-[#d4a64a]/45">
        <video
          ref={video}
          className="h-full w-full object-cover"
          poster={POSTER}
          preload="none"
          playsInline
          controls={!enhanced || started}
          aria-label="Bookie introduces himself, 30 seconds"
          onTimeUpdate={onTime}
          onPlay={() => setStarted(true)}
        >
          <source src={VIDEO} type="video/mp4" />
          <track kind="captions" src={CAPTIONS} srcLang="en" label="English" default />
          <a href={VIDEO}>Download Bookie’s introduction (MP4, 30 seconds)</a>
        </video>

        {enhanced && !started && (
          <button
            type="button"
            onClick={() => play()}
            className="group absolute inset-0 flex items-end justify-start p-5 text-left sm:p-8"
            aria-label="Play Bookie’s 30-second introduction, with sound and captions"
          >
            <span
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-[#1a1108]/75 via-[#1a1108]/10 to-transparent"
            />
            <span
              aria-hidden="true"
              className="absolute top-1/2 left-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#f2e8d8] shadow-[0_10px_40px_-8px_rgb(0_0_0/0.55)] ring-1 ring-[#d4a64a] transition-transform duration-200 group-hover:scale-105 group-focus-visible:scale-105 sm:h-24 sm:w-24"
            >
              <svg
                viewBox="0 0 24 24"
                className="ml-1 h-7 w-7 text-[#110b06] sm:h-8 sm:w-8"
                fill="currentColor"
              >
                <path d="M7 4.8v14.4a1 1 0 0 0 1.5.86l11.6-7.2a1 1 0 0 0 0-1.72L8.5 3.94A1 1 0 0 0 7 4.8z" />
              </svg>
            </span>
            <span aria-hidden="true" className="relative hidden sm:block">
              <span className="block text-lg font-semibold text-white sm:text-xl">
                Bookie introduces himself
              </span>
              <span className="mt-0.5 block text-sm text-white/80">
                30 seconds, with sound and captions
              </span>
            </span>
          </button>
        )}
      </div>

      <figcaption className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted text-sm">Bookie’s voice and pictures are AI-generated.</p>
        <button
          type="button"
          aria-expanded={transcriptOpen}
          aria-controls={transcriptId}
          onClick={() => setTranscriptOpen((o) => !o)}
          className="text-body hover:text-ink border-line hover:border-line-strong inline-flex h-9 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors"
        >
          <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            className={cn('h-3.5 w-3.5 transition-transform', transcriptOpen && 'rotate-180')}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <path d="m4 6 4 4 4-4" />
          </svg>
          {transcriptOpen ? 'Hide transcript' : 'Show transcript'}
        </button>
      </figcaption>

      <div id={transcriptId} hidden={!transcriptOpen} className="mt-4">
        <h3 className="sr-only">Transcript</h3>
        <ol className="border-line/70 bg-canvas/50 space-y-1 rounded-(--radius-card) border p-3 sm:p-4">
          {cues.map((cue, i) => (
            <li key={cue.start} className="flex gap-3">
              <button
                type="button"
                onClick={() => play(cue.start)}
                className="num text-muted hover:text-brand-bright w-11 shrink-0 rounded-md py-1.5 text-left text-sm"
                aria-label={`Play from ${formatCueTime(cue.start)}`}
              >
                {formatCueTime(cue.start)}
              </button>
              <p
                className={cn(
                  'py-1.5 leading-relaxed transition-colors',
                  i === current ? 'text-ink' : 'text-body'
                )}
                aria-current={i === current ? 'true' : undefined}
              >
                {cue.text}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </figure>
  );
}
