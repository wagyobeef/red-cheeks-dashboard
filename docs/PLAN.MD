# Fanatics Selling implementation plan

Approved plan for the Fanatics Selling tab, as specified in `docs/features/FANATICS-SELLING.MD`.

## Behavior

The sidebar lists Home, Fanatics Auctions, and Fanatics Selling. Home and Fanatics Auctions stay as they are.

Fanatics Selling uses the same Fanatics Collect session as Fanatics Auctions. A missing session asks the user to sign in on Fanatics Collect's page. Signing in or out on either tab updates the shared session. The password is not stored in the app.

The overview shows the purchase-price total of every card in the vault, the number of those cards, and the total sale value of cards that are still waiting on payment. Purchase price comes from the Collection tab. A card with no purchase price still counts, and its price is left out of the total.

Listed cards are vault cards with an active Fanatics listing, other than cards already in pending sales or pending shipment. Each row shows the item name, certification number, purchase price, listing price, margin, favorites, days since listing, and days since the card was curated into the vault. Margin is listing price minus purchase price. Favorites is the listing's favorite count, and zero is shown as zero. The section states how many cards are listed.

Pending sales come from the Sold tab of Fanatics Selling. A sale is pending when the invoice is not paid in full, shown as "Waiting for buyer", or the invoice is paid and the payout is not released, shown as "In progress". A paid invoice whose payout status is payment released is "Payout complete" and is left out, along with canceled, failed, and refunded sales. Each row shows the item name, certification number, purchase price, sale price, profit, sale date, and days from vault acquisition to sale. Certification number, purchase price, and acquisition date are taken from the matching collection card, by listing id or by a unique item name. The section states the count, the sale total, and the profit total. Profit is sale price minus purchase price. An accepted offer is the sale price when one is present.

Pending shipment is vault cards whose collection custody status is retrieval in progress. Each row shows the item name, and the section states how many cards are being shipped. The section is omitted when no card is being shipped.

Unlisted cards are vault cards that are not listed, not a pending sale, and not being shipped. Each row shows the item name, purchase price, and days since acquisition. The section states how many cards are unlisted.

A row opens that card on Fanatics Collect in Google Chrome with the saved session. Listed and pending marketplace cards open the listing. Weekly and premier lots open their auction pages. A card without a listing opens its collection page.

Days are calendar days in Pacific time. A date without a time is that calendar day. A failed read names the problem and does not look like a zero total.

## Architecture

The main process reads the collection and the seller's sold orders with the stored Fanatics session. Parsing and the board live in `src/shared` so tests can run them without Electron. The renderer talks to the main process through the preload bridge.

## Steps

1. Parse collection cards and sold orders, then build the overview and three sections.
2. Read those Fanatics queries with the shared session.
3. Add the sidebar tab, overview, and the three lists.
4. Cover the board with unit tests and the signed-out tab with the Electron smoke check.

## Acceptance criteria

- The sidebar opens Fanatics Selling beside Home and Fanatics Auctions.
- With no Fanatics session, the tab asks the user to sign in. A session from Fanatics Auctions is reused, and signing out of either tab clears it.
- The overview shows total purchase value, card count, and the pending sale total.
- Listed cards show certification number, purchase price, listing price, margin, favorites, days listed, and days since acquisition, with a count.
- Pending sales show certification number, purchase price, sale price, profit, sale date, days to sale, and either "Waiting for buyer" or "In progress", with count, sale total, and profit.
- Pending shipment lists retrievals and shows how many cards are being shipped.
- Unlisted cards show purchase price and days since acquisition, with a count.
- A row opens the card on Fanatics Collect in Google Chrome, already signed in.

## Verification

Unit tests for payment status, sale price, collection parsing, cross-reference, sections, and day counts. The Electron smoke check opens the tab and expects the sign-in prompt. A live vault needs the user's Fanatics Collect account.

## Status

- [x] Shared selling board
- [x] Read collection and sold orders with the shared session
- [x] Sidebar tab, overview, and the three lists
- [x] Unit tests and signed-out smoke check
