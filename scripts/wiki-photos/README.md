# Wikimedia photos for imageless /explore/ pages (2026-10-14)

1. `lookup2.py`: for each imageless place, it checks Wikipedia search + geosearch candidates. A candidate is accepted only if all of these hold:
   - it has a free lead image
   - it is within 5 km of our coordinates
   - its title shares a distinctive word with the place name
2. Every pick was then reviewed by eye on a contact sheet. Maps, satellite shots and wrong buildings were dropped, and a few were hand-picked from Commons search (`final.json`).
3. `meta.json` holds the author and licence of each file (all CC / PD / CC0).
4. `urls.json` holds the resolved thumbnail URLs (1280px hero, 500px card), via `Special:FilePath`.
5. `patch.py` fills the page:
   - hero, app panel, og:image and JSON-LD `image`
   - a "Photo: author · licence · Wikimedia Commons" credit line (CC BY/BY-SA require attribution)
   - every noimg card that links to the place

Places still without a photo: no free, verifiable image was found. They are listed in the rollout log.
