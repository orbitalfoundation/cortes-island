// RSS/Atom adapter — local news and a Google News sweep for "Cortes Island".
// Feeds that are Cloudflare-shy simply fail quietly this round; Google News
// indexes the local outlets anyway so coverage degrades gracefully.

import { XMLParser } from 'fast-xml-parser';
import { get, stripHtml } from './util.js';

const FEEDS = [
  {
    url: 'https://news.google.com/rss/search?q=%22Cortes%20Island%22&hl=en-CA&gl=CA&ceid=CA:en',
    name: 'google-news', category: 'news',
  },
  { url: 'https://cortescurrents.ca/feed/', name: 'cortes-currents', category: 'news' },
  { url: 'https://www.campbellrivermirror.com/feed/', name: 'cr-mirror', category: 'news', filter: /cortes/i },
];

const parser = new XMLParser({ ignoreAttributes: false });
const arr = (x) => (Array.isArray(x) ? x : x != null ? [x] : []);

function firstImage(entry, html) {
  const media = arr(entry['media:content'])[0] ?? arr(entry['media:thumbnail'])[0];
  if (media?.['@_url']) return media['@_url'];
  const enc = arr(entry.enclosure)[0];
  if (enc?.['@_url'] && /image/.test(enc['@_type'] ?? 'image')) return enc['@_url'];
  const m = (html ?? '').match(/<img[^>]+src="([^"]+)"/i);
  return m ? m[1] : null;
}

export default {
  name: 'rss',
  async fetch() {
    const out = [];
    for (const feed of FEEDS) {
      try {
        const xml = await get(feed.url);
        const doc = parser.parse(xml);
        const channel = doc?.rss?.channel ?? doc?.feed;
        const entries = arr(channel?.item ?? channel?.entry);
        for (const e of entries.slice(0, 40)) {
          const title = stripHtml(typeof e.title === 'object' ? e.title['#text'] : e.title);
          const link = typeof e.link === 'object' ? (e.link['@_href'] ?? e.link['#text']) : e.link;
          const rawDesc = typeof e.description === 'object' ? e.description['#text'] : (e.description ?? e.summary ?? e['content:encoded']);
          const text = `${title} ${stripHtml(rawDesc)}`;
          if (feed.filter && !feed.filter.test(text)) continue;
          out.push({
            adapter: `rss:${feed.name}`,
            title,
            link,
            summary: stripHtml(rawDesc)?.slice(0, 900) || null,
            image: firstImage(e, typeof rawDesc === 'string' ? rawDesc : null),
            author: stripHtml(e['dc:creator'] ?? e.author?.name ?? '') || feed.name,
            publishedAt: e.pubDate ?? e.published ?? e.updated ?? null,
            category: feed.category,
          });
        }
      } catch (err) {
        console.warn(`[rss:${feed.name}] ${err.message}`);
      }
    }
    return out;
  },
};
