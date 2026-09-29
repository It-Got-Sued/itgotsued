// Realistic fixture shaped like Plaid /transactions/sync `added` entries (PFC v2).
// All ids, accounts and amounts are fake.

import type { PlaidTxnLike } from "../detections";

type Cp = NonNullable<PlaidTxnLike["counterparties"]>[number];

let n = 0;
function cp(name: string, type: string, confidence = "VERY_HIGH"): Cp {
  return {
    name,
    type: type as Cp["type"],
    entity_id: `ent_${name.replace(/\W/g, "")}`,
    website: null,
    logo_url: null,
    confidence_level: confidence,
  };
}

function txn(
  p: {
    name: string;
    merchant?: string | null;
    amount: number;
    primary?: string;
    detailed?: string;
    cps?: Cp[];
    pending?: boolean;
    pendingId?: string | null;
    id?: string;
  },
): PlaidTxnLike & Record<string, unknown> {
  n += 1;
  return {
    account_id: "acc_fake_checking_0001",
    transaction_id: p.id ?? `txn_${n}`,
    amount: p.amount,
    iso_currency_code: "USD",
    date: "2026-03-14",
    authorized_date: "2026-03-13",
    name: p.name,
    merchant_name: p.merchant ?? null,
    pending: p.pending ?? false,
    pending_transaction_id: p.pendingId ?? null,
    payment_channel: "online",
    location: { address: null, city: null, region: null, postal_code: null, country: null, lat: null, lon: null, store_number: null },
    counterparties: p.cps ?? [],
    personal_finance_category: p.primary
      ? { primary: p.primary, detailed: p.detailed ?? `${p.primary}_OTHER`, confidence_level: "VERY_HIGH", version: "v2" as never }
      : null,
  };
}

export const FIXTURE: (PlaidTxnLike & Record<string, unknown>)[] = [
  // Subscriptions / services (x3 Netflix)
  ...[1, 2, 3].map(() =>
    txn({ name: "NETFLIX.COM", merchant: "Netflix", amount: 15.49, primary: "ENTERTAINMENT", detailed: "ENTERTAINMENT_TV_AND_MOVIES", cps: [cp("Netflix", "merchant")] }),
  ),
  txn({ name: "VERIZON WIRELESS PAYMENTS", merchant: "Verizon", amount: 85, primary: "RENT_AND_UTILITIES", detailed: "RENT_AND_UTILITIES_TELEPHONE", cps: [cp("Verizon", "merchant")] }),
  txn({ name: "VERIZON WRLS P2000-01", merchant: "Verizon Wireless", amount: 85, primary: "RENT_AND_UTILITIES", detailed: "RENT_AND_UTILITIES_TELEPHONE", cps: [cp("Verizon", "merchant", "HIGH")] }),
  // Marketplace + processor
  txn({ name: "AMZN Mktp US*2K4L", merchant: "Amazon", amount: 42.1, primary: "GENERAL_MERCHANDISE", detailed: "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES", cps: [cp("Amazon", "marketplace")] }),
  txn({ name: "Amazon.com*RT4", merchant: "Amazon.com", amount: 12.99, primary: "GENERAL_MERCHANDISE", detailed: "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES" }),
  txn({ name: "PAYPAL *SPOTIFY", merchant: "Spotify", amount: 11.99, primary: "ENTERTAINMENT", detailed: "ENTERTAINMENT_MUSIC_AND_AUDIO", cps: [cp("PayPal", "payment_app"), cp("Spotify", "merchant")] }),
  txn({ name: "DOORDASH*CHIPOTLE", merchant: "DoorDash", amount: 23.5, primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_FAST_FOOD", cps: [cp("DoorDash", "marketplace"), cp("Chipotle", "merchant", "MEDIUM")] }),
  // Pending then posted (same purchase, counted once)
  txn({ id: "txn_pend_1", name: "PELOTON* MEMBERSHIP", merchant: "Peloton", amount: 44, primary: "PERSONAL_CARE", detailed: "PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS", pending: true, cps: [cp("Peloton", "merchant")] }),
  txn({ name: "PELOTON* MEMBERSHIP", merchant: "Peloton", amount: 44, primary: "PERSONAL_CARE", detailed: "PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS", pendingId: "txn_pend_1", cps: [cp("Peloton", "merchant")] }),
  // Uncategorized raw descriptor fallback
  txn({ name: "SQ *BLUE BOTTLE COFFEE 0423 CA", amount: 6.5 }),
  // ---- Noise: must all be excluded ----
  txn({ name: "ACME CORP PAYROLL", amount: -2500, primary: "INCOME", detailed: "INCOME_SALARY", cps: [cp("Acme Corp", "income_source")] }),
  txn({ name: "ATM WITHDRAWAL 1234 MAIN ST", amount: 200, primary: "TRANSFER_OUT", detailed: "TRANSFER_OUT_WITHDRAWAL" }),
  txn({ name: "INTEREST PAYMENT", amount: -0.42, primary: "INCOME", detailed: "INCOME_INTEREST_EARNED" }),
  txn({ name: "MONTHLY SERVICE FEE", amount: 12, primary: "BANK_FEES", detailed: "BANK_FEES_OTHER_BANK_FEES", cps: [cp("Chase", "financial_institution")] }),
  txn({ name: "VENMO PAYMENT 1023", merchant: "Venmo", amount: 40, primary: "TRANSFER_OUT", detailed: "TRANSFER_OUT_TRANSFER_OUT_FROM_APPS", cps: [cp("Venmo", "payment_app")] }),
  txn({ name: "Zelle payment to JOHN SMITH", amount: 60, primary: "TRANSFER_OUT", detailed: "TRANSFER_OUT_ACCOUNT_TRANSFER" }),
  txn({ name: "CASH APP*JANE DOE", merchant: "Cash App", amount: 25, primary: "GENERAL_SERVICES", detailed: "GENERAL_SERVICES_OTHER_GENERAL_SERVICES", cps: [cp("Cash App", "payment_app")] }),
  txn({ name: "OAKWOOD APTS RENT", merchant: "Oakwood Apartments", amount: 1800, primary: "RENT_AND_UTILITIES", detailed: "RENT_AND_UTILITIES_RENT" }),
  txn({ name: "IRS USATAXPYMT", merchant: "IRS", amount: 950, primary: "GOVERNMENT_AND_NON_PROFIT", detailed: "GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT" }),
  txn({ name: "CHASE CREDIT CRD AUTOPAY", amount: 640, primary: "LOAN_PAYMENTS", detailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT", cps: [cp("Chase", "financial_institution")] }),
  txn({ name: "ONLINE TRANSFER TO SAV 9912", amount: 300 }),
  txn({ name: "Amazon refund", merchant: "Amazon", amount: -19.99, primary: "GENERAL_MERCHANDISE", detailed: "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES" }),
];
