# Alt Selling implementation plan

Approved plan for the Alt Selling tab, as specified in `docs/features/ALT-SELLING.MD`.

## Behavior

The sidebar lists Alt Selling next to Alt Auctions. The tab uses the saved Alt session. A missing session asks the user to sign in on Alt's page. Sign-in and sign-out are shared with Alt Auctions.

The overview shows Total value (sum of cost basis for cards still in the Alt vault), Cards, and Total pending sales (payouts still processing). Unvaulted cards and completed sales are left out of the vault totals.

Sections, in order, are Listed cards, Pending sales, and Unlisted cards. Empty sections are omitted. There is no pending-shipment section.

Listed rows show item, purchase price, listing price, projected payout (91% of list), margin against that payout, last comp, favorites, and days owned. Pending rows show item, purchase price, total payout, profit, sold date, and days to sale. Unlisted rows show item, purchase price, and days owned. A row opens that card or listing on Alt in Chrome with the saved session.

## Architecture

The main process reads Alt `myCards` with the stored session and listing watch counts for favorites. Parsing and the board live in `src/shared`. The renderer follows the Fanatics Selling cards and tables.

## Steps

1. Parse Alt collection cards and build the vault overview and sections.
2. Read Alt with the stored session.
3. Add the sidebar tab, overview, and selling lists.
4. Cover the board with unit tests and the signed-out tab with the Electron smoke check.

## Acceptance criteria

- The sidebar opens Alt Selling beside Alt Auctions.
- With no Alt session, the tab asks the user to sign in.
- The overview shows vault purchase-price total and card count.
- Listed, pending, and unlisted sections match the Alt spec columns.
- A row opens the card on Alt in Google Chrome, already signed in.

## Verification

Unit tests for parsing, vault grouping, and totals. The Electron smoke check opens the tab and expects the sign-in prompt. A live vault needs the user's Alt account.

## Status

- [x] Shared selling board
- [x] Read Alt collection with the stored session
- [x] Sidebar tab, overview, and lists
- [x] Unit tests and signed-out smoke check
