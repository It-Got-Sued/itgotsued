// Pull up to 24 months of transactions for one Item, reduced to TxnSignals.
//
// Strategy (per https://plaid.com/docs/api/products/transactions/):
// - /transactions/sync from an empty cursor, paging while has_more.
// - A brand-new Item usually reports transactions_update_status NOT_READY (empty
//   arrays) or INITIAL_UPDATE_COMPLETE (~30 days) before HISTORICAL_UPDATE_COMPLETE
//   (full history). We poll with backoff until HISTORICAL_UPDATE_COMPLETE or the
//   deadline, then use whatever has arrived.
// - TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION: restart the page run from the
//   cursor it began with.
// - If sync produced nothing by the deadline, try /transactions/get once.

import {
  PersonalFinanceCategoryVersion,
  TransactionsUpdateStatus,
  type PlaidApi,
  type Transaction,
} from "plaid";
import { BankScanError, plaidErrorCode } from "./client";
import { toSignal, type TxnSignal } from "./detections";

export const DAYS_REQUESTED = 730; // Plaid maximum, ~24 months

export type TransactionsClient = Pick<PlaidApi, "transactionsSync" | "transactionsGet">;

export interface FetchOptions {
  timeoutMs?: number; // overall budget, default 30s
  pollDelaysMs?: number[]; // backoff schedule between NOT_READY polls
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function fetchTransactionSignals(
  client: TransactionsClient,
  accessToken: string,
  opts: FetchOptions = {},
): Promise<Map<string, TxnSignal>> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? defaultSleep;
  const delays = opts.pollDelaysMs ?? [1000, 1500, 2000, 3000];
  const deadline = now() + (opts.timeoutMs ?? 30_000);

  const signals = new Map<string, TxnSignal>();
  let cursor: string | undefined;
  let status: string = TransactionsUpdateStatus.NotReady;
  let polls = 0;
  let mutationRetries = 0;

  while (true) {
    // One pagination run: accumulate into a buffer, commit only when complete.
    const runStart = cursor;
    let runCursor = cursor;
    const added: Transaction[] = [];
    const modified: Transaction[] = [];
    const removed: string[] = [];
    let completed = false;

    try {
      while (true) {
        const { data } = await client.transactionsSync({
          access_token: accessToken,
          cursor: runCursor,
          count: 500,
          options: {
            days_requested: DAYS_REQUESTED,
            include_original_description: false,
            personal_finance_category_version: PersonalFinanceCategoryVersion.V2,
          },
        });
        added.push(...data.added);
        modified.push(...data.modified);
        for (const r of data.removed) if (r.transaction_id) removed.push(r.transaction_id);
        runCursor = data.next_cursor;
        status = data.transactions_update_status;
        if (!data.has_more) break;
        if (now() > deadline) break; // partial run; commit what we have
      }
      completed = true;
    } catch (err) {
      const code = plaidErrorCode(err);
      if (code === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" && mutationRetries < 3) {
        mutationRetries += 1;
        cursor = runStart;
        continue;
      }
      if (code === "PRODUCT_NOT_READY" && now() < deadline) {
        await sleep(delays[Math.min(polls++, delays.length - 1)]);
        continue;
      }
      throw err;
    }

    if (completed) {
      for (const t of [...added, ...modified]) signals.set(t.transaction_id, toSignal(t));
      for (const id of removed) signals.delete(id);
      added.length = 0;
      modified.length = 0;
      cursor = runCursor;
    }

    if (status === TransactionsUpdateStatus.HistoricalUpdateComplete) break;
    if (now() >= deadline) break;
    // NOT_READY, INITIAL_UPDATE_COMPLETE or UNKNOWN: wait and pull more history.
    const wait = delays[Math.min(polls++, delays.length - 1)];
    if (now() + wait >= deadline) break;
    await sleep(wait);
  }

  if (signals.size === 0) {
    // Nothing via sync in time. /transactions/get is a one-shot fallback.
    try {
      await fetchViaGet(client, accessToken, signals, deadline + 10_000, now);
    } catch (err) {
      if (plaidErrorCode(err) === "PRODUCT_NOT_READY" && status === TransactionsUpdateStatus.NotReady) {
        throw new BankScanError(
          504,
          "Your bank is still preparing transactions. Please try the scan again in a minute.",
          "PRODUCT_NOT_READY",
        );
      }
      throw err;
    }
  }
  return signals;
}

async function fetchViaGet(
  client: TransactionsClient,
  accessToken: string,
  signals: Map<string, TxnSignal>,
  hardDeadline: number,
  now: () => number,
): Promise<void> {
  const end = new Date();
  const start = new Date(end.getTime() - DAYS_REQUESTED * 86_400_000);
  let offset = 0;
  while (now() < hardDeadline) {
    const { data } = await client.transactionsGet({
      access_token: accessToken,
      start_date: isoDate(start),
      end_date: isoDate(end),
      options: {
        count: 500,
        offset,
        days_requested: DAYS_REQUESTED,
        include_original_description: false,
        personal_finance_category_version: PersonalFinanceCategoryVersion.V2,
      },
    });
    for (const t of data.transactions) signals.set(t.transaction_id, toSignal(t));
    offset += data.transactions.length;
    if (data.transactions.length === 0 || offset >= data.total_transactions) break;
  }
}
