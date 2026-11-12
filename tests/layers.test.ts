import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The layers of src, and which other layers each one may import from.
// See ARCHITECTURE.md. This test fails if a file reaches the wrong way.
const allowed: Record<string, string[]> = {
  core: [],
  worlds: ['core'],
  agents: ['core'],
  runs: ['core', 'worlds', 'agents'],
  experiments: ['core', 'worlds', 'agents', 'runs'],
  web: ['core', 'worlds', 'agents', 'runs'],
};

function filesIn(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((item) =>
    item.isDirectory() ? filesIn(join(dir, item.name)) : item.name.endsWith('.ts') ? [join(dir, item.name)] : [],
  );
}

describe('layers', () => {
  it.each(Object.keys(allowed))('%s imports only from the layers below it', (layer) => {
    const wrong: string[] = [];
    for (const file of filesIn(join('src', layer))) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/from '((?:\.\.\/)+)([a-z-]+)\//g)) {
        const depth = file.split('/').length - 2; // folders between src and the file
        const reachesSrc = match[1]!.length / 3 === depth;
        const target = match[2]!;
        if (reachesSrc && target !== layer && !allowed[layer]!.includes(target)) {
          wrong.push(`${file} imports from ${target}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });
});
