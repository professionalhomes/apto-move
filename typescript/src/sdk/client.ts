import {
  AptosAccount,
  MaybeHexString,
  TxnBuilderTypes,
  Types,
  HexString,
  TransactionBuilder,
  BCS,
  OptionalTransactionArgs,
  getPropertyValueRaw,
  AptosClient,
  ClientConfig,
} from 'aptos';
import {
  toAddress,
  getOrmAddress,
  loadAddresses,
  hexEncodedBytesToUint8Array,
  areUint8ArraysEqual,
  getNamedObjectAddress,
  loadOrmClassMetadata,
  setOrmObjectAddress,
  toPrimitiveType,
  getOrmObjectAddress,
} from './utilities';
import {
  OrmTxn,
  OrmTxnSerialized,
  OrmTxnOptions,
  PendingTransaction,
  Signable,
  OrmFunctionPayload,
  OrmObjectLiteral,
  OrmObjectTarget,
  OrmObjectType,
  OrmClassMetadata,
  OrmObjectAddressable,
} from './types';
import { getOrmClassMetadata } from './metadata';

export class OrmClient extends AptosClient {
  // private static check(obj: unknown, name: string) {
  //     return (
  //         typeof obj === "object" &&
  //         obj !== null &&
  //         (obj as { "@instanceof": Symbol })["@instanceof"] ===
  //             Symbol.for(name)
  //     )
  // }
  readonly '@instanceof' = Symbol.for('OrmClient');
  private _ORM_ADDRESS: string;
  private _ORM_EVENT_TYPE: string;
  private _ORM_OBJECT_TYPE: string;

  constructor(url_or_config: string, config?: ClientConfig) {
    if (url_or_config === undefined) {
      throw new Error('Aptos Node URL is undefined');
    }
    super(url_or_config, config);
    this._ORM_ADDRESS = getOrmAddress();
    this._ORM_EVENT_TYPE = `${this._ORM_ADDRESS}::orm_class::OrmEvent`;
    this._ORM_OBJECT_TYPE = `${this._ORM_ADDRESS}::orm_object::OrmObject`;
  }

  get ormAddress() {
    return this._ORM_ADDRESS;
  }

  set ormAddress(address: MaybeHexString) {
    this._ORM_ADDRESS = toAddress(address).toShortString();
  }

  get ormEventType() {
    return this._ORM_EVENT_TYPE;
  }

  async getAccountSequenceNumber(address: MaybeHexString) {
    const account_data = await this.getAccount(address);
    return BigInt(account_data.sequence_number);
  }

  async generateOrmTxn(
    signers: (AptosAccount | MaybeHexString)[],
    payload: OrmFunctionPayload,
    options?: OrmTxnOptions
  ): Promise<OrmTxn> {
    if (signers.length === 0) {
      throw new Error('No signers provided');
    }
    const [sender, ...others] = signers;
    const sender_address = toAddress(signers[0]);
    const auths: (TxnBuilderTypes.AccountAuthenticatorEd25519 | null)[] = [];
    const rawtxn = await this.generateTransaction(sender_address, payload, options);
    if (signers.length === 1 && !options?.payer) {
      if (sender instanceof AptosAccount) {
        const signable = sender as Signable;
        const signature = sender.signBuffer(TransactionBuilder.getSigningMessage(rawtxn));
        auths.push(
          new TxnBuilderTypes.AccountAuthenticatorEd25519(
            new TxnBuilderTypes.Ed25519PublicKey(sender.pubKey().toUint8Array()),
            new TxnBuilderTypes.Ed25519Signature(signature.toUint8Array())
          )
        );
      } else {
        auths.push(null);
      }
      return {
        type: 'raw',
        txn: rawtxn,
        auths: auths,
      };
    }
    let payer_auth: TxnBuilderTypes.AccountAuthenticatorEd25519 | null = null;
    const secondary_addresses = others.map((o) => TxnBuilderTypes.AccountAddress.fromHex(toAddress(o)));
    let mtxn: TxnBuilderTypes.MultiAgentRawTransaction | TxnBuilderTypes.FeePayerRawTransaction;
    if (options?.payer) {
      const payer_address = toAddress(options.payer);
      mtxn = new TxnBuilderTypes.FeePayerRawTransaction(
        rawtxn,
        secondary_addresses,
        TxnBuilderTypes.AccountAddress.fromHex(payer_address)
      );
    } else {
      mtxn = new TxnBuilderTypes.MultiAgentRawTransaction(rawtxn, secondary_addresses);
    }
    for (const s of signers) {
      if (s instanceof AptosAccount) {
        auths.push(await this.signMultiTransaction(s as AptosAccount, mtxn));
      } else {
        auths.push(null);
      }
    }
    if (options?.payer && options.payer instanceof AptosAccount) {
      payer_auth = await this.signMultiTransaction(options.payer, mtxn);
    }
    return {
      type: options?.payer ? 'fee-payer' : 'multi-agent',
      txn: mtxn,
      auths,
      payer_auth,
    };
  }

