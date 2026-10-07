# Board layout reference: MTG Arena

Chico's reference for how the table should look and how things are grouped and ordered.
Screenshot: [`reference/arena-board-2026-10-07.png`](reference/arena-board-2026-10-07.png) (Arena, 1v1, opponent's turn).
When changing the game table (`src/client/Game.tsx`, `src/client/board.css`), check against this first.

## Overall frame

- The opponent's half is on top and yours on the bottom. A thin patterned band across the middle marks the
  dividing line. Nothing important sits on that band.
- The playable area is a central lane. The edges are decorative and hold no game objects.
- The middle of each half is left mostly empty, so the battlefield reads clearly.

## Players

- **Avatar and life:** centred on each player's edge of the board. The opponent's avatar is at the top centre
  with the life total in a badge just below it. Yours is at the bottom centre with the life total on the
  avatar. Small resource and timer pips sit to the left and right of each avatar.
- **Names:** the opponent's name is top-left and yours is bottom-left. A timeout counter (hourglass "x1") sits
  next to each name.

## Hands

- **Your hand:** large cards fanned at the bottom centre, partly off the bottom of the screen, overlapping the
  space under your avatar.
- **Opponent's hand:** face-down card backs fanned along the very top, partly off-screen.

## Battlefield rows

On each side, from the middle line outwards:

1. **Creatures:** the row closest to the middle line, centred, side by side with a small gap. Each card
   shows power/toughness in a badge at the bottom-right corner. The frame border is tinted by the card's colour.
2. **Lands:** the row behind the creatures, near the player's edge, **left-aligned**. Lands are not centred
   under the creatures.
   - Identical lands **stack** into one pile with a small offset, so you can see the count (two Forests
     overlap; Swiftwater Cliffs fans behind another land).
   - Different lands sit side by side.
- A card can show a large translucent curved-arrow icon over its art and sit at a slight angle (Savannah
  Lions and one Forest in the screenshot). Arena uses this to mark a card's state. Check which state before
  copying it; don't assume.

## Library, graveyard, exile

- **Opponent:** library (face-down deck) at the **top-right**, with the graveyard just right of it (top card
  face up).
- **You:** graveyard at the **bottom-left**, cards face up and slightly fanned so the newest shows on top.
  The library sits under or next to it.

## Turn controls

- The phase / pass button is at the **bottom-right** ("Opponent's Turn" while waiting). The fast-forward
  (auto-pass) toggle sits just below it.
- The settings gear is at the **top-right** corner.

## Differences from our table today

- Our land row is centred under the creatures. Arena puts lands left-aligned near the player.
- Our piles sit in the bottom-right and top-right. Arena puts your graveyard/library bottom-left and the
  opponent's top-right.
- Our phase dial is on the middle bar at the right. Arena keeps it in the bottom-right corner, away from the
  battlefield.
- Our opponent's hand is a strip of small backs next to their avatar. Arena fans them across the top edge.

These are notes only: nothing has been changed to match yet.
