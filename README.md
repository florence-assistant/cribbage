# 🃏 Cribbage

A complete browser-based Cribbage card game — human vs AI opponent.

## Play

Open `index.html` in any modern browser. No server required.

## Features

- **Complete 2-player cribbage rules** (human vs AI)
- **All game phases:** deal → discard to crib → cut starter → pegging → hand scoring → crib scoring
- **Standard scoring:** 15s, pairs, runs, flushes, nobs, right jack (heels)
- **First to 121 wins** with visual cribbage board tracking
- **Detailed scoring breakdowns** — learn what scores and why
- **Smart AI opponent** — reasonable discard and pegging strategy
- **Modern responsive UI** with CSS card graphics and animations

## Rules Quick Reference

- Each player is dealt 6 cards; discard 2 to the crib
- Cut a starter card (jack = 2 points "heels" for dealer)
- **Pegging:** alternate playing cards, counting toward 31
  - 15 = 2 pts, 31 = 2 pts, pair = 2 pts, three-of-a-kind = 6 pts, four-of-a-kind = 12 pts
  - Runs of 3+ = length pts, last card (go) = 1 pt
- **Hand scoring:** 15s (2 pts each), pairs (2 pts), runs (length), flushes (4-5 pts), nobs (1 pt)
- Crib scores same as hand (flush must be 5 cards)
- First to 121 points wins. If opponent hasn't reached 91, it's a **skunk**!

## Tech

Single-page app: HTML + CSS + vanilla JavaScript. Zero dependencies.