  async signOrmTxn(signers: (AptosAccount | MaybeHexString)[], ormtxn: OrmTxn, options?: Pick<OrmTxnOptions, 'payer'>) {
    const auths = ormtxn.auths;
    for (let i = 0; i < auths.length; i++) {
      if (!auths[i]) {
        if (signers.length <= i) continue;
        const s = signers[i];
        if (s instanceof AptosAccount) {
          // const signable = sender as Signable;
          const signature = s.signBuffer(TransactionBuilder.getSigningMessage(ormtxn.txn));
          ormtxn.auths[i] = new TxnBuilderTypes.AccountAuthenticatorEd25519(
            new TxnBuilderTypes.Ed25519PublicKey(s.pubKey().toUint8Array()),
            new TxnBuilderTypes.Ed25519Signature(signature.toUint8Array())
          );
        }
        // else {
        //   throw new Error(`${i + 1}th signer missing`);
        // }
      }
    }
    if (ormtxn.type === 'fee-payer') {
      const txn = ormtxn.txn as TxnBuilderTypes.FeePayerRawTransaction;
      if (!ormtxn.payer_auth) {
        if (options?.payer && options.payer instanceof AptosAccount) {
          const payer = options.payer;
          if (!areUint8ArraysEqual(txn.fee_payer_address.address, payer.address().toUint8Array())) {
            throw new Error(`payer address mismatch`);
          }
          const signature = payer.signBuffer(TransactionBuilder.getSigningMessage(ormtxn.txn));
          ormtxn.payer_auth = new TxnBuilderTypes.AccountAuthenticatorEd25519(
            new TxnBuilderTypes.Ed25519PublicKey(payer.pubKey().toUint8Array()),
            new TxnBuilderTypes.Ed25519Signature(signature.toUint8Array())
          );
        }
      }
    }
    return ormtxn;
  }

  async submitOrmTxn(ormtxn: OrmTxn): Promise<PendingTransaction> {
    const [sender, ...others] = ormtxn.auths;
    if (!sender) {
      throw new Error(`sender signature missing`);
    }
    for (const auth of others) {
      if (!auth) throw new Error(`secondary signature missing`);
    }
    switch (ormtxn.type) {
      case 'raw': {
        const rawtxn = ormtxn.txn as TxnBuilderTypes.RawTransaction;
        const serialized = BCS.bcsToBytes(new TxnBuilderTypes.SignedTransaction(rawtxn, sender));
        return await this.submitTransaction(serialized);
      }
      case 'fee-payer': {
        const txn = ormtxn.txn as TxnBuilderTypes.FeePayerRawTransaction;
        if (!ormtxn.payer_auth) {
          throw new Error(`payer_auth missing in fee payer transaction`);
        }
        const txn_auth = new TxnBuilderTypes.TransactionAuthenticatorFeePayer(
          sender,
          txn.secondary_signer_addresses,
          others,
          { address: txn.fee_payer_address, authenticator: ormtxn.payer_auth }
        );
        const serialized = BCS.bcsToBytes(new TxnBuilderTypes.SignedTransaction(txn.raw_txn, txn_auth));
        return await this.submitTransaction(serialized);
      }
      case 'multi-agent': {
        const txn = ormtxn.txn as TxnBuilderTypes.MultiAgentRawTransaction;
        const txn_auth = new TxnBuilderTypes.TransactionAuthenticatorMultiAgent(
          sender,
          txn.secondary_signer_addresses,
          others
        );
        const serialized = BCS.bcsToBytes(new TxnBuilderTypes.SignedTransaction(txn.raw_txn, txn_auth));
        return await this.submitTransaction(serialized);
      }
      default:
        throw new Error(`unknown txn type ${ormtxn.type}`);
    }
  }

