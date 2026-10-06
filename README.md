# PlayMTG Online (playmtg.online)

An online 1v1 Magic: The Gathering tabletop in the style of untap.in, with an Arena-style rules engine.
It includes every English card from Scryfall's Oracle bulk data (about 35,000 cards and 1,000 tokens).

## Quick start

```bash
npm install
npm run cards      # downloads every English card from Scryfall (~25 MB) into data/cards.json
npm run dev        # server on :8787, client on http://localhost:5173
```

Open the client, pick a mode and a deck in the lobby and press **PLAY**. If nobody else is queuing, a bot takes the
seat after about 20 seconds (Ranked always waits for a person).

To put it online (Supabase accounts, the game server on your PC through Cloudflare Tunnel, the site on Cloudflare
Pages), follow [HOSTING.md](HOSTING.md).

## Pages

- `/`: the lobby. Game modes (Quick Match, Standard, Commander, Ranked Commander, Draft Night), deck picker, daily
  quests (one swap a day), the 7-day login calendar, daily wins, season level, rank, friends, notifications and
  challenges, and spectating friends' games.
- `/decks`: the Deck Builder. Every card in the database with filters, imports (paste, link to Moxfield/Archidekt/
  MTGGoldfish/Scryfall/…, or a file) with spelling fixes, exports, mana curve and legality checks.
- `/shop`: the Arcana Shop. Six items rotate every day at 00:00 UTC, plus a weekly bundle. Equip sleeves, card
  backs, playmats and avatars; everyone at the table sees them.
- `/treasury`: gold tiers. Payments are off while in development, so a tier adds its gold for free.
- `/draft`: Draft Night. Booster opening, 45-second picks, a 40-card build and three rounds for ember prizes.
- `/assets`: a gallery of the animated components.

Gold is spent in the shop. Embers are earned by playing (win 40, finish 15, first win of the day 100) and pay for
Draft Night and ember items. Only games of 4 or more turns pay out, and games against bots pay out at most 10 times
a day.

## AI mode

The AI (`src/engine/ai.ts`) runs on the server in the opponent's seat. It keeps or mulligans based on land count and plays the land that fixes its colors.
It casts the most expensive spell it can afford, with creatures first before combat. Removal and burn go to your best threats, and burn goes to your face when it's lethal or nothing is worth killing.
It attacks when the attack is safe, a fair trade or lethal, and holds back a blocker if your counter-attack would kill it. It blocks to eat attackers, trades up, and chump-blocks only to survive.
It also counters your spells if it holds a counterspell, uses loyalty and equip abilities, and fires leftover instants at the end of your turn.
It can't resolve the "Resolve by hand" parts of its own cards, so apply those for it with the right-click menu.
`npx tsx tests/ai-selfplay.ts` plays AI-vs-AI games with the starter decks.

Production: `npm run build && npm start`. The Node server serves `dist/` and the WebSocket on `PORT` (default 8787).
Deploy it to a host that supports WebSockets (Railway, Render, Fly.io, a VPS). Vercel's serverless functions don't keep WebSockets open.
Re-run `npm run cards` whenever you want new sets.

## What the engine automates (Comprehensive Rules)

- **Turn structure:** untap, upkeep, draw (the starting player skips the first draw), main phases, all combat steps, end step, cleanup with the 7-card hand size.
- **Priority and the stack:** both players must pass in succession. Arena-style auto-pass and stops are configurable with the ⚙ button, plus a full-control option.
- **Casting:** timing checks (sorcery speed vs. instant/flash), targets, modes, X costs, auras, split/adventure/MDFC faces, flashback, and one land per turn.
- **Mana:** lands and mana abilities, floating pool that empties between steps, and an auto-payer that taps the right lands for colored, hybrid, Phyrexian and {2/C} costs.
- **Activated abilities:** tap/untap symbols, sacrifice, discard, life, counters, loyalty (once per turn at sorcery speed), equip, crew and cycling.
- **Triggers:** ETB, dies, leaves the battlefield, attacks, blocks, combat damage, upkeep/end step, cast triggers, landfall, prowess, exalted and ward. Triggers go on the stack in APNAP order.
- **Combat:** attack restrictions (summoning sickness, haste, defender, vigilance), attacking planeswalkers and battles, and blocking rules (flying/reach, menace, fear, intimidate, shadow, skulk, landwalk, protection). Damage handles first strike, double strike, trample, deathtouch, lifelink, infect, wither and toxic.
- **State-based actions:** 0 life, 10 poison, drawing from an empty library, lethal damage, deathtouch, 0 toughness, planeswalker loyalty, battle defense, the legend rule, unattached auras, and +1/+1 and −1/−1 counter annihilation.
- **London mulligan**, concede and rematch.
- **Hidden information:** the server is authoritative, and each player only receives what they are allowed to see.

