App name: rMoney

# MAIN GOAL
## Shall be used to track personal finance and investments in user friendly way

# USER FUNCTIONALITIES CONSIDERATIONS
## User shall be able to store income and expenses
## User shall be able to track each income or expense record at the level of where the transaction occurred (cash, specific bank account etc.), income or expense category and envelope
## If the user does not assign an envelope, income is tracked under a built-in **Undistributed income** envelope and expenses under **General expenses**, so all activity remains bucketed for budgets and reports
## Envelopes may be organized hierarchically (e.g. parent envelope with sub-envelopes) so budgets and spending can be grouped at multiple levels
## Deleting a parent envelope shall remove its sub-envelopes; the user shall be shown exactly which envelopes will be deleted and must confirm before the deletion proceeds
## User shall be able to create plan for income or expense category at various time period levels (e.g. month, year etc.) and also plan for envelopes at various time period levels
## User shall be able to plan average income or expenses for specific time periods or specific income or expense estimations for specific time periods with a planning tool. For example in July specific expense amount for vacation
### User shall have a tool to plan distribution of income among envelopes.
### User can set multiple regular monthly incomes and plan distribution among envelopes.
### User shall be able, based on this planning, to create scheduled regular transfers between envelopes (by default from undistributed income envelope).
### User can plan scheduled incomes. These scheduled incomes shall be planned to specific account. Account is not required when planning distribution among envelopes.
### User may set also a 1 time income
### User may set 1 time envelope transfer
### This planning tool shall show existing scheduled transfers
### User shall be able to create nested expenses and for each leaf to be able to specify regular expense. These expenses shall be linked to envelopes and each leaf expense may be linked to only one envelope.
### Parent expenses can't be linked to envelopes
### Parent envelopes shall display the sum of all children expenses
### User shall see the difference in the sum of planned income and planned expense by default at monthly level and be visually notified if the planned expenses are higher than planned income
### User shall always see the sum of planned income, sum of planned expenses and difference also when scrolling the list. User can select for what time period it shall be displayed. Default is monthly
### User shall be able to see a list of planned expenses with these information - nested indented expenses, envelope, yearly, quarterly, monthly expense amounts. User may select the amount of one of these frequencies and the remaining frequencies will be automatically calculated
### When a leaf expense becomes a parent, the planned expenses for this leaf expense is deleted and also related scheduled transfers. User must be made aware about these deletions and must confirm it.
### When an expense is adjusted, both up or down, and the user confirms update of the related transfer, the user may select whether it is a change only for the next transfer or for the whole series.
### This planning tool shall be accessible as a separate page

## Each income or expense record shall also track payee
## The app shall be user-friendly and visually appealing
# USER FRIENDLINESS
## user to install everything with one file, both on mobile and computer

# PHASE 2 ENHANCEMENTS

## User Interface
- On a computer, user shall be able to see & use the full screen, not just the "screen column" width of a mobile

## Data storage
- User shall be able to save to a file the data and be able to load the file with the data anytime later
- This possibility shall be used by the user to be able to track various financial setups. For example someone elses accounts, transactions, envelopes etc.
- Saving and loading of the data shall be possible from the "More" option

## Investments tracking
- User shall be able to track investments
- Investments can be stocks, options, bonds, crypto, precious metals storage, precious metals lease

###  Investing accounts
- User may have multiple investing accounts
- Investing accounts are accounts the user has in a bank, broker or other entity which enbles trading investments and storing them
- To each investing account the user shall be able to define a csv import for each investing account by selecting which columns from the csv shall be uploaded and to which app data (date, stock ticker, number of stocks, price, currency, transaction ID (optional), fee (by default 0)). This csv setup shall be used to upload transactions for that investing account
- For Interactive Brokers it shall be possible to connect directly to download the transactions automatically *(status as of 2026-05: deferred — IBKR retail accounts cannot use the cloud-based Web API OAuth flow; only institutional / advisor accounts qualify. The IBKR slot remains in the SPEC-027 provider chain as a stub. Manual CSV import (SPEC-025) is the current path for IBKR users. Will revisit when IBKR ships retail OAuth.)*
- User shall be able to define main currency. This currency is used mainly in calculation of share of investments on the investment portfoilios or category groups. The investments in other currencies than the main currency shall be re-calculated based on the latest currency exchange rate

### Stocks requirements
- User shall be able to track buy, sell, transfer to another investing account
- Each buy or sell shall track the date, stock exchange (optional), stock ticker, number of stocks, price, currency, transaction ID (optional) and fee. Fee is by default 0
- For each stock a buy, sell, split, transfer or dividend shall be considered as related transaction to that stock
- Dividend record shall track the ex-dividend date, payout date, dividend per stock(before tax), total dividend (before tax), for how many stock was the dividend received in the specific payout, tax %, tax amount, net dividend per stock, net dividend total, actual exchange rate towards the main currency and USD, EUR, GBP, CZK (although the main currency may be one of these hard-defined currencies)
- User shall be able to set dividend tax at global level, country level, each stock or each dividend payout level
- Preferably the dividend data shall be retrieved by a user defined stock API (available in "More-Settings" menu)
- When user buys multiple times a specific stock the average price shall be calculated based on weighted average
- When user has also some sells, by default the FIFO approach shall be usedm inless user does not specify which lots were sold. The user shall have the option with sell entry to select which stock lots were sold
- With each buy and sell entry also the actual exchange rates of USD, EUR, GBP, CZK towards the main currency shall be stored. This is to be able to evaluate performance in multiple currencies

