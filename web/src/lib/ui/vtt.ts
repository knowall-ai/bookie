/** One caption from a WebVTT file: times in seconds, text with line breaks joined. */
export interface Cue {
  start: number;
  end: number;
  text: string;
}

const TIMING =
  /^((?:\d+:)?\d{1,2}:\d{2}(?:\.\d{1,3})?)\s+-->\s+((?:\d+:)?\d{1,2}:\d{2}(?:\.\d{1,3})?)/;

/** `01:02.5` or `00:01:02.500` to seconds. */
function seconds(stamp: string): number {
  return stamp.split(':').reduce((total, part) => total * 60 + Number(part), 0);
}

/**
 * Parses the cues out of a WebVTT captions file, for a readable transcript.
 * Skips the header, NOTE, STYLE and REGION blocks, and strips cue settings and
 * inline tags (`<v Bookie>`, `<i>`). Good for the captions we write ourselves,
 * not a full WebVTT implementation.
 */
export function parseVtt(source: string): Cue[] {
  const blocks = source
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/);
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    const at = lines.findIndex((l) => TIMING.test(l));
    if (at < 0) continue;
    const [, from, to] = lines[at].match(TIMING)!;
    const text = lines
      .slice(at + 1)
      .map((l) => l.replace(/<[^>]+>/g, '').trim())
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) cues.push({ start: seconds(from), end: seconds(to), text });
  }
  return cues;
}

/** Seconds to `0:05` for a transcript's timestamps. */
export function formatCueTime(s: number): string {
  const whole = Math.floor(s);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
