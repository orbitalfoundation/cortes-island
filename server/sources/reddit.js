// Reddit search — often IP-blocked from residential networks but tends to
// work from cloud hosts; fails quietly when blocked.

import { get, stripHtml } from './util.js';

export default {
  name: 'reddit',
  async fetch() {
    const data = await get(
      'https://www.reddit.com/search.json?q=%22cortes+island%22&sort=new&limit=25&raw_json=1',
      { as: 'json', headers: { 'User-Agent': 'cortes-viz/0.1 (island data aggregator)' } },
    );
    if (!data?.data?.children) throw new Error('unexpected response (blocked?)');
    return data.data.children.map(({ data: p }) => ({
      adapter: 'reddit',
      title: p.title,
      link: `https://www.reddit.com${p.permalink}`,
      summary: stripHtml(p.selftext).slice(0, 900) || null,
      image: p.preview?.images?.[0]?.source?.url?.replace(/&amp;/g, '&') ?? null,
      author: p.author,
      publishedAt: new Date(p.created_utc * 1000).toISOString(),
      category: 'community',
      topics: [p.subreddit?.toLowerCase()].filter(Boolean),
    }));
  },
};
