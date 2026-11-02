# Alt Selling

## Purpose

Alt is an online marketplace for graded cards. We will add a tab to the app to keep track of the cards the user has in the Alt vault and their selling status.

## Login

Similar to the Alt Auctions tab, the page will prompt the user to log into Alt and save the session token if none exists. If a session token exists from the Alt Auctions tab, it can also be used in the Alt Selling tab and vice versa.

## Sections

Data that will be displayed in this tab can primarily be found in the My Collection tab of the Alt site.

### Overall Data

In this section, we display important summary data, including:

- Total Value: sum of purchase price of all cards in the user's Alt vault
- Number of Cards: number of cards in the Alt vault
- Total Pending Sales: sum of the value of cards that are processing payment. This information can be found in the Alt Sold tab

### Listed Cards

Cards that are currently listed on the Fanatics Marketplace. For each card, we want to display the following information:

- Item name
- Purchase price
- Listing price
- Projected Payout (91% of Listing Price)
- Margin: difference between listing price and projected payout
- Last Comp
- Favorites: number of favorites the listing has
- Days listed
- Days owned
  At the top of the section, we display the number of cards listed.

### Pending sales

Cards that are processing payment in the Alt Sold tab. For each card, we want to display the following information:

- Item name
- Purchase price
- Sale price (under Total Payout)
- Profit
- Sale date (under Sold Date)
- Days from acquisition to sale

### Unlisted Cards

Cards that are in the Alt vault but don't fit into any of the above categories. For each card, we want to display the following information:

- Item name
- Purchase price of card
- Days since acquisition
  At the top of the section, we display the number of unlisted cards.

For each of the rows in the above sections, the items should be clickable and take the user to the card's Alt page.
