import 'reflect-metadata';
import { Types, MaybeHexString, HexString, AptosAccount, TxnBuilderTypes } from 'aptos';

export type AptosPrimitiveTypeName =
  | 'boolean'
  | 'u8'
  | 'u16'
  | 'u32'
  | 'u64'
  | 'u128'
  | 'u256'
  | 'address'
  | 'signer'
  | '0x1::string::String';

export type AptosTypeName = AptosPrimitiveTypeName | 'string' | 'vector';

export type OrmType = Types.MoveType;
export type OrmValue = Types.MoveValue;
// export interface OrmField extends Types.MoveStructField {}
export interface OrmFieldConfig {
  /** This field will be used to create an object if set. */
  index?: boolean;
  /** The resource field name of onchain AptoOrm object */
  name?: string;
  /** The resource field type of onchain AptoOrm object */
  type?: OrmType;
  /** The default value of the field if it is empty value. */
  default?: OrmValue;
  /** Timestamp updated automatically */
  timestamp?: boolean;
  /** This field is unable to updated after created. */
  immutable?: boolean;
  /** The constant value is set to the field. */
  constant?: string;
  /** whether the field is a major field of Aptos Token object. */
  token_field?: boolean;
  /** The field is a Aptos Token property */
  token_property?: boolean;
}

export interface OrmFieldData extends OrmFieldConfig {
  /** The resource field name of onchain AptoOrm object */
  name: string;
  /** The resource field type of onchain AptoOrm object */
  type: OrmType;
  /** The field name (property key) in the class */
  property_key: string;
  /** The field type (property type) in the class */
  property_type: any;
  /** whether the field is writable by the user */
  writable: boolean;
  /** whether the field can be updated by the user. update is not supported. */
  immutable: boolean;
}

/** ORM Token configuration */
export type OrmTokenConfig = {
  /** The representative name of the token collection (= Aptos Collection Name) */
  collection_name: string;
  /** The representative URI of the token collection (= Aptos Collection URI) */
  collection_uri: string;
  /** The representative description of the token collection (= Aptos Collection Description) */
  collection_description: string;
  /** The maximum token supply of the AptoORM class (= Aptos Collection Max Supply) */
  max_supply: number | bigint;
  /** Whether the token uses property map */
  token_use_property_map: boolean;
  /** Whether the token has royalty or the collection has royalty itself. */
  royalty_present: boolean;
  /** The payee of the royalty */
  royalty_payee: MaybeHexString | string;
  /** The denominator of the royalty */
  royalty_denominator: number;
  /** The numerator of the royalty */
  royalty_numerator: number;
};

export type OrmObjectConfig = {
  /** The creator address of the object and package */
  package_creator: AptosAccount | MaybeHexString;
  /** The package name where the objects belongs to */
  package_name: string;
  /** Aptos creates named objects with predictable hash addresses, which are derived
   * from user input and the creator's address. This enables named objects to be indexed
   * and traced based on the user input provided by the creator.
   * AptoORM facilitates the creation of indexable objects by utilizing `index_fields`
   * to organize the fields used in the named object creation.
   * Conversely, if index_fields is not set, OrmObject is created with a random address. */
  index_fields?: string[];
  /** Objects created by the class can be transferred by `object::transfer()`. */
  direct_transfer?: boolean;
  /** The creator (The owner of OrmCreator object) can remove the ORM objects. */
  deletable_by_creator?: boolean;
  /** The owner can remove the ORM objects */
  deletable_by_owner?: boolean;
  /** The creator can transfer the ORM objects by AptoORM facilities. */
  indirect_transfer_by_creator?: boolean;
  /** The owner can transfer the ORM objects by AptoORM facilities. */
  indirect_transfer_by_owner?: boolean;
  /** The creator can extend the ORM objects. */
  extensible_by_creator?: boolean;
  /** The owner can extend the ORM objects. */
  extensible_by_owner?: boolean;
  named_addresses?: NamedAddresses;
  /** The token configuration must be set if the OrmObject is Aptos Token object. */
  token_config?: OrmTokenConfig;
};

export interface OrmClassMetadata extends OrmObjectConfig {
  class: OrmObjectLiteral;
  package_address: MaybeHexString; // address of the package
  name: string; // name of the object
  module_name: string; // name of the module
  // type?: OrmType; // address::module::object
  fields: OrmFieldData[]; // fields of the object
  user_fields: OrmFieldData[]; // user fields of the object
  error_code: Map<string, string>; // error code of the object
  use_modules: string[]; // modules used by the object
}

export const APTOS_COIN = '0x1::aptos_coin::AptosCoin';

export type Seq<T> = T[];
export type Uint8 = number;
export type Uint16 = number;
export type Uint32 = number;
export type Uint64 = bigint;
export type Uint128 = bigint;
export type Uint256 = bigint;
export type AnyNumber = bigint | number;
export type Bytes = Uint8Array;

export type OrmFunctionPayload = Types.EntryFunctionPayload;
export type SubmitTransactionRequest = Omit<Types.SubmitTransactionRequest, 'payload'>;

export type OrmTxnOptions = Partial<SubmitTransactionRequest & { payer: AptosAccount | MaybeHexString }>;
export type FeeFreeOrmTxnOptions = Pick<OrmTxnOptions, 'sequence_number' | 'expiration_timestamp_secs'>;

export type PendingTransaction = Types.PendingTransaction;
export interface Signable {
  signBuffer(buffer: Uint8Array): HexString;
  pubKey(): HexString;
  address(): HexString;
  authKey(): HexString;
}
export type OrmTxn = {
  type: 'raw' | 'multi-agent' | 'fee-payer';
  txn:
    | TxnBuilderTypes.RawTransaction
    | TxnBuilderTypes.MultiAgentRawTransaction
    | TxnBuilderTypes.FeePayerRawTransaction;
  auths: (TxnBuilderTypes.AccountAuthenticatorEd25519 | null)[];
  payer_auth?: TxnBuilderTypes.AccountAuthenticatorEd25519 | null;
};

export type HexEncodedBytes = Types.HexEncodedBytes;

export type OrmTxnSerialized = {
  type: 'raw' | 'multi-agent' | 'fee-payer';
  txn: HexEncodedBytes;
  auths: (HexEncodedBytes | null)[];
  payer_auth?: HexEncodedBytes | null;
};

export type NamedAddresses = { [named_address: string]: MaybeHexString };

export type OrmPackageConfig = {
  /** The creator address of the object and package */
  package_creator: AptosAccount | MaybeHexString;
  /** The package name where the objects belongs to */
  package_move_path: string;
  package_name: string;
  ormobjs: Object[];
  named_addresses?: NamedAddresses;
  local_apto_orm_package?: string; // path to local package
};

/**
 * Interface of the simple literal object with any string keys.
 */
export interface OrmObjectLiteral {
  [key: string]: any;
}
export const object_addr = Symbol.for('orm:object:address');
export interface OrmObjectAddressable extends OrmObjectLiteral {
  [object_addr]: MaybeHexString;
}

/**
 * Represents some Type of the Object.
 */
export type OrmObjectType<T> = { new (): T } | Function;

/**
 * OrmObject target.
 */
export type OrmObjectTarget<T> =
  | OrmObjectType<T>
  | OrmObjectLiteral
  | OrmObjectAddressable
  | {
      address: MaybeHexString;
      object: OrmObjectType<T> | OrmObjectLiteral | string;
    };
