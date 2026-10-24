import { ConfigService } from '@nestjs/config';
import { Common } from '@ethereumjs/common';
import { Address } from '@ethereumjs/util';
import {
  LegacyTransaction,
  FeeMarketEIP1559Transaction,
  type SignKey,
} from '@cyberchain/tx';
import { privateKeyToMixedAddress } from '@cyberchain/smart-contract-wrapper';
import { ml_dsa44 } from '@noble/post-quantum/ml-dsa';
import { AssistantAuthService } from '../assistant-auth.service';

const pair = ml_dsa44.keygen(new Uint8Array(32).fill(7));
const ml: SignKey = {
  type: 'ml-dsa',
  spec: 44,
  publicKey: pair.publicKey,
  secretKey: pair.secretKey,
};
const ec: SignKey = { type: 'ec-dsa', key: new Uint8Array(32).fill(8) };
const complement = '0x' + '11'.repeat(20);
describe('Connected CyberChain wallet offline authentication', () => {
  const config = new ConfigService({
    JWT_SECRET: 'a-session-key-with-at-least-32-characters',
    CYBERCHAIN_CHAIN_ID: '1212',
  });
  function proof(
    auth: AssistantAuthService,
    key: SignKey = ml,
    changes: Record<string, unknown> = {},
    typed = false,
  ) {
    const address = privateKeyToMixedAddress(key, complement);
    const challenge = auth.challenge(address, 'cyberchain');
    const data = {
      ...challenge.transaction!,
      data: '0x' + challenge.transaction!.data,
      ...changes,
    };
    const chainId = BigInt(data.chainId);
    const common = Common.custom(
      { chainId, networkId: chainId },
      { hardfork: 'london' },
    );
    const transaction = typed
      ? FeeMarketEIP1559Transaction.fromTxData(data, { common })
      : LegacyTransaction.fromTxData(data, { common });
    const signed = transaction.sign(key, Address.fromString(complement));
    return {
      address,
      challenge,
      raw: '0x' + Buffer.from(signed.serialize()).toString('hex'),
    };
  }
  it.each([
    ['ML-DSA', ml],
    ['ECDSA', ec],
  ] as const)('verifies native %s signatures and rejects replay', (_, key) => {
    const auth = new AssistantAuthService(config),
      p = proof(auth, key);
    const session = auth.login(p.challenge.nonce, undefined, p.raw);
    expect(session.address).toBe(p.address);
    expect(() => auth.login(p.challenge.nonce, undefined, p.raw)).toThrow(
      'expired',
    );
    expect(
      auth.user({
        headers: { authorization: `Bearer ${session.token}` },
      } as any),
    ).toBe(p.address);
  });
  it('supports typed native proofs', () => {
    const auth = new AssistantAuthService(config),
      p = proof(auth, ml, {}, true);
    expect(auth.login(p.challenge.nonce, undefined, p.raw).address).toBe(
      p.address,
    );
  });
  it.each([
    { value: '0x1' },
    { gasLimit: '0x5208' },
    { gasPrice: '0x1' },
    { nonce: '0x1' },
    { data: '0x1234' },
    { to: complement },
  ])('rejects unsafe or changed proof fields %s', (changes) => {
    const auth = new AssistantAuthService(config),
      p = proof(auth, ml, changes);
    expect(() => auth.login(p.challenge.nonce, undefined, p.raw)).toThrow(
      'Invalid',
    );
  });
  it('rejects proofs signed for the live DAO network', () => {
    const auth = new AssistantAuthService(config),
      p = proof(auth, ml, { chainId: '0x4bc' }, true);
    expect(() => auth.login(p.challenge.nonce, undefined, p.raw)).toThrow(
      'Invalid',
    );
  });
  it('rejects an authentication namespace configured as the live DAO network', () => {
    const auth = new AssistantAuthService(
      new ConfigService({ CYBERCHAIN_CHAIN_ID: String(0x43594244414f) }),
    );
    expect(() => auth.challenge(complement, 'cyberchain')).toThrow('conflicts');
  });
  it('rejects missing proofs and wrong wallet addresses', () => {
    const auth = new AssistantAuthService(config),
      p = proof(auth);
    expect(() => auth.login(p.challenge.nonce)).toThrow('Invalid');
    const wrong = auth.challenge(complement, 'cyberchain');
    expect(() => auth.login(wrong.nonce, undefined, proof(auth).raw)).toThrow(
      'Invalid',
    );
  });
});
