# Alt Auctions

## Purpose
As a Pokemon card vendor, the user makes a sizable amount of their profit, flipping cards online. One such platform where this occurs is Alt, a platform that provides a buy-it-now marketplace for graded cards, holds weekly auctions, and provides data on price history. 

## Auction Context
Alt holds their weekly auctions every Thursday at 6pm PST. The site has a unique approach to extended bidding. Unlike other auction sites, where extensions are on a lot-by-lot basis, Alt has a short extended-bidding timer that resets every time ANY of the lots in the weekly lineup receive a bid. As a result, extended bidding can last a while, often near midnight.

## Goal
Because extended bidding for Alt auctions lasts for a while, the aim is less of maximizing time efficiency but more of best organizing lots and prioritizing them. We will achieve this mostly through a read-only consumption of the site. The ONLY exception for now is letting the app unwatch auctions, so I don't have to go into the Alt site itself to do so.

## Core Requirements
### Login
If there is no existing Alt session (alt.xyz), the tab should prompt the user to sign in. The app will save the session token, so it can continue observing the user's Alt account.

### Data Overview
The user should be able to view overall data for the current auction cycle at a glance. Important stats are:
1. Number of auctions with a "Winning" status
2. Number of auctions with a "Outbid" status
3. Total value of current bids for winning lots INCLUDING buyer's premium
4. Total value of max bids for winning lots INCLUDING buyer's premium
For context, on Alt, the amount one pays on a winning auction is not strictly the bid price. A 20% buyer's premium is added on top of the bid price, so this is the value we care about when reporting data in the tab. As a result, data points #3 and #4 are totals of the bids INCLUDING buyer premiums.

Alt has an existing current bids page on their site, where you can view the lots that you are watching and also any lots that you have bid on, regardless of winning/outbid status.

## Bidding List
We want a condensed view of all the active bids for the current auction cycle. Each item row will include the following information:
1. Item name
2. Current bid INCLUDING buyer's premium
3. User's max bid INCLUDING buyer's premium
4. Watching status: represented by a filled or unfilled heart icon, which is determined by whether the lot is actually being watched on the Alt site. The status should be togglable and actually update the Alt site. This is the only non-read interaction with the Alt site currently.
Each row will be clickable. Clicking a row opens that listing in Google Chrome using the saved Alt session, so the lot can be bid on immediately. Each row will also have an input, where the user can input the item's market price. If there is a market price inputted, we will show the profit potential, which is the market price minus the maximum of: the user's max bid and current bid, and also the percentage of the maximum of the max bid and the current bid over the market price. Each row shows a green Winning tag or an orange Outbid tag. The item name uses two lines.

The bidding list will be composed of 5 sections:
1. Pinned: users will be able to pin item rows to the top of the bidding list, regardless of the winning/losing status. This is so certain, important items do not get lost across the hundreds of bids
2. Winning: current bids with a winning status
3. Losing: current bids with an outbid status
4. Watching: a list of up to 30 randomly selected lots from the current auction cycle that have a watching status, not including lots with a bid from the user. At the top of the section, there will be a refresh button, which refreshes the randomly selected list of lots
5. Hidden: users will be able to mark item rows as hidden. They will still show up at the bottom of the bidding list. This section is meant for winning auctions that the user no longer cares to monitor or losing auctions in which the current bid price already exceeds the user's potential max bid.

Within each of these sections, item rows should be sorted by max bid, from highest to lowest
