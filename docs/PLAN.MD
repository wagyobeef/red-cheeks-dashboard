# Alt Auctions implementation plan

Approved plan for the Alt Auctions tab, as specified in `docs/features/ALT-AUCTIONS.MD`.

## Behavior

The sidebar lists Home, Fanatics Auctions, Fanatics Selling, and Alt Auctions, grouped by platform. Home, Fanatics Auctions, and Fanatics Selling stay as they are.

Alt Auctions uses its own Alt session. A missing session asks the user to sign in on Alt's page. The password is not stored. The saved session stays on this Mac and is used to read the account and to open a lot in Chrome already signed in.

The overview shows the current auction name when Alt provides one, the winning count, the outbid count, and the winning current-bid and max-bid totals. Totals include the 20% buyer's premium and include pinned and hidden winning lots. Watched lots with no bid are left out of the counts and totals.

The bid list matches the Fanatics Auctions list. Each row shows the item name on two lines, the current bid and max bid with the buyer's premium, a market price, and the profit against the higher of those two bids. Winning is green and Outbid is orange. A row opens that lot in Google Chrome with the saved Alt session. Pin and hide work the same way as Fanatics Auctions.

A heart shows whether the lot is watched on Alt. Clicking it watches or unwatches the lot on Alt. That is the only write to Alt.

Sections, in order, are Pinned, Winning, Losing, Watching, and Hidden. Empty sections are omitted. Within a section, rows sort by max bid from highest to lowest. A watched lot with no max bid sorts by its current bid.

Watching is up to 30 lots from the current auction that the user is watching and has not bid on, leaving out pinned and hidden lots. The same 30 stay in place when the auction reloads. The refresh control on that section picks a new 30.

A failed read names the problem and does not look like a zero total.

## Architecture

The main process reads Alt's current auction, the user's bids and watched lots, and watch state with the stored session. Parsing and the board live in `src/shared` so tests can run them without Electron. The renderer talks to the main process through the preload bridge. Opening a lot reuses the signed-in Chrome helper, with a separate Chrome profile from Fanatics.

## Steps

1. Parse Alt bids and build the overview, sections, and watched sample.
2. Read Alt with the stored session, and watch or unwatch a lot.
3. Add the sidebar tab, overview, and bid list.
4. Cover the board with unit tests and the signed-out tab with the Electron smoke check.

## Acceptance criteria

- The sidebar opens Alt Auctions beside the existing tabs.
- With no Alt session, the tab asks the user to sign in.
- The overview shows winning and outbid counts and the winning bid totals with the buyer's premium.
- Rows show the item, both bids with the premium, market price, profit, and a Winning or Outbid tag.
- A heart watches or unwatches that lot on Alt.
- Pinned, Winning, Losing, Watching, and Hidden sections sort by max bid.
- Watching shows up to 30 unbid watched lots and its refresh control picks a new 30.
- A row opens the lot on Alt in Google Chrome, already signed in.

## Verification

Unit tests for premium, parsing, sections, sorting, and the watched sample. The Electron smoke check opens the tab and expects the sign-in prompt. A live auction needs the user's Alt account.

## Status

- [x] Shared auction board
- [x] Read Alt and toggle watch with the stored session
- [x] Sidebar tab, overview, and bid list
- [x] Unit tests and signed-out smoke check
