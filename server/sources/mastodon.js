// Mastodon — public hashtag timelines across a few big instances. No auth.

import { get, stripHtml } from './util.js';

const INSTANCES = ['mastodon.social', 'mstdn.ca'];
const TAGS = ['cortesisland', 'cortes'];

export default {
  name: 'mastodon',
  async fetch() {
    const out = [];
    for (const host of INSTANCES) {
      for (const tag of TAGS) {
        try {
          const posts = await get(`https://${host}/api/v1/timelines/tag/${tag}?limit=20`, { as: 'json' });
          for (const p of posts) {
            const text = stripHtml(p.content);
            // the bare "cortes" tag needs a relevance check (Hernán Cortés noise)
            if (tag === 'cortes' && !/cortes island|#cortesisland/i.test(p.content)) continue;
            out.push({
              adapter: `mastodon:${host}`,
              title: text.slice(0, 120) || 'Mastodon post',
              link: p.url,
              summary: text,
              image: p.media_attachments?.find((m) => m.type === 'image')?.preview_url ?? null,
              author: p.account?.display_name || p.account?.acct,
              publishedAt: p.created_at,
              category: 'community',
            });
          }
        } catch (err) {
          console.warn(`[mastodon:${host}/${tag}] ${err.message}`);
        }
      }
    }
    return out;
  },
};
