import type { DemoData } from '../data';

/**
 * Extra per-org demo state, kept on the shared `DemoData` object itself rather
 * than in module-level maps: Next.js dev can evaluate a module more than once
 * (per route, after HMR), and the demo books must stay one consistent store.
 */
export function demoSlot<T>(data: DemoData, name: string, init: () => T): T {
  const key = Symbol.for(`bookie.demo.${name}`);
  const bag = data as unknown as Record<symbol, T | undefined>;
  return (bag[key] ??= init());
}
