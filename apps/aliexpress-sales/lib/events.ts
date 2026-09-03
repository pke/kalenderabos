export interface SaleEvent {
  name: string;
  startDate: string; // YYYYMMDD
  endDate: string; // YYYYMMDD (exclusive for iCal)
}

// Generated from https://en.ali-shop.net/sales on 2026-08-31
export const events: SaleEvent[] = [
  { name: "Choice Day + New Year Deals", startDate: "20260101", endDate: "20260108" },
  { name: "Winter Sale", startDate: "20260112", endDate: "20260119" },
  { name: "Brand Day", startDate: "20260119", endDate: "20260125" },
  { name: "Final Season Savings", startDate: "20260125", endDate: "20260130" },
  { name: "Choice Day + Love Delivers", startDate: "20260201", endDate: "20260209" },
  { name: "Valentine’s Sale", startDate: "20260209", endDate: "20260224" },
  { name: "Choice Day + Seasonal Sale", startDate: "20260301", endDate: "20260308" },
  { name: "16th Anniversary Sale", startDate: "20260316", endDate: "20260326" },
  { name: "Choice Day + Outdoor Fun", startDate: "20260401", endDate: "20260408" },
  { name: "Spring Refresh", startDate: "20260413", endDate: "20260420" },
  { name: "Brand Day", startDate: "20260420", endDate: "20260425" },
  { name: "Fresh Spring Savings", startDate: "20260426", endDate: "20260429" },
  { name: "Choice Day + Summer Ready", startDate: "20260501", endDate: "20260508" },
  { name: "Summer Refresh Savings", startDate: "20260510", endDate: "20260516" },
  { name: "Sunshine Savings", startDate: "20260518", endDate: "20260523" },
  { name: "Summer Sale", startDate: "20260601", endDate: "20260611" },
  { name: "Mid-Year Sale", startDate: "20260615", endDate: "20260621" },
  { name: "Choice Day + Summer Savings", startDate: "20260701", endDate: "20260708" },
  { name: "Brand Day", startDate: "20260708", endDate: "20260711" },
  { name: "Vacation Sale", startDate: "20260713", endDate: "20260720" },
  { name: "Fun Summer Savings", startDate: "20260726", endDate: "20260730" },
  { name: "Choice Day + Summer Clearance", startDate: "20260801", endDate: "20260808" },
  { name: "Back to School", startDate: "20260817", endDate: "20260827" },
  { name: "Choice Day", startDate: "20260901", endDate: "20260908" },
  { name: "Fall Revival Savings", startDate: "20260908", endDate: "20260912" },
  { name: "Fall Sale", startDate: "20260914", endDate: "20260921" },
  { name: "Brand Day", startDate: "20260921", endDate: "20260924" },
  { name: "PayDay", startDate: "20260926", endDate: "20260929" },
  { name: "Choice Day", startDate: "20261001", endDate: "20261008" },
  { name: "Holiday Season", startDate: "20261009", endDate: "20261014" },
  { name: "Brand Day", startDate: "20261014", endDate: "20261019" },
  { name: "Fall Fashion", startDate: "20261020", endDate: "20261026" },
  { name: "Mega Choice Day", startDate: "20261101", endDate: "20261108" },
  { name: "11.11: Global Shopping Festival", startDate: "20261111", endDate: "20261120" },
  { name: "Black Friday", startDate: "20261120", endDate: "20261204" },
  { name: "Cyber Monday", startDate: "20261201", endDate: "20261204" },
  { name: "Christmas Sale", startDate: "20261208", endDate: "20261215" },
  { name: "Snowfall Offers", startDate: "20261216", endDate: "20261222" },
  { name: "Brand Day", startDate: "20261222", endDate: "20261227" },
];