## Hybrid automation: the honest part

Oracle text is parsed into effects the engine runs. It currently reads about 36% of cards fully and about 45% partly.

**Counters:** undying, persist, evolve, modular, outlast, adapt, bolster, support, mentor, training, backup, riot, fabricate, renown, bloodthirst, unleash, bushido, afflict, flanking, battle cry, annihilator, melee and dethrone. Sagas get lore counters and their chapters trigger. The engine also handles vanishing, fading, cumulative upkeep, echo, suspend and time counters, stun and shield counters, energy, experience/rad/poison player counters, and proliferate.

**Computed amounts:** "for each …", "equal to the number of …", "where X is …", "as long as …" statics, characteristic-defining P/T, and damage divided among targets.

**Continuous effects in layer order:** copy (clones, token copies, populate, embalm/eternalize), control (including "for as long as you control"), types (manlands, crew), colors, abilities ("loses all abilities"), set P/T, then modifications and counters.

**Replacement effects:** "exile it instead", Rest in Peace–style exile, Hardened Scales / Doubling Season–style counters, token doublers, damage doublers, damage prevention, umbra armor, "enter tapped" effects on opponents, and life-gain doubling.

**Zone permissions:** flashback, escape, disturb, foretell, plot, adventure, unearth, impulse draw ("exile the top card, you may play it"), Oblivion Ring–style "until ~ leaves", blink, and delayed "return at the next end step".

**Attach, face-down, transform:** attach effects, equip, living weapon, bestow, reconfigure, morph/megamorph/disguise, manifest/cloak/manifest dread, turning face up, transform, day/night, and intervening-if werewolves.

Any text the parser still doesn't understand is shown as **"Resolve by hand"** when that card resolves, and it's listed on the card preview.
The right-click menu shows automated actions first (cast options, abilities, turn face up). Manual untap-style tools stay under **Manual override**, and every manual action is logged.
**Also automated:** kicker (a separate "with kicker" cast option; "if it was kicked" effects and counters), cascade, "look at / reveal the top N cards" (pick some, the rest go to the bottom, graveyard, top, hand or exile), Class levels (level up as a sorcery; each level's abilities switch on), craft (choose materials from the battlefield or graveyard), meld (both halves combine and leave together), and last-known information (Swords to Plowshares uses the creature's power as it last was on the battlefield).

Still by hand: multikicker and non-mana kickers, choosing the order of cards put back on top, piles, and a few one-off "top N" effects.
`src/engine/oracle.ts` is the place to teach the parser new templates. `tests/automation.test.ts` shows how each mechanic is tested.

## The board and animations

The table uses the designer's redesign (framed mats, turn dial, fanned hand, stack spotlight, targeting arrow, log drawer).

- **Engine events.** Every rules action records a small animation event (`damage`, `move`, `counter`, `life`, `stack`, `cascade`, `transform`, `meld`, `craft`, `level`, `dayNight`, `control`, and more) with a sequence number. The view sends the latest ones, and the client plays each event once. Events never affect the rules.
- **Display queue.** The client shows server updates one at a time. Projectiles, combat lunges and "cast" flashes play on the old board first. Then the new board is shown, and cards FLIP-animate between zones: dying creatures grey out and tumble to the graveyard, draws fly from the library, and exiled-instead cards veer toward the graveyard before heading to exile. If updates pile up, animations are skipped so play never lags behind.
- **Where the code lives.** `src/client/fx.ts` holds the designer's helpers (float text, rings, shards, stamps, projectiles, banners, 3D flips). `src/client/Game.tsx` has `preFx`, `flipAll` and `postFx`, which map events to the mechanics in the animation checklist. `src/client/board.css` holds the board styles and textures.

## Project layout

- `scripts/build-cards.ts`: Scryfall bulk download → compact card DB
- `src/engine/`: rules engine (`engine.ts`), oracle parser (`oracle.ts`), characteristics/filters (`rules.ts`), mana payment (`mana.ts`)
- `server/`: HTTP API (card search, decklist parsing) and WebSocket game rooms
- `src/client/`: React UI (lobby, deck builder with Scryfall-style search, game table)
- `tests/`: `npm test` runs the engine tests. `npx tsx tests/fuzz.ts` plays random games with real cards.

Unofficial fan project. Card data and images © Wizards of the Coast, provided by Scryfall. Not produced or endorsed by Wizards of the Coast.
