import path from 'path';
import fs from 'fs';
import util from 'util';
import { AptosAccount, HexString, MaybeHexString, TxnBuilderTypes, BCS } from 'aptos';
import { OrmObjectConfig, NamedAddresses, HexEncodedBytes, OrmObjectLiteral, OrmObjectTarget, OrmObjectType, OrmOnchainObjectType, OrmClassMetadata, OrmFieldData } from './types';
import { sha3_256 as sha3Hash } from '@noble/hashes/sha3';
import toml from 'toml';
import { getPackageAddress } from './packages';
import { getOrmClassFieldMetadata, getOrmClassMetadata } from './metadata';

export const camelToSnake = (str: string) =>
  str[0].toLowerCase() + str.slice(1, str.length).replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

export function snakeToCamel(input: string, capitalize?: boolean): string {
  return input
    .split(/_|-/)
    .reduce(
      (res, word, i) =>
        i === 0
          ? capitalize
            ? `${word.charAt(0).toUpperCase()}${word.substring(1).toLowerCase()}`
            : word.toLowerCase()
          : `${res}${word.charAt(0).toUpperCase()}${word.substring(1).toLowerCase()}`,
      ''
    );
}

export function retrieveFilesInDir(dir: string, excluded: string[]) {
  const files = fs.readdirSync(dir);
  const found: string[] = [];
  files.forEach(function (file) {
    for (const exclude of excluded) {
      if (file.indexOf(exclude) > 0) return;
    }
    if (!fs.statSync(dir + '/' + file).isDirectory()) {
      found.push(path.join(dir, '/', file));
    }
  });
  return found;
}

export function loadAccountFromPrivatekeyFile(filepath: string): AptosAccount {
  const data = fs.readFileSync(filepath, 'utf8');
  return AptosAccount.fromAptosAccountObject({
    privateKeyHex: data,
  });
}

export function createAccount(): AptosAccount {
  return new AptosAccount();
}

export function ensureAddress(address: string | MaybeHexString) {
  return HexString.ensure(address).toShortString();
}

export function toAddress(signer: AptosAccount | MaybeHexString) {
  return signer instanceof AptosAccount ? signer.address() : HexString.ensure(signer);
}

// [FIXME] This is a temporary solution to get the address of AptoORM.
export function getOrmAddress() {
  return ensureAddress(
    process.env.APTO_ORM_ADDR || '0xfacedd48d64a2ee04cbdf5c17608bd7a5ea9144fa1fe65320c588fffea131de3'
  );
}

export function debug(arg: any) {
  console.log(util.inspect(arg, false, null, true));
}

export function loadToml(toml_path: string) {
  const data = fs.readFileSync(toml_path, 'utf8');
  return toml.parse(data);
}

export function loadMoveToml(path: string) {
  return loadToml(path);
}

export function loadAddresses(config: OrmObjectConfig, throw_error = false) {
  const named_addresses: NamedAddresses = config?.named_addresses || {};
  try {
    named_addresses[config.package_name] = getPackageAddress(config.package_creator, config.package_name);
    named_addresses['apto_orm'] = getOrmAddress();
    return named_addresses;
  } catch (err) {
    if (throw_error) {
      throw err;
    }
  }
  // try {
  //   const move_toml_path = path.join(package_move_path, 'Move.toml');
  //   const move_toml = loadToml(move_toml_path);
  //   if (move_toml?.addresses) {
  //     return move_toml.addresses as NamedAddresses;
  //   }
  // } catch (err) {
  //   if (throw_error) {
  //     throw err;
  //   }
  // }
  return {};
}

// export function loadPackageNames(addresses: NamedAddresses, throw_error = false) {
//   try {
//     const package_address = addresses['package_address'];
//     for (const [key, value] of Object.entries(addresses)) {
//       if (value === package_address && key !== 'package_address') {
//         return key;
//       }
//     }
//     throw new Error('package name not found');
//   } catch (err) {
//     if (throw_error) {
//       throw err;
//     }
//   }
//   return undefined;
// }

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function hexEncodedBytesToUint8Array(b: HexEncodedBytes) {
  if (b === '0x') {
    return new Uint8Array(0);
  }
  try {
    return HexString.ensure(b).toUint8Array();
  } catch (err) {
    throw new Error(`invalid hex-encoded bytes: ${b}`);
  }
}

