# Product

## Overview

Red Cheeks Dashboard is an internal business dashboard for managing the day-to-day operations of Red Cheeks TCG, which is a business centered around the reselling of cards and graded slabs of the Pokemon TCG.

The dashboard consolidates tools and business information that would otherwise be spread across seperate applications, spreadsheets, and marketplaces.

---

## Goals

- Display relevant business data from personal spreadsheets and consolidate market data from different platforms and marketplaces
- Assist with the automation of purchasing through tools that help schedule auction bids on sites like eBay
- By consolidating market data, it will assist with overall day-to-day buying and selling decisions, while also helping during time-sensitive auction environments
- Automated tools will narrow down opportunities that require human judgement and allow for the scheduling of business actions, which will allow for work to be done during concentrated sessions instead of constant monitoring of platforms

---

## Users

### Primary User

The application is currently designed for a single business owner

Multi-user functionality is not currently required

---

## Platform

- Desktop Electron application, as the dashboard will be used solely from personal devices but may be downloaded on multiple devices

---

## Core Product Structure

The application consists of a persistent dashboard with separate tools accessible through the main navigation

### Home

- The Home tab serves as an overview of personal business data that is kept up to date on Google Sheets

### Fanatics Auctions

- The Fanatics Auctions tab shows the current Fanatics Collect weekly auction: winning and outbid counts, bid totals with the buyer's premium, and each active bid
- The Fanatics Selling tab shows the cards in the Fanatics vault: purchase-price total, listed cards, sales waiting on payment, cards being shipped back, and unlisted cards
- Sign-in happens on Fanatics Collect's own page. The session token stays on this Mac and is shared by Auctions and Selling. It is used to read the account and to open a card in Chrome already signed in

### Alt Auctions

- The Alt Auctions tab shows the current Alt weekly auction: winning and outbid counts, bid totals with the buyer's premium, and each active bid
- Watched lots that have no bid appear in a Watching section of up to 30 lots. A heart on each row watches or unwatches that lot on Alt
- Sign-in happens on Alt's own page. The session token stays on this Mac and is used to read the account and to open a lot in Chrome already signed in