# Fanatics watching implementation plan

Approved plan for watch/unwatch and the Watching section on Fanatics Auctions, as specified in `docs/features/FANATICS-AUCTIONS.MD`.

## Behavior

Fanatics Auctions keeps its existing overview, Won lots, and extension tags. The overview also shows how many lots in the current weekly auction are watched on Fanatics, including lots that already have a bid. A heart on each row shows whether that lot is watched on Fanatics. Clicking it watches or unwatches the lot on Fanatics. That is the only write to Fanatics.

Sections, in order, are Pinned, Winning, Losing, Watching, Won, and Hidden. Empty sections are omitted, except Watching stays visible when there are unbid watched lots that are not in the current sample.

Watching is up to 20 lots from the current weekly auction that the user is watching and has not bid on, leaving out pinned and hidden lots. Duplicate titles stay eligible. The same 20 stay in place when the auction reloads. The refresh control on that section picks a new 20.

## Architecture

Bids keep `isWatching` from Fanatics. Unbid watches come from `collectWatchlist` for the current weekly auction. Watch and unwatch use Fanatics' listing mutations. Parsing and the board live in `src/shared`. The watched sample is stored in `fanatics.json`.

## Steps

1. Parse watch state, the watchlist, and the 20-lot sample.
2. Read and toggle watches with the stored Fanatics session.
3. Add the heart column, Watching section, and section refresh.
4. Cover the board with unit tests.

## Acceptance criteria

- A heart watches or unwatches that lot on Fanatics.
- Watching shows up to 20 unbid watched lots from this week's auction.
- The Watching refresh control picks a new 20.
- Won lots and extension tags stay in the list.
- Duplicate titles are not collapsed to the cheapest listing.

## Verification

Unit tests for watchlist parsing, section order, and the watched sample. A live auction needs the user's Fanatics account.

## Status

- [x] Shared watch board
- [x] Read Fanatics watchlist and toggle watch with the stored session
- [x] Heart column, Watching section, and section refresh
- [x] Unit tests
