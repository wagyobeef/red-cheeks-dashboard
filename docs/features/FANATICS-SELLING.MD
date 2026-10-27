# Fanatics Selling

## Purpose
Fanatics Collect is an online marketplace for graded cards. We will add a tab to the app to keep track of the cards the user has in the Fanatics vault and their selling status.

## Login
Similar to the Fanatics Auctions tab, the page will prompt the user to log in to Fanatics and save the session token if none exists. If a session token exists from the Fanatics Auctions tab, it can also be used in the Fanatics Selling tab and vice versa.

## Sections
Data that will be displayed in this tab can primarily be found in the Collection tab of the Fanatics site. The Collection tab has the following information:
- Item: name of the graded card
- Certification ID: ID that identifies the graded card, found under the item name
- Vault Status: whether the card is in the owner's possession, is in the process of being bought by another user, or is in the process of being shipped elsewhere
- Marketplace Status: whether the card is listed on the Fanatics marketplace, including listing date and price
- Origin: where and when the card was acquired into the Fanatics vault

### Overall Data
In this section, we display important summary data, including:
- Total Value: sum of purchase price of all cards in the user's Fanatics vault
- Number of Cards: number of cards in the Fanatics vault
- Total Pending Sales: sum of the value of cards that are pending payment. This data can be found in the "Sold" tab of the "Selling" tab in Fanatics. Pending cards will either have a "Waiting for buyer's payment" or "Payout in progress" status

### Listed Cards
Cards that are currently listed on the Fanatics Marketplace. For each card, we want to display the following information:
- Item name
- Certification ID
- Purchase price
- Listing price
- Margin: difference between listing price and purchase price
- Favorites: number of favorites the listing has
- Days since listing
- Days since acquisition
At the top of the section, we display the number of cards listed.

### Pending sales
Cards that are pending payment in the Fanatics Selling tab. For each card, we want to display the following information:
- Item name
- Certification ID (needs to cross-reference Collection data)
- Purchase price (needs to cross-reference Collection Data)
- Sale price
- Profit
- Sale date
- Days from acquisition to sale (needs to cross-reference Collection data)
- Payment status: "In progress" or "Waiting for buyer"
At the top of the section, we display the number of cards pending sale, total value of cards pending sale and the total profit.

### Pending shipment
Cards that are pending shipment and have the status "Retrieval in progress". For each card, we want to display the following information: 
- Item name
At the top of the section, we display the number of cards being shipped.

### Unlisted Cards
Cards that are in the Fanatics vault but don't fit into any of the above categories. For each card, we want to display the following information:
- Item name
- Purchase price of card
- Days since acquisition
At the top of the section, we display the number of unlisted cards.

For each of the rows in the above sections, the items should be clickable and take the user to the card's Fanatics page.