export function uint8ArrayToHexEncodedBytes(arr: Uint8Array) {
  return HexString.fromUint8Array(arr).toString();
}

export function serializeArgument(arg: any): any {
  if (arg instanceof HexString) {
    return arg.toShortString();
  } else if (arg instanceof Uint8Array) {
    return 'vector<u8>::' + uint8ArrayToHexEncodedBytes(arg);
  } else if (Array.isArray(arg)) {
    return arg.map(serializeArgument) as any;
  }
  return arg;
}

export function deserializeArgument(arg: any): any {
  if (typeof arg === 'string' && arg.startsWith('vector<u8>::')) {
    return hexEncodedBytesToUint8Array(arg.slice('vector<u8>::'.length));
  } else if (Array.isArray(arg)) {
    return arg.map(deserializeArgument) as any;
  }
  return arg;
}

export function stringifyJson(obj: any, space: string | number = 0) {
  return JSON.stringify(obj, function (key, value) {
    if (value instanceof Uint8Array) {
      return 'vector<u8>::' + uint8ArrayToHexEncodedBytes(value);
    }
    return value;
  }, space);
}

export function parseJson(str: string) {
  return JSON.parse(str, function (key, value) {
    if (typeof value === 'string' && value.startsWith('vector<u8>::')) {
      return hexEncodedBytesToUint8Array(value.slice('vector<u8>::'.length));
    }
    return value;
  });
}

export function areUint8ArraysEqual(arr1: Uint8Array, arr2: Uint8Array) {
  if (arr1.length !== arr2.length) {
    return false;
  }
  for (let i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) {
      return false;
    }
  }
  return true;
}

export function getNamedObjectAddress(creator: AptosAccount | MaybeHexString, name: string[]) {
  // let seed = *string::bytes(collection);
  // vector::append(&mut seed, b"::");
  // vector::append(&mut seed, *string::bytes(name));
  const creator_address_hexstring = toAddress(creator);
  const user_address = TxnBuilderTypes.AccountAddress.fromHex(creator_address_hexstring);
  const source = BCS.bcsToBytes(user_address);
  const buffer = Buffer.from(name.join('::'));
  const seed = Uint8Array.from(buffer);
  const bytes = new Uint8Array([...source, ...seed, 0xfe]);
  const hash = sha3Hash.create();
  hash.update(bytes);
  return HexString.fromUint8Array(hash.digest());
}

export function loadOrmClassMetadata<OrmObject extends OrmObjectLiteral>(
  target: OrmObjectTarget<OrmObject>,
  acquire_address: boolean = false,
) {
  let object: OrmObjectLiteral;
  let address: HexString;
  let metadata: OrmClassMetadata;
  if (typeof target === 'function') {
    const orm_class = target as OrmObjectType<OrmObject>;
    metadata = getOrmClassMetadata(orm_class);
  } else {
    if ((target as any).address && (target as any).object) {
      const onchain_obj = target as OrmOnchainObjectType<OrmObject>;
      metadata = getOrmClassMetadata(onchain_obj.object);
      if (acquire_address)
        address = toAddress(onchain_obj.address);
      if (typeof onchain_obj.object === 'object') {
        object = onchain_obj.object;
      }
    } else {
      // typeof target === 'object'
      object = target as OrmObjectLiteral;
      metadata = getOrmClassMetadata(object.constructor);
    }
  }
  if (acquire_address) {
    if (!address) {
      if (metadata.index_fields.length <= 0) {
        throw new Error(`unable to specify object address because it has no index fields`);
      }
      const index_fields = metadata.index_fields.map((field_name) => {
        const field = getOrmClassFieldMetadata(metadata.name, field_name);
        if (field?.constant) {
          return field.constant;
        }
        return (target as any)[field_name];
      });
      if (metadata.token_config) {
        address = getNamedObjectAddress(
          metadata.package_address,
          [metadata.token_config.collection_name, ...index_fields]
        );
      } else {
        address = getNamedObjectAddress(metadata.package_address, index_fields);
      }
    }
  }
  return {
    object,
    address,
    metadata,
  };
}

export function toPrimitiveType(value: any, t: OrmFieldData) {
  if (t.property_type === 'Number') {
    return Number(value);
  } else if (t.property_type === 'BigInt') {
    return BigInt(value);
  } else if (t.property_type === 'Boolean') {
    return !!value;
  } else if (t.property_type === 'String') {
    return String(value);
  }
  return value;
}