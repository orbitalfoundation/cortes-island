# cortes — a living portrait of Cortes Island

A photorealistic 3D visualization of Cortes Island, BC, with a floating cloud
of geolocated information — news, wildlife observations, photos, community
posts — hovering over the places they belong to.

![architecture](docs/arch.md)

## What it does

- **Aggregates** island-related media on a schedule from: Google News RSS,
  Cortes Currents, Campbell River Mirror, iNaturalist (geotagged wildlife
  observations with photos), Wikipedia geosearch (landmarks), Mastodon
  hashtags, Flickr, Reddit, and X (with `X_BEARER_TOKEN`).
- **Enriches** every item: geolocation via a Cortes gazetteer + optional
  Claude pass (place extraction, categorization, importance scoring 0..1,
  topic tags, relevance filtering).
- **Stores** items in Mongo (ECS-ish blobs riding an
  [`@orbitalfoundation/bus`](https://github.com/orbitalfoundation/orbital-bus));
  the socket.io gateway answers `{ query }` shapes and fans out live changes.
- **Renders** the island as Google Photorealistic 3D Tiles (Cesium ion asset
  2275207 via `3d-tiles-renderer` + three.js) with:
  - real time-of-day: computed sun & moon positions, stars, tone-mapped
    day/dusk/night (keys `[` `]` scrub time, `0` resets, `?t=HH:MM` pins it)
  - an animated ocean shader with sun/moon glitter
  - drifting clouds, wheeling gulls, a humpback that surfaces in Sutil
    Channel, and the Heriot Bay–Whaletown ferry crossing on (approximately)
    its real schedule
  - **floating info cards** color-coded by category, tethered to their
    geolocation, height ∝ importance, opacity ∝ recency; hover to preview,
    click to focus (camera flies in, detail panel opens); legend chips filter
    categories

## Run it

```sh
npm install && npm --prefix client install
npm run build          # build the client → client/dist
cp .env.example .env   # add CESIUM_KEY (+ ANTHROPIC_API_KEY for enrichment)
npm start              # serves client + api + socket on :8000
npm run fetch          # one-shot aggregation (also runs on TICK_SECONDS)
```

Without mongo running it degrades to an in-memory store; `docker compose up`
brings mongo + app with data in a named volume that survives redeploys.

Dev loop: `npm start` (server on :8000) + `npm run dev` (vite on :5173,
proxies `/api` and `/socket.io`).

## Deploy (exe.dev)

The VM serves port 8000 at `https://<vm>.exe.xyz`. On the VM:

```sh
rsync -a --exclude node_modules --exclude .git . <vm>.exe.xyz:cortes/
ssh <vm>.exe.xyz 'cd cortes && docker compose up -d'
```

## Layout

```
server/            fastify + socket.io + bus; sources/, enrich, scheduler, store
client/            vite + three.js + 3d-tiles-renderer; world/, cards
docker-compose.yml mongo + app, bind-mounted repo
```
