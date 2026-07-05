import rss from './rss.js';
import inaturalist from './inaturalist.js';
import wikipedia from './wikipedia.js';
import mastodon from './mastodon.js';
import flickr from './flickr.js';
import reddit from './reddit.js';
import twitter from './twitter.js';

export const SOURCES = [rss, inaturalist, wikipedia, mastodon, flickr, reddit, twitter];

export function activeSources() {
  return SOURCES.filter((s) => (s.enabled ? s.enabled() : true));
}
