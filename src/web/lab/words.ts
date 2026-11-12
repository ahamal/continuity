import type { Facts, Value } from '../../core/facts';
import type { Prediction } from '../../agents/parts';
import { type Action, type State, formatState } from '../../core/state';

// Everything that turns the engine's data into words lives here, so the
// engine itself never deals in text.

export { formatState };

export function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

export function formatValue(name: string, value: Value): string {
  if (typeof value === 'object') return formatState(value as State);
  if (typeof value === 'number' && /^d[a-z]/.test(name)) return signed(value);
  return String(value);
}

/** `action = right, x = 4` */
export function formatFacts(facts: Facts): string {
  // The action reads best first: "action = right, x = 4".
  return Object.keys(facts)
    .sort((a, b) => Number(b === 'action') - Number(a === 'action'))
    .map((name) => `${name} = ${formatValue(name, facts[name]!)}`)
    .join(', ');
}

/** `down, right ×4, up` */
export function formatPath(path: readonly Action[]): string {
  const parts: string[] = [];
  for (let i = 0; i < path.length; ) {
    let j = i;
    while (path[j] === path[i]) j += 1;
    parts.push(j - i > 1 ? `${path[i]} ×${j - i}` : path[i]!);
    i = j;
  }
  return parts.join(', ');
}

export function times(n: number): string {
  return n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`;
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** What a prediction rested on, as a short phrase. */
export function basisPhrase(prediction: Prediction, action: Action): string {
  return prediction.source === 'specific'
    ? `this exact move, seen ${times(prediction.count)} before`
    : `the general rule for ${action}, seen ${times(prediction.count)}`;
}
