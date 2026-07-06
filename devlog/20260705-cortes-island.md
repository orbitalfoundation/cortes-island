# A living portrait of Cortes Island

*July 2026 · [cortes.exe.xyz](https://cortes.exe.xyz) · [source](https://github.com/orbitalfoundation/cortes-island)*

I spent a day building a 3D portrait of Cortes Island that aggregates
everything I could find about the place and hangs it over the terrain it
belongs to. This is a note on how it works and what I learned.

## What it is

A photorealistic model of the island — Google's 3D tiles, pulled through
Cesium ion but rendered entirely in three.js — under a sky computed from the
actual sun and moon positions for the island's coordinates. The weather is
real (Open-Meteo), so overcast in Whaletown means overcast on screen, and the
sea state follows the wind. The tide line in the corner comes from the
federal hydrographic station at Whaletown. At night the settlements glow.
The BC Ferries run to Heriot Bay crosses on roughly its actual schedule, a
CorilAir floatplane arrives from Vancouver around five, gulls circle Sutil
Point, and a humpback surfaces in Sutil Channel if you wait.

Over this hangs the data: floating cards, color-coded by category, tethered
to their coordinates. News from the local outlets. Wildlife observations
from iNaturalist, with photographs. Freely licensed photos from Wikimedia
Commons and Openverse. Community posts from Mastodon and Reddit. Landmarks
from Wikipedia and OpenStreetMap. Near the ground, a second tier of small
markers: stores, trailheads, marine hazards, where the herons are.

## The pipeline

A fastify server aggregates on a fifteen-minute tick. Each source adapter
emits raw items onto a pub/sub bus (`@orbitalfoundation/bus` — the same
single-channel pattern I use everywhere); an enrichment stage geolocates and
categorizes them; a store listener persists to Mongo and fans out changes
over socket.io to connected clients. Geolocation is tiered: exact
coordinates when the source has them, then a gazetteer of island place
names, then a language model pass that reads the text, judges whether it's
really about Cortes, scores importance, and extracts named places. Items
that resolve only to "the island" get scattered deterministically near
settlements — an early version scattered them around the island's centroid,
which put them all in Hague Lake, since the centroid of an island is the
one place nobody publishes from.

Deduplication turned out to be the interesting problem. The same
real-world thing arrives as an OpenStreetMap node, a Wikipedia article, a
news story, and a curated fact, each with a different URL. Title-token
similarity plus geographic proximity catches most of it, with one essential
exemption: items from the same source never merge, because two iNaturalist
sightings of the same species are different events, not duplicates.

## Mining a model for a place

The unexpected part: a frontier language model, asked directly, produced
about 180 dated, geolocated facts about this island of a thousand people —
the 1869 whaling station, the unsolved murder on Twin Islands, the Queen's
two visits, the clam gardens, the post-glacial shorelines 197 meters up in
the forest, which harbour bottoms won't hold an anchor. Spot-checking found
them largely right. These went in as versioned JSON with confidence labels
(documented / reported / oral tradition / legend) and a visible provenance
tag, not laundered into looking like scraped truth. The files are in the
repo; anyone can correct them.

## On making an island legible

Whether a place *should* be this visible is a real question, and the
project carries an essay about it in its about panel. The short version:
mapping has never been neutral — the 1860 Admiralty survey that charted
these shores marked Indigenous garden sites as empty "prairie land" — and a
real-time portrait of a small community could serve extraction as easily as
memory. The counter-tradition is community self-mapping, and the standard
to aim at is the one Indigenous data governance articulates (OCAP, CARE):
the people portrayed should control the portrait. This build uses public
sources, links everything to origin, labels the speculative, and is open
source. What it lacks is the part that matters most: the island's own
participation. That's the actual roadmap.

## Stack

three.js + 3d-tiles-renderer, fastify + socket.io, Mongo, an event bus,
Claude for enrichment, docker compose on a small VM. No CesiumJS, no map
framework, no frontend framework. About 4,000 lines. Most of the visual
richness — ocean shader, procedural clouds, sun and moon math, the
soundscape of surf, wind and gull cries — is small self-contained modules
with no assets; the only textures on the wire are the earth itself and the
photographs in the cards. The radio button plays CKTZ 89.5, the island's
community station, live. That one's not a simulation.
