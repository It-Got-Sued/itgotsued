// One anonymous, ephemeral bank scan:
//   public_token -> access_token -> transactions -> BrandDetection[] -> /item/remove
//
// Nothing is persisted or logged. The access token lives only in this function's
// scope and the Item is always removed in `finally`, even on errors/timeouts.

import type { PlaidApi } from "plaid";
import type { BrandDetection } from "@/lib/types";
import { toBankScanError } from "./client";
import { signalsToDetections, type TxnSignal } from "./detections";
import { fetchTransactionSignals, type FetchOptions } from "./fetch-transactions";

export type ScanClient = Pick<
  PlaidApi,
  "itemPublicTokenExchange" | "itemRemove" | "transactionsSync" | "transactionsGet"
>;

export async function runBankScan(
  client: ScanClient,
  publicToken: string,
  opts: FetchOptions = {},
): Promise<BrandDetection[]> {
  let accessToken: string | null = null;
  let signals: Map<string, TxnSignal> | null = null;
  try {
    const { data } = await client.itemPublicTokenExchange({ public_token: publicToken });
    accessToken = data.access_token;
    signals = await fetchTransactionSignals(client, accessToken, opts);
    return signalsToDetections(signals.values());
  } catch (err) {
    throw toBankScanError(err);
  } finally {
    signals?.clear();
    signals = null;
    if (accessToken) {
      const itemRemoved = await removeItem(client, accessToken);
      accessToken = null;
      if (!itemRemoved) {
        // Only a fixed message: no token, item id, or error payload.
        console.error("[plaid] item removal failed after retries");
      }
    }
  }
}

async function removeItem(client: ScanClient, accessToken: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await client.itemRemove({ access_token: accessToken });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }
  return false;
}
