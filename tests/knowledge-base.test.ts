import { describe, expect, it } from 'vitest';
import { factsKey } from '../src/engine/facts';
import { KnowledgeBase } from '../src/engine/knowledge-base';

describe('factsKey', () => {
  it('ignores the order facts were written in', () => {
    expect(factsKey({ action: 'right', x: 4 })).toBe(factsKey({ x: 4, action: 'right' }));
  });

  it('tells different values apart', () => {
    expect(factsKey({ x: 4 })).not.toBe(factsKey({ x: 5 }));
  });
});

describe('KnowledgeBase', () => {
  it('returns null when nothing applies', () => {
    const kb = new KnowledgeBase();
    expect(kb.query('dx', { action: 'right' })).toBeNull();
  });

  it('counts repeated observations', () => {
    const kb = new KnowledgeBase();
    kb.observe({ action: 'right' }, { dx: 1 });
    kb.observe({ action: 'right' }, { dx: 1 });
    expect(kb.query('dx', { action: 'right' })).toMatchObject({ value: 1, specificity: 1, count: 2 });
    expect(kb.size).toBe(1);
  });

  it('applies an entry only when all its inputs are known', () => {
    const kb = new KnowledgeBase();
    kb.observe({ action: 'right', x: 9 }, { dx: 0 });
    expect(kb.query('dx', { action: 'right' })).toBeNull();
    expect(kb.query('dx', { action: 'right', x: 3 })).toBeNull();
    expect(kb.query('dx', { action: 'right', x: 9, y: 2 })).toMatchObject({ value: 0 });
  });

  it('prefers the more specific entry, even with fewer sightings', () => {
    const kb = new KnowledgeBase();
    for (let i = 0; i < 10; i++) kb.observe({ action: 'right' }, { dx: 1 });
    kb.observe({ action: 'right', x: 9 }, { dx: 0 });

    expect(kb.query('dx', { action: 'right', x: 9 })).toMatchObject({ value: 0, specificity: 2, count: 1 });
    expect(kb.query('dx', { action: 'right', x: 2 })).toMatchObject({ value: 1, specificity: 1, count: 10 });
  });

  it('breaks a tie in specificity by the higher count', () => {
    const kb = new KnowledgeBase();
    kb.observe({ action: 'right' }, { dx: 0 });
    kb.observe({ action: 'right' }, { dx: 1 });
    kb.observe({ action: 'right' }, { dx: 1 });
    expect(kb.query('dx', { action: 'right' })).toMatchObject({ value: 1, count: 2 });
  });

  it('keeps every outcome seen for the same inputs', () => {
    const kb = new KnowledgeBase();
    kb.observe({ action: 'right' }, { dx: 0 });
    kb.observe({ action: 'right' }, { dx: 1 });
    const [entry] = kb.entries();
    expect(entry!.outcomes.size).toBe(2);
  });

  it('compares tuple values by content', () => {
    const kb = new KnowledgeBase();
    kb.observe({ at: [1, 2] }, { seen: true });
    expect(kb.query('seen', { at: [1, 2] })).toMatchObject({ value: true });
    expect(kb.query('seen', { at: [2, 1] })).toBeNull();
  });
});
