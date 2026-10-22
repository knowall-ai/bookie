import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BalanceAsAt } from './BalanceAsAt';

it('shows the date the source states, else its note, else nothing', () => {
  expect(
    renderToStaticMarkup(<BalanceAsAt account={{ balance: 10, balanceAsAt: '2026-10-22' }} />)
  ).toContain('As at 22 Oct 2026');
  expect(
    renderToStaticMarkup(
      <BalanceAsAt account={{ balance: 10, balanceNote: 'Every posted entry' }} />
    )
  ).toContain('Every posted entry');
  // Never a guessed date: no date and no note shows nothing, and no balance shows nothing.
  expect(renderToStaticMarkup(<BalanceAsAt account={{ balance: 10 }} />)).toBe('');
  expect(renderToStaticMarkup(<BalanceAsAt account={{ balanceAsAt: '2026-10-22' }} />)).toBe('');
});
