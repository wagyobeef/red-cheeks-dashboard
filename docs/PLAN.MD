# Fanatics Auctions implementation plan

Approved plan for the Fanatics Auctions tab, as specified in `docs/features/FANATICS-AUCTIONS.MD`.

## Behavior

The sidebar lists Home and Fanatics Auctions. Home is unchanged.

Fanatics Auctions reads the signed-in account's active weekly-auction bids. There is no password field. Sign-in opens a Fanatics Collect window. After Fanatics sets a session, the main process stores the refresh token with Electron `safeStorage` and keeps the site cookies in a separate persistent session. The dashboard window only learns that the account is signed in. Sign-out clears that session and the stored token. Pin, hide, and market-price notes stay on this Mac.

The overview counts winning and outbid lots for the current weekly auction, the one that ends soonest and still has an open bid. Winning current-bid and max-bid totals include the 20% buyer's premium, and they also include lots from that same auction that have already been won. Those won lots are loaded by choosing that auction. The site's won filter only returns older auctions, so the recent wins are the closed winning lots on the auction itself. Hidden and pinned lots stay in those totals.

The bid list has five sections, omitting any section with no rows: Pinned, Winning, Losing, Won, and Hidden. Within a section, rows are sorted by max bid including the premium, highest first. A row shows the item name on two lines, the current bid, and the max bid, each including the premium, plus a green Winning tag or an orange Outbid tag. During extended bidding, a row also shows whether the lot is extended to the next window or still needs a bid. Clicking a row opens that lot in Google Chrome with the saved Fanatics session so it can be bid on. A market-price field shows the profit potential, market price minus the higher of the current bid and the max bid, and that amount as a percentage of the market price. Pin keeps a lot in Pinned regardless of status. Hide keeps a lot that has not been won in Hidden, and a hidden won lot stays in Won. Pinning and hiding replace each other.

A missing session asks the user to sign in. A signed-in auction with no active bids stays up through the end of that auction's Pacific day so the won lots remain, and after that midnight it is an empty state. A failed read names the problem and does not look like a zero total.

## Architecture

The main process owns the Fanatics window, the session partition, token refresh, and the read-only bids request. The renderer talks to it through the preload bridge. Aggregation and formatting live in `src/shared` so tests can run them without Electron.

The bids request is the same active-auction query the Fanatics Collect bids page uses, limited to open weekly listings. Amounts are converted from cents and then increased by 20%.

## Steps

1. Add shared parsing, premium math, current-auction selection, and the bid board.
2. Store the refresh token with `safeStorage` and sign in through a Fanatics window.
3. Read active weekly bids and build the overview and list.
4. Add the sidebar tab, cards, pin, hide, and market price.
5. Cover the board math with unit tests and the signed-out tab with the Electron smoke check.

## Acceptance criteria

- The sidebar opens Fanatics Auctions beside Home.
- With no Fanatics session, the tab asks the user to sign in on Fanatics Collect's page.
- A successful sign-in stores the session token on this Mac and does not put the password in the app.
- The overview shows winning count, outbid count, and the winning current-bid and max-bid totals with the 20% buyer's premium.
- The list groups pinned, winning, losing, won, and hidden lots, sorted by max bid within each section.
- A row opens its Fanatics listing in Google Chrome, already signed in. A market price shows the profit potential and the percentage of the higher of the current bid and the max bid over the market price.
- Sign-out removes the session and closes that Chrome window. Notes for pin, hide, and market price remain on this Mac.

## Verification

Unit tests for premium, parsing, auction selection, sections, and market comparison. The Electron smoke check opens the tab and expects the sign-in prompt. A live bid list needs the user's Fanatics Collect account.

## Status

- [x] Shared bid board
- [x] Fanatics sign-in window and stored session token
- [x] Read active weekly bids
- [x] Sidebar tab, overview, and bidding list
- [x] Unit tests and signed-out smoke check