  async waitForOrmTxnWithResult(
    pending: { hash: string },
    extrargs?: {
      timeoutSecs?: number;
      checkSuccess?: boolean;
    }
  ) {
    return await this.waitForTransactionWithResult(pending.hash, extrargs);
  }

  async waitForOrmTxnsWithResult(
    pendings: { hash: string }[],
    extrargs?: {
      timeoutSecs?: number;
      checkSuccess?: boolean;
    }
  ) {
    return await Promise.all(
      pendings.map(async (pending) => {
        return await this.waitForTransactionWithResult(pending.hash, extrargs);
      })
    );
  }

  async signAndsubmitOrmTxn(
    signers: (AptosAccount | MaybeHexString)[],
    ormtxn: OrmTxn,
    options?: Pick<OrmTxnOptions, 'payer'>
  ) {
    const signed = await this.signOrmTxn(signers, ormtxn, options);
    return await this.submitOrmTxn(signed);
  }

  async signAndsubmitOrmTxns(
    signers: (AptosAccount | MaybeHexString)[],
    ormtxns: OrmTxn[],
    options?: Pick<OrmTxnOptions, 'payer'>
  ) {
    return await Promise.all(
      ormtxns.map(async (ormtxn) => {
        const signed = await this.signOrmTxn(signers, ormtxn, options);
        return await this.submitOrmTxn(signed);
      })
    );
  }

  async waitForOrmTxn(
    pending: { hash: string },
    extrargs?: {
      timeoutSecs?: number;
      checkSuccess?: boolean;
    }
  ) {
    return await this.waitForTransaction(pending.hash, extrargs);
  }

  async waitForOrmTxns(
    pendings: { hash: string }[],
    extrargs?: {
      timeoutSecs?: number;
      checkSuccess?: boolean;
    }
  ) {
    return await Promise.all(
      pendings.map(async (ptxn) => {
        return await this.waitForTransaction(ptxn.hash, extrargs);
      })
    );
  }

  async signSubmitAndWaitOrmTxn(
    signers: (AptosAccount | MaybeHexString)[],
    ormtxn: OrmTxn,
    options?: Pick<OrmTxnOptions, 'payer'>,
    extrargs?: {
      timeoutSecs?: number;
      checkSuccess?: boolean;
    }
  ) {
    const signed = await this.signOrmTxn(signers, ormtxn, options);
    const ptxn = await this.submitOrmTxn(signed);
    await this.waitForOrmTxn(ptxn, extrargs);
    return ptxn;
  }

  async signSubmitAndWaitOrmTxns(
    signers: (AptosAccount | MaybeHexString)[],
    ormtxns: OrmTxn[],
    options?: Pick<OrmTxnOptions, 'payer'>,
    extrargs?: {
      timeoutSecs?: number;
      checkSuccess?: boolean;
    }
  ) {
    return await Promise.all(
      ormtxns.map(async (ormtxn) => {
        const signed = await this.signOrmTxn(signers, ormtxn, options);
        const ptxn = await this.submitOrmTxn(signed);
        await this.waitForOrmTxn(ptxn, extrargs);
        return ptxn;
      })
    );
  }

  async signSubmitAndWaitOrmTxnWithResult(
    signers: (AptosAccount | MaybeHexString)[],
    ormtxn: OrmTxn,
    options?: Pick<OrmTxnOptions, 'payer'>,
    extrargs?: {
      timeoutSecs?: number;
      checkSuccess?: boolean;
    }
  ) {
    const signed = await this.signOrmTxn(signers, ormtxn, options);
    const ptxn = await this.submitOrmTxn(signed);
    return await this.waitForOrmTxnWithResult(ptxn, extrargs);
  }

  async signSubmitAndWaitOrmTxnsWithResult(
    signers: (AptosAccount | MaybeHexString)[],
    ormtxns: OrmTxn[],
    options?: Pick<OrmTxnOptions, 'payer'>,
    extrargs?: {
      timeoutSecs?: number;
      checkSuccess?: boolean;
    }
  ) {
    return await Promise.all(
      ormtxns.map(async (ormtxn) => {
        const signed = await this.signOrmTxn(signers, ormtxn, options);
        const ptxn = await this.submitOrmTxn(signed);
        return await this.waitForOrmTxnWithResult(ptxn, extrargs);
      })
    );
  }

