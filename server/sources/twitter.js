// X/Twitter recent search — dormant unless X_BEARER_TOKEN is configured.

import { get } from './util.js';

export default {
  name: 'twitter',
  enabled: () => Boolean(process.env.X_BEARER_TOKEN),
  async fetch() {
    const q = encodeURIComponent('"cortes island" -is:retweet');
    const data = await get(
      `https://api.twitter.com/2/tweets/search/recent?query=${q}&max_results=25&tweet.fields=created_at,author_id&expansions=author_id,attachments.media_keys&media.fields=preview_image_url,url&user.fields=name,username`,
      { as: 'json', headers: { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` } },
    );
    const users = new Map((data.includes?.users ?? []).map((u) => [u.id, u]));
    const media = new Map((data.includes?.media ?? []).map((m) => [m.media_key, m]));
    return (data.data ?? []).map((t) => {
      const user = users.get(t.author_id);
      const img = (t.attachments?.media_keys ?? []).map((k) => media.get(k)).find((m) => m?.url || m?.preview_image_url);
      return {
        adapter: 'twitter',
        title: t.text.slice(0, 120),
        link: `https://x.com/${user?.username ?? 'i'}/status/${t.id}`,
        summary: t.text,
        image: img?.url ?? img?.preview_image_url ?? null,
        author: user?.name ?? user?.username ?? null,
        publishedAt: t.created_at,
        category: 'community',
      };
    });
  },
};