#### Stock page
- User shall have a stock page, where the user shall see the latest price, graph with stock price timeline with various selectable time periods (today, 1 week, 1 month, 3 months, 6 months, 1 year, 5 years, All), user's transactions (buys, sells, transfers, dividends, splits etc.)
- In the stock page, next 4 payout dates shall be estimated based on the previous payout dates. The amount shall be also estimated. User may select the dividend amount estimations as follows:
  - the last payed out amount
  - calculation from the previous payout in the same time previous year. For example an amount estimation for a stock, which is payed out 4 times a year, for March 2026 shall be done based on March 2025
  - user sets the estimated amount
- The stock page shall show at least this information
  - Stock name
  - Stock ticker
  - Latest Stock price
  - Stock currency
  - Stock exchange. If the stock trades at different stock exchanges it shall by default show the stock exchange were the user has the highest investment. User shall be able to easily click through the stock exchanges and the data shall be updated
  - Dividend yield based on last 12 months payouts
  - Dividend yield (FWD)
  - Total return on user's investment (price appretiation and dividends and other related income) - sum and percentage
  - p.a. return on user's investment
  - Price appretiation return - sum and percentage of user's investment
  - Dividned return - sum and percentage of user's investment
  - All stock transactions - buys, sells, transfers, splits etc.
    - Ability to filter based on the transaction type
  - Top 5 latest news regarding the stock
  - Optional for the user - connection to user's AI to trigger AI evaluation of the stock. User shall have the ability to add, edit and delete the connection.

#### Dividends
- If the stock API retrieves a declared dividend amount for the payout date in future it shall indicate this payout as "declared", until then the estimations shall be indicated as "estimation"
- If only payout date is declared, and the amount not, it shall indicate "amount estimated"
- User shall be able to select what dividend payout percentage he wants to see. Either last 12 month
- User shall be able to edit any dividend amount

### Categories
- User shall be able to create multiple category groups
- Any investment can be part of multiple category groups
- Category groups shall be nested
- Category groups shall have names
- User may create, edit and delete category groups
- Optional - For any nested category in a category group it shall be possible to set a target share in percentage. Categories below certain category parent must have in total 100 % for the particular category level
- Optional - For any item (stock, bond etc.) assigned to a specific category it shall be possible to set a target share. One item may have different target shares in different category groups.
  - Example: User will set 20% of the portfolio to be invested into energy stocks. At stock level the user will set for Exxon 5% target, Shell 4% etc.
- There shall be a report available for the categories. More details in the Reports section

### Benchmarks
- User shall be able to compare performance of own portfolio with other indexes, for example S&P 500

### Reports
- User shall have a report with the overview of all investments
- User shall be able to filter the report based on investment type (stocks, options, bonds, crypto, precious metals storage, precious metals lease)
- User shall be able to store pre-filtered reports and select data to display
- In case there is a request to show share of investment it shall be calculated based on the main currency defined by the user
- User shall have both table reports and graph representation
  - Graph representations shall be
    - Sum and share of currency investments
    - Regional sum and share
      - US, Canada, Latin America, Europe, Africa, Russia, China, India, Australia and New Zealand, Global
      - North America, South America, Europe, Africa, Asia, Australia with New Zealand, Global
    - Categories sum and percentage
  - Table reports
    - Sum and share of currency investments
    - Regional sum and share
      - US, Canada, Latin America, Europe, Africa, Russia, China, India, Australia and New Zealand, Global
      - North America, South America, Europe, Africa, Asia, Australia with New Zealand, Global
    - Categories sum and share
  - User may filter these reports and save these filter settings and save them with a name
    - User may edit or delete these filter savings
    - User may define what data shall be displayed in the table reports
    - Data to display shall be all stored data as ticker, name, price etc. and also it shall be possible to display these metrics
      - Total return - sum & percentage of user's investment
      - Dividend yield based on last 12 months payouts
      - Dividend yield FWD
      - p.a. percentage of user's investment
      - Price appretiation return - sum and percentage of user's investment
      - Dividned return - sum and percentage of user's investment
      - share on whole investment portfolio
      - share on whole category group
      - share on parent category
      - comparison with the target share
      - average price (from all buys and sells)


### CSV import
- It shall be possible to upload acsv with investment transactions
- User shall be able to define specific imports to help with csv app data pairing
- During csv import, which was not defined previously, user shall be able to pair columns in the csv file with data in the app. For example which column is price or which is strock exchange etc.
- User shall be able to name each defined import
- User shall be able to edit defined imports