  createTxnPayload<OrmObject extends OrmObjectLiteral>(obj: OrmObjectTarget<OrmObject>) {
    const { metadata, object } = loadOrmClassMetadata(obj);
    const fields = metadata.fields;
    const args: any[] = [];
    const type_args: string[] = [];
    fields.forEach((field) => {
      if (!field.writable) return;
      const value = object[field.property_key];
      if (value === undefined) {
        throw new Error(`OrmField '${field.property_key}' is not defined`);
      }
      args.push(object[field.property_key]);
    });
    if (!metadata.package_address) {
      throw new Error(`package address is not defined`);
    }
    return {
      function: `${metadata.package_address}::${metadata.module_name}::create`,
      type_arguments: type_args,
      arguments: args,
    };
  }

  async createTxn<OrmObject extends OrmObjectLiteral>(
    user: AptosAccount | MaybeHexString,
    obj: OrmObjectTarget<OrmObject>,
    options?: OrmTxnOptions
  ) {
    return await this.generateOrmTxn([user], this.createTxnPayload(obj), options);
  }

  createToTxnPayload<OrmObject extends OrmObjectLiteral>(obj: OrmObjectTarget<OrmObject>, to: MaybeHexString) {
    const { metadata, object } = loadOrmClassMetadata(obj);
    const fields = metadata.fields;
    const args: any[] = [];
    const type_args: string[] = [];
    fields.forEach((field) => {
      if (!field.writable) return;
      const value = object[field.property_key];
      if (value === undefined) {
        throw new Error(`OrmField '${field.property_key}' is not defined`);
      }
      args.push(object[field.property_key]);
    });
    args.push(to);
    if (!metadata.package_address) {
      throw new Error(`package address is not defined`);
    }
    return {
      function: `${metadata.package_address}::${metadata.module_name}::create_to`,
      type_arguments: type_args,
      arguments: args,
    };
  }

  async createToTxn<OrmObject extends OrmObjectLiteral>(
    user: AptosAccount | MaybeHexString,
    obj: OrmObjectTarget<OrmObject>,
    to: MaybeHexString,
    options?: OrmTxnOptions
  ) {
    return await this.generateOrmTxn([user], this.createToTxnPayload(obj, to), options);
  }

  updateTxnPayload<OrmObject extends OrmObjectLiteral>(obj: OrmObjectTarget<OrmObject>) {
    const { address, metadata, object } = loadOrmClassMetadata(obj, true);
    const fields = metadata.fields;
    const args: any[] = [address];
    const type_args: string[] = [];
    fields.forEach((field) => {
      if (field.index || !field.writable || field.immutable) return;
      const value = object[field.property_key as keyof OrmObjectLiteral];
      if (value === undefined) {
        throw new Error(`OrmField '${field.property_key}' is not defined`);
      }
      args.push(object[field.property_key as keyof OrmObjectLiteral]);
    });
    if (!metadata.package_address) {
      throw new Error(`package address is not defined`);
    }
    return {
      function: `${metadata.package_address}::${metadata.module_name}::update`,
      type_arguments: type_args,
      arguments: args,
    };
  }

  async updateTxn<OrmObject extends OrmObjectLiteral>(
    user: AptosAccount | MaybeHexString,
    obj: OrmObjectTarget<OrmObject>,
    options?: OrmTxnOptions
  ) {
    return await this.generateOrmTxn([user], this.updateTxnPayload(obj), options);
  }

  deleteTxnPayload<OrmObject extends OrmObjectLiteral>(obj: OrmObjectTarget<OrmObject>) {
    const { address, metadata } = loadOrmClassMetadata(obj, true);
    const args: any[] = [address];
    const type_args: string[] = [];
    if (!metadata.package_address) {
      throw new Error(`package address is not defined`);
    }
    return {
      function: `${metadata.package_address}::${metadata.module_name}::delete`,
      type_arguments: type_args,
      arguments: args,
    };
  }

  async deleteTxn<OrmObject extends OrmObjectLiteral>(
    user: AptosAccount | MaybeHexString,
    obj: OrmObjectTarget<OrmObject>,
    options?: OrmTxnOptions
  ) {
    return await this.generateOrmTxn([user], this.deleteTxnPayload(obj), options);
  }

  async transferForciblyTxn<OrmObject extends OrmObjectLiteral>(
    user: AptosAccount | MaybeHexString,
    obj: OrmObjectTarget<OrmObject> | MaybeHexString,
    to: MaybeHexString,
    options?: OrmTxnOptions) {
      let address: MaybeHexString;
      if (obj instanceof HexString) {
        address = obj;
      } else if (typeof obj === 'string') {
        address = obj;
      }
      else {
        const { address: _address } = loadOrmClassMetadata(obj, true);
        address = _address;
      }
      return await this.generateOrmTxn(
        [user],
        {
          function: `${this.ormAddress}::orm_object::transfer_forcibly`,
          type_arguments: [`0x1::object::ObjectCore`],
          arguments: [address, to],
        },
        options
      );
  }

