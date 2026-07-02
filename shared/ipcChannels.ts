export const IPC = {
  ACCOUNT_TYPES_LIST: 'accountTypes:list',
  ACCOUNTS_LIST: 'accounts:list',
  ACCOUNTS_CREATE: 'accounts:create',
  ACCOUNTS_UPDATE: 'accounts:update',
  ACCOUNTS_ARCHIVE: 'accounts:archive',
  ENTRIES_LIST_BY_MONTH: 'entries:listByMonth',
  ENTRIES_UPSERT: 'entries:upsert',
  PRICES_FETCH: 'prices:fetch',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET_DATA_DIR: 'settings:setDataDir',
  SETTINGS_CHOOSE_DATA_DIR: 'settings:chooseDataDir',
  DASHBOARD_GET_MONTHLY_SUMMARY: 'dashboard:getMonthlySummary'
} as const
