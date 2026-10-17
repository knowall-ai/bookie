import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatCueTime, parseVtt } from './vtt';

describe('parseVtt', () => {
  it('reads cues, joining multi-line captions', () => {
    const cues = parseVtt(
      'WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.600\nHello, I’m Bookie.\n\n2\n00:00:05.000 --> 00:00:10.600 align:start\nFirst line,\nsecond line.\n'
    );
    expect(cues).toEqual([
      { start: 1, end: 4.6, text: 'Hello, I’m Bookie.' },
      { start: 5, end: 10.6, text: 'First line, second line.' },
    ]);
  });

  it('handles short timestamps, CRLF, a BOM, NOTE blocks and voice tags', () => {
    const cues = parseVtt(
      '﻿WEBVTT - intro\r\n\r\nNOTE written by hand\r\n\r\n01:02.500 --> 01:04.000\r\n<v Bookie>Shall we <i>have a look</i>?</v>\r\n'
    );
    expect(cues).toEqual([{ start: 62.5, end: 64, text: 'Shall we have a look?' }]);
  });

  it('skips cues with no text', () => {
    expect(parseVtt('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n\n')).toEqual([]);
  });

  it('parses the intro captions shipped with the site', () => {
    const file = path.join(__dirname, '../../../public/bookie/bookie-intro.vtt');
    const cues = parseVtt(readFileSync(file, 'utf8'));
    expect(cues.length).toBeGreaterThan(3);
    expect(cues[0].text).toMatch(/Bookie/);
    for (const cue of cues) expect(cue.end).toBeGreaterThan(cue.start);
  });
});

describe('formatCueTime', () => {
  it('formats minutes and padded seconds', () => {
    expect(formatCueTime(0)).toBe('0:00');
    expect(formatCueTime(5.9)).toBe('0:05');
    expect(formatCueTime(75)).toBe('1:15');
  });
});
