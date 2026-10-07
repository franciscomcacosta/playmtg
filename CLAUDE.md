# Notes for Claude

- Board layout reference: before changing how the game table displays or sorts cards (battlefield rows, hand,
  library/graveyard/exile, avatars, turn controls), read [docs/ARENA_LAYOUT.md](docs/ARENA_LAYOUT.md) and the
  screenshot in `docs/reference/`. Match MTG Arena's conventions unless the user says otherwise.
- Typecheck: `node node_modules/typescript/bin/tsc --noEmit -p .`
- The site deploys from GitHub (Cloudflare Workers Builds, `npm run build:site`); the game server runs on the
  owner's PC behind the `playmtg` Cloudflare Tunnel at api.playmtg.online.
