// power_of_attorney API

import { MaybeHexString, HexString, BCS, TxnBuilderTypes, AptosAccount } from 'aptos';
import { getOrmAddress, toAddress } from './utilities';
import { OrmClient } from './client';
import { OrmTxnOptions } from './types';

export enum AccountScheme {
  ED25519_SCHEME = 0,
  MULTI_ED25519_SCHEME = 1,
}

export type PowerOfAttorneyProofTicket = {
  address: MaybeHexString;
  module: string;
  struct: string;
  chain_id: number;
  delegator_address: MaybeHexString;
  delegator_sequence_number: number | bigint;
  expiration_date: number | bigint;
  designator: MaybeHexString;
  designator_account_scheme: AccountScheme;
  designator_account_public_key_bytes: Uint8Array;
  designator_signed_proof_challenge: Uint8Array;
};

// /// The proof challenge to become the authorized account on behalf of original owner.
// struct PowerOfAttorneyProof has drop {
//   chain_id: u8,
//   delegator_address: address,
//   delegator_sequence_number: u64,
//   designator: address,
//   expiration_date: u64,
// }

export class PowerOfAttorneyProof {
  address: MaybeHexString;
  module: string;
  struct: string;
  designator_signed_proof_challenge: HexString;
  constructor(
    public readonly chain_id: number,
    public readonly delegator_address: MaybeHexString,
    public readonly delegator_sequence_number: number | bigint,
    public readonly designator: MaybeHexString,
    public readonly expiration_date: number | bigint
  ) {
    this.address = getOrmAddress();
    this.module = 'power_of_attorney';
    this.struct = this.constructor.name;
  }

  serialize(serializer: BCS.Serializer) {
    TxnBuilderTypes.AccountAddress.fromHex(this.address).serialize(serializer);
    serializer.serializeStr(this.module);
    serializer.serializeStr(this.struct);
    serializer.serializeU8(this.chain_id);
    TxnBuilderTypes.AccountAddress.fromHex(this.delegator_address).serialize(serializer);
    serializer.serializeU64(this.delegator_sequence_number);
    TxnBuilderTypes.AccountAddress.fromHex(this.designator).serialize(serializer);
    serializer.serializeU64(this.expiration_date);
  }

  generate(designator: AptosAccount): PowerOfAttorneyProofTicket {
    const challengeHex = HexString.fromUint8Array(BCS.bcsToBytes(this));
    const proofSignedByPrivateKey = designator.signHexString(challengeHex);
    this.designator_signed_proof_challenge = proofSignedByPrivateKey;
    return {
      ...this,
      designator_account_scheme: AccountScheme.ED25519_SCHEME,
      designator_account_public_key_bytes: designator.pubKey().toUint8Array(),
      designator_signed_proof_challenge: proofSignedByPrivateKey.toUint8Array(),
    };
  }
}

/**
 * initPoaTxn initializes a power of attorney for the given `poa` account (worker account).
 * @param client OrmClient
 * @param poa AptosAccount
 * @param ticket PowerOfAttorneyProofTicket
 * @param options OrmTxnOptions
 * @returns 
 */
export async function initPoaTxn(
  client: OrmClient,
  delegator: AptosAccount,
  ticket: PowerOfAttorneyProofTicket,
  options?: OrmTxnOptions
) {
  const fname = `${client.ormAddress}::power_of_attorney::init_poa`;
  const args: any[] = [
    ticket.expiration_date,
    ticket.designator,
    ticket.designator_account_scheme,
    ticket.designator_account_public_key_bytes,
    ticket.designator_signed_proof_challenge,
  ];
  const type_args: string[] = [];
  return await client.generateOrmTxn(
    [delegator],
    {
      function: fname,
      type_arguments: type_args,
      arguments: args,
    },
    options
  );
}

export async function registerPoaTxn(
  client: OrmClient,
  designator: AptosAccount,
  delegator: AptosAccount,
  config: { expiration_date: number | bigint, amount: number | bigint },
  options?: OrmTxnOptions
) {
  const fname = `${client.ormAddress}::power_of_attorney::register_poa`;
  const args: any[] = [
    config.expiration_date,
    config.amount,
  ];
  const type_args: string[] = [];
  return await client.generateOrmTxn(
    [designator, delegator],
    {
      function: fname,
      type_arguments: type_args,
      arguments: args,
    },
    options
  );
}

export async function revokePoaTxn(
  client: OrmClient,
  designator: AptosAccount,
  delegator: MaybeHexString,
  options?: OrmTxnOptions
) {
  const fname = `${client.ormAddress}::power_of_attorney::revoke_poa`;
  const args: any[] = [delegator];
  const type_args: string[] = [];
  return await client.generateOrmTxn(
    [designator],
    {
      function: fname,
      type_arguments: type_args,
      arguments: args,
    },
    options
  );
}

export async function pauseTxn(
  client: OrmClient,
  designator: AptosAccount,
  options?: OrmTxnOptions
) {
  const fname = `${client.ormAddress}::power_of_attorney::pause`;
  const args: any[] = [];
  const type_args: string[] = [];
  return await client.generateOrmTxn(
    [designator],
    {
      function: fname,
      type_arguments: type_args,
      arguments: args,
    },
    options
  );
}

export async function resumeTxn(
  client: OrmClient,
  designator: AptosAccount,
  options?: OrmTxnOptions
) {
  const fname = `${client.ormAddress}::power_of_attorney::resume`;
  const args: any[] = [];
  const type_args: string[] = [];
  return await client.generateOrmTxn(
    [designator],
    {
      function: fname,
      type_arguments: type_args,
      arguments: args,
    },
    options
  );
}