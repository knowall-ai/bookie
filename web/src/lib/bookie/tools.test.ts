import { describe, expect, it } from 'vitest';
import { NOT_AVAILABLE, toolJson } from './tools';
import { bookieInstructions } from './prompt';

describe('Bookie tool output', () => {
  it('marks figures the source did not provide instead of dropping them', () => {
    const json = JSON.parse(
      toolJson({
        number: 'PI-1',
        reference: undefined,
        total: 120,
        amountDue: undefined,
        amountPaid: undefined,
        currency: '',
        status: 'unknown',
        rate: undefined,
      })
    );
    expect(json).toEqual({
      number: 'PI-1',
      total: 120,
      amountDue: NOT_AVAILABLE,
      amountPaid: NOT_AVAILABLE,
      currency: NOT_AVAILABLE,
      status: NOT_AVAILABLE,
      rate: NOT_AVAILABLE,
    });
    // Ordinary optional text fields are simply omitted, not marked.
    expect(json).not.toHaveProperty('reference');
  });

  it('keeps real zeros and statuses', () => {
    expect(JSON.parse(toolJson({ amountDue: 0, status: 'paid' }))).toEqual({
      amountDue: 0,
      status: 'paid',
    });
  });

  it('tells Bookie never to estimate a figure marked not available', () => {
    const prompt = bookieInstructions(undefined, { name: 'Alex Morgan' }, 'chat');
    expect(prompt).toContain('If a figure is marked not available, say so; never estimate it.');
  });
});
