# Devlog — 2026-07-05 — Data sources: what we have, what's missing

The island portrait aggregates every 15 minutes (`TICK_SECONDS`), enriches
(gazetteer → Claude), dedupes across sources (title-Jaccard + proximity,
`server/dedupe.js`), and stores ECS-ish item blobs in Mongo. Two display
tiers: **floating cards** (newsy, time-anchored) and **ground markers**
(informational — POIs, hazards, habitat spots).

## Sources live today

| Source | What it gives us | Tier | Notes |
|---|---|---|---|
| Google News RSS | island news from all outlets | float | best ongoing carrier of Cortes Currents + Klahoose coverage |
| Cortes Currents RSS | local journalism | float | Cloudflare-blocks some networks; Google News backfills |
| Campbell River Mirror RSS | regional news filtered to Cortes | float | |
| iNaturalist API | geotagged wildlife observations + photos | float | the "sense of life" backbone; ~60/tick, exact coords |
| Wikipedia geosearch | landmark articles + lead images | float | exact coords |
| Wikimedia Commons geosearch | freely licensed geotagged photos | float | historic + contemporary, license surfaced |
| Openverse API | CC-licensed images tagged "cortes island" | float | aggregates Flickr CC, museums |
| Flickr public feed | tagged photos | float | tag-based, no key |
| Mastodon hashtags | community posts | float | mastodon.social; mstdn.ca rejects tag API |
| Reddit search | community posts | float | works from datacenter IPs only |
| X/Twitter recent search | posts | float | dormant until `X_BEARER_TOKEN` |
| OSM Overpass POIs | stores, halls, trailheads, parks, marinas | ground | exact coords, ~27 named POIs |
| `data/seeds.json` | curated Indigenous + cultural anchors | float | ʔayʔaǰuθəm welcome, Klahoose T'oq, museum, CKTZ |
| `data/claude-facts.json` | 100 dated places/events/people (LLM-mined, hand-reviewed) | float | "island almanac" |
| `data/claude-lore.json` | 42 deep cuts: pictographs, naming lore, hazards, insider tips | mixed | `confidence` field distinguishes documented / reported / secondhand |
| `data/spots.json` | where to see whales/herons/eagles, kayak, stargaze | ground | non-overlapping with lore |
| `data/claude-esoterica.json` | 31 esoterica: Twin Islands royal saga, Nixon cold case, Ostman sasquatch declaration, deep-time geology, flood narratives | float | wider "storyshed" bbox (Toba, Quadra, Church House); confidence incl. `oral_tradition`/`legend` |
| Open-Meteo | live weather → sky, clouds, sea state, rain/snow | ambient | drives the renderer, not items |
| DFO/CHS IWLS | tide predictions, Whaletown station | ambient | HUD line; hazards are tide-dependent |
| CKTZ 89.5 stream | the island's actual voice | ambient | radio toggle |

## Topic coverage (honest assessment)

Strong: wildlife sightings, local news, landmarks/geography, cultural and
Indigenous anchors (curated), photos, marine lore/hazards, live weather+tide.
Thin: **events** (no calendar feed — Tideline/Mansons Hall events would fix
this), **community voices** (social sources are weakest; Facebook groups are
where island chatter actually lives and are unscrapeable), **economy/housing**
(one census item), **governance** (no SRD Area B agendas).

## Where to improve next (reviewed against Claude's gap analysis)

1. ~~**Tides + wind**~~ — done today (Open-Meteo wind was already wired;
   DFO Whaletown tides now in the HUD). Next step: surface tide state *on*
   the tide-dependent hazard markers (Uganda Passage, reversing rapids).
2. **Ferry service alerts** — BC Ferries Route 24 conditions/cancellations;
   scraping their service notices page is doable and high-value (also would
   drive the 3D ferry's actual schedule instead of a hardcoded table).
3. **eBird API** — needs a free key; adds dated bird occurrence series
   (`EBIRD_KEY` config slot, adapter is trivial). GBIF as the no-key
   aggregate fallback.
4. **Hydrophones / acoustics** — Ocean Networks Canada has regional
   hydrophones; even linking live listening stations as ground markers
   would be evocative. Orca Sound (orcasound.net) is US-side but the model
   to copy.
5. **Webcams** — no known public Cortes webcam; a community contribution
   (co-op? ferry dock?) would be a lovely first-party addition.
6. **Tenures/jurisdiction overlays** (shellfish, forestry, parks,
   Klahoose lands) — BC Data Catalogue WFS layers; a bigger lift because it
   means polygon rendering, not point items.
7. **Census/economic structure** — StatCan profile for the Cortes census
   subdivision; seasonal population curve worth modeling.
8. **ɁayɁaǰuθəm toponym layer** — the right way is *with* Klahoose (FPCC
   First Peoples' Map has no public API). Curated file in the meantime;
   several names already in seeds/lore.
9. **Events calendar** — Mansons Hall / Cortes Community Foundation
   listings; would fill the emptiest category.

## Provenance policy

LLM-mined facts are labeled ("island almanac"), carry search links rather
than fabricated URLs, keep a `confidence` field, and live in versioned JSON
under `data/` where anyone can PR a correction. Everything else links to its
source; merged duplicates keep alternate URLs in `source.alternates`.
