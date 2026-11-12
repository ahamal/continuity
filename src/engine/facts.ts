/** A single value a fact can take. A whole state is a tuple of numbers. */
export type Value = string | number | boolean | readonly number[];

/** A set of named facts, for example `{ action: 'right', x: 4, y: 4 }`. */
export type Facts = Readonly<Record<string, Value>>;

/** Whether two fact values are the same. Tuples compare element by element. */
export function sameValue(a: Value, b: Value): boolean {
  if (a === b) return true;
  if (typeof a === 'object' && typeof b === 'object') {
    return a.length === b.length && a.every((item, i) => item === b[i]);
  }
  return false;
}

/**
 * Canonical text form of a fact set. Names are sorted, so two fact sets with
 * the same contents always produce the same key, whatever order they were
 * written in.
 */
export function factsKey(facts: Facts): string {
  const names = Object.keys(facts).sort();
  return JSON.stringify(names.map((name) => [name, facts[name]]));
}

/** How many facts a set contains. More facts means a more specific set. */
export function factCount(facts: Facts): number {
  return Object.keys(facts).length;
}

/** Whether every fact in `inputs` also appears, with the same value, in `known`. */
export function isSubsetOf(inputs: Facts, known: Facts): boolean {
  for (const name of Object.keys(inputs)) {
    if (!Object.hasOwn(known, name)) return false;
    if (!sameValue(known[name]!, inputs[name]!)) return false;
  }
  return true;
}
