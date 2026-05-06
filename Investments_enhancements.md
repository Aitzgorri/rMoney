1. Add the info to dividend whether it is regular or special. Check if this info is available in APIs. If yes get it. Enable the user to edit the information.
2. Add the info on the dividend payout frequency. Check if this info is available in APIs. If yes get it. Enable the user to edit the information. Add the frequency info to other dividend info.
3. Stock page
	1. Enable switching displaying data between default currency and trading currency
	2. Enable stock transactions entries also from stock page
	3. If same stock in multiple accounts add also a total row with total number of shares, average price and total value
	4. The TTM seems not to be correctly calculated. It shall sum all dividends payed in the past 12 months and calculate the yield considering the last stock price - Sum of dividends / stock price. Dividends and stock price must be in same currency calculated.
	5. Forward yield shall be calculated based on the last regular dividend extrapolated to whole year. Example: Dividend is payed quarterly and last regular dividend was 0.5 USD. The actual stock price is 100 USD. Forward yield will be (0.5 * 4) /100 = 2%. Dividends and stock price must be in same currency calculated.
	6. Dividend return shall show all (all net dividends received after tax) and last 12 months (net dividends received in the last 12 months after tax)
	7. Price appreciation shall be calculated weighted. Now it seems it does calculate correctly. I checked the stock NNN. Check the calculation
	8. The p.a. return does not seem to be correct. I compare it to XIRR calculation in Microsoft Excel. The price appreciation and net dividends shall be considered. check the calculation
	9. Add 1 day to price chart. Add this only if the APIs provide day price history.
	10. Check if dividend declarations for future dividend payouts are available via APIs. Once all the dividend info is declared - ex-div date, payout date, amount, currency, amount - API dividend info retrieval request is not needed anymore. Enable manual request for the user to trigger such API request. Enable manual editing of dividends.
	11. Past payouts table shall be vertically scrollable with lazy loading in year chunks. The height of the window shall enable to see 15 dividends. Extend to this height only if there are 15 dividend payouts
	12. In the portfolios table add also the current % share in the specific portfolio
	13. The transactions table shall be vertically scrollable with max height for 15 records
4. Dividend page
	1. Add Dividend page with multiple tabs
	2. Calendar tab
		1. This page shall include a dividend calendar which shall display ex-dividend and payout dates. Enable switching to see both or only one of them. Default is to see payout dates only. These two dates shall be differently color coded. This calendar shall have two view options - month calendar with a cell for every day in the specific month (default is the actual month) and a table view with next three months dividends records in a vertically scrollable window. App shall remember which was last displayed and show it next time.
			1. Month view - user may move from one month to another
			2. Table view - When user scrolls to future dates the calendar table displays further data with retrieving monthly chunks
		2. Declared and estimated dates shall be differently color coded
	3. Metrics tab
		1. Dividend payout chart
			1. X axis - time (selectable week or month or quarter or year)
			2. Y axis - dividend amount (selectable gross or net)
			3. User may add multiple Dividend payout charts and store them with custom name and filters
			4. The chart may be filtered based on company, portfolio, country, region, continent, years (default last 2 years and actual year)
			5. Dividend payout charts may have multiple data sets on y-axis. Example for each portfolio
			6. User may switch between bar and line chart
			7. Future years are available (both declared and estimated dividends to be considered)
		2. Tables with dividend metrics grouped by company, portfolio, country, region, continent
			1. User may select which metrics to display: 
				1. TTM yield 
				2. Future yield 
				3. Last 12 months dividend amount
				4. Next 12 months dividend amount (sum of both declared and estimated dividends)
				5. CAGR for 3 years (show NA if data can't be calculated) - consider user dividend history
				6. CAGR for 5 years (show NA if data can't be calculated) - consider user dividend history
				7. CAGR for 10 years (show NA if data can't be calculated) - consider user dividend history
5. Add the option to include a stock without creating a transaction (Buy)
6. Create a page with all stocks included into the app. In future also other investments. Included means all the necessary data like currency and stock exchange is defined
7. Enable editing of included stocks
8. Enable removing stocks from included stocks.
9. When a stock is already included in the app then when a new transaction is being entered, do not show all the options for the stock, but show the defined mapping and add a button to re-look up the stock.
10. Enable editing of stock transactions
11. Calculate the average stock price with fee inclusion
12. Investment overview
	1. Cash movements:
		1. Add multiselect filter to show transactions - buys, sells, transactions, dividends etc.
		2. Add filter for portfolios
		3. Add filter stocks (in the filter dropdown show ticker and name)
		4. Add trading currency filter
		5. Make the cash movements vertically scrollable with max 30 transactions displayed in max height
		6. Do not retrieve all cash movements at once. Retrieve them in chunks of 50 if the user will continue to scroll down
		7. Add a shortcut to expand the cash movements to full screen
		8. The data after the transaction type info is barely readable. Increase the readability - consider increasing the font, adjust color difference between font color and background color
	2. The portfolio shortcut below the accounts is not needed anymore
13. Positions
	1. User shall be able to select what to display in the position row: ticker, name, price, currency, stock-exchange, number of shares, price per share, average price, market value in trading currency, market value in default currency, share in whole portfolio in %, change since last closing in amount and in %
	2. Make it vertically scrollable with up to 20 positions to display in the max height
	3. Make a shortcut to expand the positions to full screen
	4. Enable choosing order based on the displayed columns
14. Reports
	1. Add pie charts to a separate tab after the tab "By Portfolio"
	2. Enable user to add pie charts which shall have filters. The filters shall be saved so the user does not have to set them again. User can add name to each pie chart which will be visible above it.
		1. Filters shall include currencies, portfolios, countries, regions, continents
	3. In case of portfolio, only one portfolio may be selected as one stock may be in multiple portfolios, therefore a pie chart won't make sense
	4. The user may select whether individual stocks summed amounts by currency, by country, by region, by continent, by portfolio. The currency in which the summed amounts shall be displayed may be set by user, but the default is the default currency 
	5. In the Desktop user may select how many charts shall be in one horizontal row. Max 1, 2, 3 or 4.
	6. User may select below which percentage the displayed items shall fall into "Other" group. Default is 1%
	7. User may select to display below the chart appropriate data table.
	8. Each pie chart may be expanded to full screen
	9. Portfolio tab
		1. pie chart and portfolio share in table shall not be included, because one stock can be in multiple portfolios and therefore the share in whole portfolio can't be correctly calculated
		2. If all portfolios are displayed then show only value of the portfolio, total return, actual dividend yield, yearly and average monthly dividend amount
	10. Table tab
		1. Add filters for portfolio, currency, country, region, continent
		2. If any filters are set, do not show records which are not in scope of the filter. Example, if specific portfolio is selected, do not show stocks which are not in the portfolio
		3. Add column option - Market value in trading currency
		4. Enable ordering based on visible columns