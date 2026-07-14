import { DomainRuleError } from "./domain-rule.error.js";

/**
 * A chain-neutral wallet identifier.
 *
 * CyberChain-specific parsing and checksum validation belongs in the
 * blockchain adapter. The domain only guarantees a safe, normalized value.
 */
export class WalletAddress {
  private constructor(public readonly value: string) {}

  static create(value: string): WalletAddress {
    const normalized = value.trim().toLowerCase();

    if (!/^0x[0-9a-f]+$/.test(normalized)) {
      throw new DomainRuleError(
        "INVALID_WALLET_ADDRESS",
        "Wallet address must be a 0x-prefixed hexadecimal value.",
      );
    }

    return new WalletAddress(normalized);
  }

  equals(other: WalletAddress): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
