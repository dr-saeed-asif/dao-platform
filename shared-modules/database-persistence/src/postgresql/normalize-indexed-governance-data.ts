import { WalletAddress } from "@dao-platform/domain";

export function normalizeOperationalAddress(value: string): string {
  const normalized = WalletAddress.create(value).value;
  if (!/^0x[0-9a-f]{40}$/.test(normalized)) {
    throw new Error("Operational address must be a 20-byte hexadecimal address.");
  }
  return normalized;
}

export function normalizeOperationalHash(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(normalized)) {
    throw new Error("Operational hash must be a 32-byte hexadecimal value.");
  }
  return normalized;
}

export function operationalUnsignedDecimal(
  value: string | bigint,
  field: string,
): string {
  const normalized = typeof value === "bigint" ? value.toString() : value;
  if (!/^(?:0|[1-9][0-9]*)$/.test(normalized)) {
    throw new Error(`${field} must be an unsigned decimal value.`);
  }
  return normalized;
}
