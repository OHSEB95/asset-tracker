export const IPC = {
  ACCOUNT_TYPES_LIST: 'accountTypes:list',
  ACCOUNTS_LIST: 'accounts:list',
  ACCOUNTS_CREATE: 'accounts:create',
  ACCOUNTS_UPDATE: 'accounts:update',
  ACCOUNTS_ARCHIVE: 'accounts:archive',

  HOLDINGS_LIST_FOR_ACCOUNT: 'holdings:listForAccount',
  HOLDINGS_CREATE: 'holdings:create',
  HOLDINGS_UPDATE: 'holdings:update',
  HOLDINGS_ARCHIVE: 'holdings:archive',
  HOLDINGS_SNAPSHOT: 'holdings:snapshot',

  TRANSACTIONS_LIST: 'transactions:list',
  TRANSACTIONS_CREATE: 'transactions:create',
  TRANSACTIONS_UPDATE: 'transactions:update',
  TRANSACTIONS_DELETE: 'transactions:delete',

  PRICES_FETCH: 'prices:fetch',
  PRICE_SNAPSHOTS_UPSERT: 'priceSnapshots:upsert',

  RATES_GET_USD_KRW: 'rates:getUsdKrw',

  SETTINGS_GET: 'settings:get',
  SETTINGS_SET_DATA_DIR: 'settings:setDataDir',
  SETTINGS_CHOOSE_DATA_DIR: 'settings:chooseDataDir',

  DASHBOARD_GET_MONTHLY_SUMMARY: 'dashboard:getMonthlySummary',
  DASHBOARD_GET_PORTFOLIO_SNAPSHOT: 'dashboard:getPortfolioSnapshot',

  DIVIDENDS_GET_OVERVIEW: 'dividends:getOverview',

  AUTH_LOGIN: 'auth:login',
  AUTH_REGISTER: 'auth:register',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_GET_CURRENT_USER: 'auth:getCurrentUser',
  AUTH_GET_REMEMBERED_EMAIL: 'auth:getRememberedEmail',
  AUTH_CHANGE_PASSWORD: 'auth:changePassword',
  AUTH_FORCE_LOGOUT: 'auth:forceLogout',

  SYNC_PUSH: 'sync:push',
  SYNC_GET_STATUS: 'sync:getStatus'
} as const
