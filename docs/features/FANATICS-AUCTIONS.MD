# Fanatics Auctions

## Purpose
As a Pokemon card vendor, the user makes a sizable amount of their profit, flipping cards online. One such platform where this occurs is Fanatics Collect, a platform that provides a buy-it-now marketplace for graded cards and also holds weekly auctions where graded cards can be purchased. Due to the time-sensitive nature of these weekly auctions, the user needs to have quick access to information regarding the status of their bids.

## Auction Context
Fanatics holds their weekly auctions every Sunday at 7PM PST. Up until this time, bidders can freely input their bids. At 7PM, extended bidding begins, which is a 30-minute window where bidders can submit last minute bids. If a bid has been submitted in this extended window, an extra 5-minute bidding window is appended. 5-minute windows are appended until the current window receives no bids. Extensions are on a lot-by-lot basis, so bidding on some cards ends before others.

## Goal
The dashboard should provide a tool that helps the user keep track of their bids and display key data points, as a bidding cycle might include bids on hundreds of cards simultaneously. For now, we will achieve this through a read-only consumption of the Fanatics Collect site.

## Core Requirements
### Login
If there is no existing Fanatics Collect session, the tab should prompt the user to sign in. The app will save the session token, so it can continue observing the user's Fanatics account.

### Data Overview
The user should be able to view overall data for the current auction cycle at a glance. Important stats are:
1. Number of auctions with a "Winning" status
2. Number of auctions with an "Outbid" status
3. Total value of current bids for winning lots INCLUDING buyer's premium
4. Total value of max bids for winning lots INCLUDING buyer's premium
For context, on Fanatics, the amount one pays on a winning auction is not strictly the bid price. A 20% buyer's premium is added on top of the bid price, so this is the value we care about when reporting data in the tab. As a result, data points #3 and #4 are totals of the bids INCLUDING buyer premiums.

Another important note regarding data points #3 and #4. Since auctions for certain cards can end at different times, we also want to include auctions that are "Ended" and have been won on the current auction date. This will allow us to see our total capital expenditure by adding the cards the user has already won and the cards that they can potentially win. Won lots are read for the current auction specifically. The site's won filter misses lots that just closed, so those wins are read by choosing that auction. The ended bids view shows the sale price with the buyer's premium included, which is the winning bid plus 20%.

Fanatics Collect has an existing "Bids" tab on their site, where the majority of the data for our app can be derived and aggregated.

## Bidding List
We want a condensed view of all the active bids for the current auction cycle. Each item row will include the following information:
1. Item name
2. Current bid INCLUDING buyer's premium
3. User's max bid INCLUDING buyer's premium
Each row will be clickable. Clicking a row opens that listing in Google Chrome using the saved Fanatics session, so the lot can be bid on immediately. Each row will also have an input, where the user can input the item's market price. If there is a market price inputted, we will show the profit potential, which is the market price minus the maximum of: the user's max bid and current bid, and also the percentage of the maximum of the max bid and the current bid over the market price. Each row shows a green Winning tag or an orange Outbid tag. Once extended bidding has started, each row also shows whether that lot was extended to the next window or still needs a bid to extend. The item name uses two lines.

The bidding list will be composed of 4 sections:
1. Pinned: users will be able to pin item rows to the top of the bidding list, regardless of the winning/losing status. This is so certain, important items do not get lost across the hundreds of bids
2. Winning: active bids with a winning status
3. Losing: active bids with an outbid status
4. Won: auctions won in this current auction cycle 
5. Hidden: users will be able to mark item rows as hidden. They will still show up at the bottom of the bidding list. This section is meant for winning auctions that the user no longer cares to monitor or losing auctions in which the current bid price already exceeds the user's potential max bid.

Within each of these sections, item rows should be sorted by max bid, from highest to lowest. 

## Notes
We aim for the tool to be able to load within one minute, as once we near extended bidding, the data should be able to refresh every minute.