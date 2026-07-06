import rss from './rss.js';
import inaturalist from './inaturalist.js';
import wikipedia from './wikipedia.js';
import mastodon from './mastodon.js';
import flickr from './flickr.js';
import reddit from './reddit.js';
import twitter from './twitter.js';
import osm from './osm.js';
import seeds from './seeds.js';
import facts from './facts.js';
import commons from './commons.js';
import openverse from './openverse.js';

// order matters a little: curated layers first so they win dedupe richness
export const SOURCES = [seeds, facts, osm, wikipedia, commons, rss, inaturalist, mastodon, flickr, openverse, reddit, twitter];

export function activeSources() {
  return SOURCES.filter((s) => (s.enabled ? s.enabled() : true));
}
