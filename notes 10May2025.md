# Status

Reviewed 2026-05-14. All requests below have been folded into specs and the
implementation plan as **Phase 32**. Mapping:

- Dividends → SPEC-020 §"Auto-fill shareCount" + SPEC-020 §"Cash-landing
  verification" (item 365 / 365a) + SPEC-021 §"Single-line dividend list"
  (item 366)
- Transactions edit/delete gap → Phase 32i discoverability audit (item 386)
- Manual tickers → SPEC-029 §"Manual stocks" (items 370 / 370a-d)
- Fullscreen Positions / sell modal hidden → SPEC-018 (item 369)
- Sell modal per-lot upper bound → SPEC-019 (item 367)
- Sell modal two-way binding lots ↔ total → SPEC-019 (item 368)
- Buy-sell planning screen → NEW SPEC-034; build via Phase 32 sub-phases
  32f (trading-fee setup), 32g (scaffold), 32h (calculations + execute)

# Dividends
- dividends payments not considered for calculations, payout not recorded - no impact on cash balance. If dividend is not set manually, it is not seen among transactions
- For received dividend payments consider the number of stocks which were owned by the user one day before the ex-dividend day
- In the Stock page in the Dividends table move all the data for each record to one row with adding short column names. Add tootips to the column names as the short column names may not be correcly understood.

# Transactions
- No possibility to edit or delete records / transactions or accounts
- Option to work with manual tickers - Buy, sell, transfer, set dividends etc. as stocks which have a ticker which could be found via the APIs
- When in full screen of the Positions table in the Investment overview page, when clicked for example sell, the sell window isn't visible, because it is hidden by the full screen table
- In the sell stock modal, the user must not enter more shares to sell in a lot than the the number of the lot
- If user selects number of shares to sell via the lots, the total number of stocks to sell shall be automatically updated

# Buy-sell screean
- I want to have a way to plan my buys and sells. I want to be able to see how my much would one or multiple buys cost and how it would impact cash balance.
- I want to be able to select certain stocks to buy. Their actual price shall be visible, too. I shall be able to set a fee. For user-friendliness I shall be able to set for each stock market a fee with the currency. Ishall be able to set also a fee at stock level. The stock level is above the exchange setup. I shall be able to manually override the fee in the buy-sell planning solution. Fee setup shall including minimum fee. Fee percentage above this minimum.
- I want to be able to add and remove stocks to this solution
- I want to be able to check and un-check specific stock to consider for the calculation although I do not remove them, just to see the calculation impact
- I want to see the calculation at stock level in the trading currency and may choose to see it also in main currency. It shall be optional to add this column to the table
- I want to see overall calculations in currencies I check
- I want to have the screen divided to sell transactions and buy transactions. The sell shall be above the buy.
- The sell row shall include these columns and they bbe selectable whether I want to see them:
  - Number of shares to sell (this must be visible always) - to be edited by user
  - Number of available shares to sell (this must be visible always)
    - indicate how many out of these are held more than 365 days (long-term hold)
    - add a tooltip to make this better explained what the data means
  - ticker
  - Company name
  - Stock exchange
  - Currency
  - Currency rate between trade currency and main currency
  - the price
  - adjusted price - I shall be able to set either
    - my manual price
    - rule to rounddown to set number of decimal place
    - rule to rounddup to set number of decimal place
    - the last price
  - fee amount and fee % of the potential trade
    - these shall be two separate columns
  - last actual dividend % - calculated based on the last declared regular dividend
  - last actual dividend amount per month gross
  - last actual dividend amount per month net
  - last year dividend % -calculated based on the payments for last 12 months
  - last year dividend amount per month gross
  - last year dividend amount per month net
- The buy rows shall include these columns and they bbe selectable whether I want to see them:
  - Number of shares to buy (this must be visible always) - to be edited by user
  - ticker
  - Company name
  - Stock exchange
  - Currency
  - Currency rate between trade currency and main currency
  - the price
  - adjusted price - I shall be able to set either
    - my manual price
    - rule to roundup to set number of decimal place
    - rule to rounddown to set number of decimal place
    - the last price
  - fee amount and fee % of the potential trade
    - these shall be two separate columns
  - last actual dividend % - calculated based on the last declared regular dividend
  - last actual dividend amount per month gross
  - last actual dividend amount per month net
  - last year dividend % -calculated based on the payments for last 12 months
  - last year dividend amount per month gross
  - last year dividend amount per month net
  - Buy price including fee
  - Trade value without fee
  - Trade value with fee
- In the overview which shall be above the sell table shall be this information visible:
  - cash balances
    - option to add to cash balances (just for planning purposes to determine how much shall the user add for the specific scenario)
  - Cash impact
    - Sum of buys deducted from sum of cash balances and sells with considering fees
    - consider currency exchanges as the cash balance for a specific currency may not be sufficient
    - within the calculation logic always deduct first from the cash balance which is the same as the specific stock trade currency
    - if the trading currency cash balance is not sufficient, the second shall be the main currency cash balance, afterwards with other cash balances
    - Include somewhere in a user friendly manner currency exchange rates among currencies the user sets. Aser may set from all combinations of the currencies which have cash balance or have set stocks trading in these specific currencies
    - Show the resulting sum in currencies which are subject of the trades or the user selects
    - Show the the weighted average dividend % and dividend amount per month for the sell stocks
    - Show the the weighted average dividend % and dividend amount per month for the buy stocks
    - Show the difference betwee the dividend % and dividend amount per month