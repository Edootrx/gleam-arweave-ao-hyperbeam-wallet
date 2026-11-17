import { describe, expect, it } from "vitest";
import { bytesToBase64Url, type ArweaveTransactionJson, type UnsignedPayload } from "@gleam/core";
import type { Tag } from "@gleam/core/src/models/tag.ts";
import { collectibleTransferTags } from "@gleam/core/src/ao/collectible-transfer.ts";
import { l1TransferTags } from "@gleam/core/src/ao/l1-transfer.ts";
import { assertTransferMatches, type ApprovedTransfer } from "./prepared-check";

/**
 * Pins the L1 fee split `assertTransferMatches` enforces: a prepared L1
 * token or collectible transaction may carry 0 winston of its own, or
 * exactly the 1-winston activation a process with no AR needs, and its
 * reward plus that value must equal the fee the user approved — never
 * more, never less. Anything else is refused before a signer runs.
 */

const TOKEN = "T".repeat(43);
const ASSET = "C".repeat(43);
const RECIPIENT = "R".repeat(43);
const AMOUNT = "311";
const FEE = "1000";

const encoder = new TextEncoder();
const encodeTags = (tags: Tag[]): Tag[] =>
  tags.map((tag) => ({ name: bytesToBase64Url(encoder.encode(tag.name)), value: bytesToBase64Url(encoder.encode(tag.value)) }));

function transactionPayload(target: string, tags: Tag[], quantity: string, reward: string): UnsignedPayload {
  const transaction: ArweaveTransactionJson = {
    format: 2,
    id: "",
    last_tx: "",
    owner: "",
    tags: encodeTags(tags),
    target,
    quantity,
    data: "",
    data_size: "0",
    data_root: "",
    reward,
    signature: "",
  };
  return { kind: "transaction", transaction };
}

const approvedToken: ApprovedTransfer = { recipient: RECIPIENT, amount: AMOUNT, token: TOKEN, fee: FEE };
const approvedCollectible: ApprovedTransfer = {
  recipient: RECIPIENT,
  amount: "0",
  token: null,
  fee: FEE,
  collectible: { id: ASSET },
};

describe("assertTransferMatches: L1 fee split", () => {
  it("accepts a token transfer whose reward is the whole approved fee", () => {
    const payload = transactionPayload(TOKEN, l1TransferTags(RECIPIENT, AMOUNT), "0", FEE);
    expect(() => assertTransferMatches(approvedToken, payload)).not.toThrow();
  });

  it("accepts a token transfer that takes the activation winston out of the fee", () => {
    const payload = transactionPayload(TOKEN, l1TransferTags(RECIPIENT, AMOUNT), "1", "999");
    expect(() => assertTransferMatches(approvedToken, payload)).not.toThrow();
  });

  it("refuses a token transfer carrying any other value of its own", () => {
    const payload = transactionPayload(TOKEN, l1TransferTags(RECIPIENT, AMOUNT), "2", "998");
    expect(() => assertTransferMatches(approvedToken, payload)).toThrow(/doesn't match the request/);
  });

  it("refuses a token transfer whose reward plus value exceeds the approved fee", () => {
    const payload = transactionPayload(TOKEN, l1TransferTags(RECIPIENT, AMOUNT), "1", FEE);
    expect(() => assertTransferMatches(approvedToken, payload)).toThrow(/doesn't match the request/);
  });

  it("refuses a token transfer whose reward plus value falls short of the approved fee", () => {
    const payload = transactionPayload(TOKEN, l1TransferTags(RECIPIENT, AMOUNT), "0", "999");
    expect(() => assertTransferMatches(approvedToken, payload)).toThrow(/doesn't match the request/);
  });

  it("accepts a collectible send that takes the activation winston out of the fee", () => {
    const payload = transactionPayload(ASSET, collectibleTransferTags(RECIPIENT), "1", "999");
    expect(() => assertTransferMatches(approvedCollectible, payload)).not.toThrow();
  });

  it("refuses a collectible send carrying any other value of its own", () => {
    const payload = transactionPayload(ASSET, collectibleTransferTags(RECIPIENT), "5", "995");
    expect(() => assertTransferMatches(approvedCollectible, payload)).toThrow(/doesn't match the request/);
  });
});
