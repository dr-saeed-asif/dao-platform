import {
  Injectable,
  UnauthorizedException,
  HttpException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';
import { verifyMessage, isAddress } from 'ethers';
import type { FastifyRequest } from 'fastify';
import { TransactionFactory, LegacyTransaction } from '@cyberchain/tx';
import { Common } from '@ethereumjs/common';

// Private authentication namespace (ASCII CYBDAO), deliberately distinct from
// the configured DAO network. Wallet 1.0.0 fixes gas at 6,000,000 and cannot
// sign a zero-gas proof; a separate signed chain ID prevents network replay.
export const NATIVE_AUTH_CHAIN_ID = 0x43594244414f;
const NATIVE_AUTH_GAS_LIMIT = 6_000_000n;

@Injectable()
export class AssistantAuthService {
  private readonly challenges = new Map<
    string,
    {
      message: string;
      expires: number;
      kind: 'metamask' | 'cyberchain';
      address: string;
      chainId: number;
    }
  >();
  constructor(private readonly config: ConfigService) {}

  challenge(address: string, kind: 'metamask' | 'cyberchain' = 'metamask') {
    if (!isAddress(address))
      throw new UnauthorizedException('Connect a valid wallet.');
    for (const [key, value] of this.challenges)
      if (value.expires < Date.now()) this.challenges.delete(key);
    if (this.challenges.size >= 1000)
      throw new HttpException('Too many pending wallet sign-ins.', 429);
    const nonce = randomBytes(32).toString('hex');
    const message = `CyberDAO AI Assistant\nWallet: ${address.toLowerCase()}\nNonce: ${nonce}\nExpires: ${new Date(Date.now() + 120_000).toISOString()}`;
    const daoChainId = Number(
      this.config.get<string>('CYBERCHAIN_CHAIN_ID') ?? 1212,
    );
    if (kind === 'cyberchain' && daoChainId === NATIVE_AUTH_CHAIN_ID)
      throw new HttpException(
        'Wallet authentication network conflicts with the DAO network.',
        503,
      );
    const chainId = kind === 'cyberchain' ? NATIVE_AUTH_CHAIN_ID : daoChainId;
    this.challenges.set(nonce, {
      message,
      expires: Date.now() + 120_000,
      kind,
      address: address.toLowerCase(),
      chainId,
    });
    return {
      nonce,
      message,
      ...(kind === 'cyberchain'
        ? {
            transaction: {
              to: address.toLowerCase(),
              chainId: `0x${chainId.toString(16)}`,
              nonce: '0x0',
              value: '0x0',
              gas: `0x${NATIVE_AUTH_GAS_LIMIT.toString(16)}`,
              gasLimit: `0x${NATIVE_AUTH_GAS_LIMIT.toString(16)}`,
              gasPrice: '0x0',
              maxFeePerGas: '0x0',
              maxPriorityFeePerGas: '0x0',
              data: Buffer.from(message).toString('hex'),
              dataDisplayFormat: 'hex',
            },
          }
        : {}),
    };
  }

  login(nonce: string, signature?: string, signedTransaction?: string) {
    const challenge = this.challenges.get(nonce);
    this.challenges.delete(nonce);
    if (!challenge || challenge.expires < Date.now())
      throw new UnauthorizedException('Wallet login expired. Sign in again.');
    let address: string;
    try {
      if (challenge.kind === 'cyberchain') {
        if (
          !signedTransaction ||
          signature ||
          !/^0x(?:[0-9a-fA-F]{2})+$/.test(signedTransaction)
        )
          throw new Error();
        const common = Common.custom(
          { chainId: challenge.chainId, networkId: challenge.chainId },
          { hardfork: 'london' },
        );
        const tx = TransactionFactory.fromSerializedData(
          Buffer.from(signedTransaction.slice(2), 'hex'),
          { common },
        );
        // An offline identity proof on a dedicated authentication chain. The
        // extension ignores supplied gas fields and always uses 6,000,000.
        // Never broadcast this proof or accept a proof for the real DAO chain.
        if (
          tx.common.chainId() !== BigInt(NATIVE_AUTH_CHAIN_ID) ||
          tx.gasLimit !== NATIVE_AUTH_GAS_LIMIT ||
          tx.value !== 0n ||
          tx.nonce !== 0n ||
          tx.to?.toString().toLowerCase() !== challenge.address ||
          Buffer.from(tx.data).toString('hex') !==
            Buffer.from(challenge.message).toString('hex') ||
          ('gasPrice' in tx && tx.gasPrice !== 0n) ||
          ('maxFeePerGas' in tx && tx.maxFeePerGas !== 0n) ||
          ('maxPriorityFeePerGas' in tx && tx.maxPriorityFeePerGas !== 0n)
        )
          throw new Error();
        // CyberChain tx 0.2.5 loses the legacy EIP-155 capability when decoding
        // a signed transaction. Reconstruct its unsigned signing payload using
        // the expected chain; signature verification itself stays in the SDK.
        const hash =
          tx instanceof LegacyTransaction
            ? LegacyTransaction.fromTxData(
                {
                  nonce: tx.nonce,
                  gasPrice: tx.gasPrice,
                  gasLimit: tx.gasLimit,
                  to: tx.to,
                  value: tx.value,
                  data: tx.data,
                },
                { common },
              ).getHashedMessageToSign()
            : tx.getMessageToVerifySignature();
        if (!tx.signature) throw new Error();
        address = tx.signature.getSenderAddress(hash).toString().toLowerCase();
      } else {
        if (!signature || signedTransaction) throw new Error();
        address = verifyMessage(challenge.message, signature).toLowerCase();
      }
    } catch {
      throw new UnauthorizedException('Invalid wallet signature.');
    }
    if (!challenge.message.includes(`Wallet: ${address}\n`))
      throw new UnauthorizedException('Wallet signature does not match.');
    const expires = Date.now() + 30 * 60_000;
    const payload = Buffer.from(JSON.stringify({ address, expires })).toString(
      'base64url',
    );
    return { token: `${payload}.${this.mac(payload)}`, expires, address };
  }

  user(request: FastifyRequest): string {
    const token = request.headers.authorization?.replace(/^Bearer /, '') ?? '';
    const [payload, mac, extra] = token.split('.');
    if (
      !payload ||
      payload.length > 1024 ||
      !mac ||
      !/^[A-Za-z0-9_-]{43}$/.test(mac) ||
      extra
    )
      throw new UnauthorizedException('Sign in with your wallet to use AI.');
    const expected = this.mac(payload);
    if (
      mac.length !== expected.length ||
      !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
    )
      throw new UnauthorizedException('Invalid AI session. Sign in again.');
    try {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
      if (
        !isAddress(data.address) ||
        !Number.isSafeInteger(data.expires) ||
        data.expires < Date.now()
      )
        throw new Error();
      return data.address;
    } catch {
      throw new UnauthorizedException('AI session expired. Sign in again.');
    }
  }

  private mac(payload: string) {
    return createHmac('sha256', this.config.getOrThrow<string>('JWT_SECRET'))
      .update(`ai-session:${payload}`)
      .digest('base64url');
  }
}
