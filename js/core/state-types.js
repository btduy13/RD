/* Schema constants shared between renderer logic and SQLite migrations */
window.RD_SCHEMA_VERSION = 4;

window.RD_EMPTY_STATE_TEMPLATE = {
  companyName: "",
  address: "",
  taxCode: "",
  accountingStandard: "TT200",
  products: [],
  partners: [],
  initialBalances: {},
  partnerOpeningBalances: {},
  partnerOpeningBalanceTs: {},
  deletedIds: [],
  deletedCloudKeys: [],
  vouchers: [],
  schemaVersion: 4,
  _accountingValid: false
};
