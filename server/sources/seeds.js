// Curated seed items — hand-placed cultural and Indigenous landmarks that no
// feed carries: territory acknowledgment, Klahoose presence, museum, radio.
// Edit data/seeds.json to grow this layer.

import { readFileSync } from 'node:fs';

export default {
  name: 'seeds',
  async fetch() {
    const seeds = JSON.parse(readFileSync(new URL('../../data/seeds.json', import.meta.url), 'utf8'));
    return seeds.map((s) => ({ adapter: 'seeds', author: 'curated', ...s }));
  },
};
