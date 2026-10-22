import { describe, expect, it } from 'vitest';
import { NAV, navForUser } from './nav';

describe('member navigation', () => {
  it('places Email after Contacts for members', () => {
    const tabs = navForUser('Member');
    expect(tabs.findIndex((tab) => tab.key === 'email')).toBe(
      tabs.findIndex((tab) => tab.key === 'contacts') + 1
    );
    expect(tabs).toEqual(NAV);
  });
  it.each(['Guest', undefined])('hides member tabs for %s', (type) => {
    expect(navForUser(type).some((tab) => tab.key === 'email')).toBe(false);
    expect(navForUser(type)).toEqual(NAV.filter((tab) => !tab.members));
  });
});