  async transferCoinsTxn(
    sender: AptosAccount | MaybeHexString,
    receiver: MaybeHexString,
    amount: number | bigint,
    options?: OrmTxnOptions
  ) {
    return await this.generateOrmTxn(
      [sender],
      {
        function: `0x1::aptos_account::transfer`,
        type_arguments: [],
        arguments: [receiver, String(amount)],
      },
      options
    );
  }

  async getObject<OrmObject extends OrmObjectLiteral>(obj: OrmObjectTarget<OrmObject>, raise_error: boolean = true) {
    try {
      const { address, metadata } = loadOrmClassMetadata(obj, true);
      const fields = metadata.fields;
      if (!metadata.package_address || !metadata.module_name) {
        throw new Error(`package address is not defined`);
      }
      const rvalues = await this.view({
        function: `${metadata.package_address}::${metadata.module_name}::get`,
        type_arguments: [],
        arguments: [address.toShortString()],
      });
      const dataobj = Object.create((metadata.class as any).prototype);
      rvalues.forEach((r, i) => {
        const field = fields[i];
        dataobj[field.property_key as keyof OrmObjectLiteral] = toPrimitiveType(r, field);
      });
      setOrmObjectAddress(dataobj, address);
      return dataobj as OrmObject & OrmObjectAddressable;
    } catch (e) {
      if (raise_error) {
        throw e;
      }
      return undefined;
    }
  }

  getAddress<OrmObject extends OrmObjectLiteral>(obj: OrmObjectTarget<OrmObject>, raise_error: boolean = true) {
    try {
      const addr = getOrmObjectAddress(obj);
      if (!addr) {
        const { address } = loadOrmClassMetadata(obj, true);
        return address;
      }
      return addr as string;
    } catch (e) {
      if (raise_error) {
        throw e;
      }
      return undefined;
    }
  }

  retrieveOrmObjectAddressesFromTxnr<OrmObject extends OrmObjectLiteral>(
    txnr: any,
    filter?: {
      event_type?: 'created' | 'deleted';
      object_type?: OrmObjectType<OrmObject> | OrmObjectLiteral | string;
      change_type?: 'write_resource' | 'delete_resource';
    }
  ) {
    const addresses: string[] = [];
    if (filter?.event_type) {
      if (txnr?.events) {
        for (const event of txnr.events) {
          if (event?.type === this.ormEventType) {
            if (event?.data?.event_type === filter.event_type) {
              if (event?.data?.object) {
                addresses.push(event.data.object as string);
              }
            }
          }
        }
      }
      return [...new Set(addresses)];
    }
    let metadata: OrmClassMetadata;
    let search_resource: string;
    const change_type = filter?.change_type;
    if (filter?.object_type) {
      metadata = getOrmClassMetadata(filter.object_type);
      search_resource = `${metadata.package_address}::${metadata.module_name}::${metadata.name}`;
    }
    // [FIXME] delete_resource is not working due to no data in the change.
    if (txnr?.changes) {
      for (const change of txnr.changes) {
        if (!change?.data || !change?.type) continue;
        if (change_type && change.type !== change_type) continue;
        const resource_type = change.data?.type as string;
        let changed: string = undefined;
        if (search_resource && resource_type === search_resource) {
          if (change?.data?.object) {
            changed = change.data.object;
          }
        } else if (resource_type == this._ORM_OBJECT_TYPE) {
          changed = change.address;
        }
        if (changed) {
          addresses.push(changed);
        }
      }
    }
    return [...new Set(addresses)];
  }

  retrieveOrmObjectAddressFromTxnr<OrmObject extends OrmObjectLiteral>(
    txnr: any,
    filter?: {
      event_type?: 'created' | 'deleted';
      object_type?: OrmObjectType<OrmObject> | OrmObjectLiteral | string;
      change_type?: 'write_resource' | 'delete_resource';
    }
  ) {
    const addresses = this.retrieveOrmObjectAddressesFromTxnr(txnr, filter);
    if (addresses.length > 1) {
      throw new Error(`multiple addresses found`);
    }
    return addresses[0];
  }
}
