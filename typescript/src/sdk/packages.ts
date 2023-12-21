import { MaybeHexString, AptosAccount, TxnBuilderTypes, HexString, BCS, Types } from 'aptos';
import { OrmPackageConfig, OrmTxn, OrmTxnOptions } from './types';
import { execSync } from 'child_process';
import {
  retrieveFilesInDir,
  snakeToCamel,
  getOrmAddress,
  debug,
  camelToSnake,
  loadAddresses,
  sleep,
  toAddress,
  getNamedObjectAddress,
} from './utilities';
import path from 'path';
import fs from 'fs';
import { OrmClient } from './client';
import { generateMove } from './gen-move';
import { generateMoveToml } from './gen-toml';
import { getOrmClassMetadata } from './metadata';
import { sha3_256 as sha3Hash } from '@noble/hashes/sha3';


const MAXIMUM_TRANSACTION_SIZE = 62000;

export function getPackageAddress(package_creator: AptosAccount | MaybeHexString, package_name: string) {
  return getNamedObjectAddress(package_creator, [package_name]);
}

export async function createPackageTxn(
  client: OrmClient,
  user: AptosAccount | MaybeHexString,
  package_name: string,
  options?: OrmTxnOptions
) {
  const fname = `${client.ormAddress}::package::create_package`;
  const args: any[] = [package_name];
  const type_args: string[] = [];
  return await client.generateOrmTxn(
    [user],
    {
      function: fname,
      type_arguments: type_args,
      arguments: args,
    },
    options
  );
}

export async function publishPackageTxn(
  client: OrmClient,
  user: AptosAccount | MaybeHexString,
  package_address: MaybeHexString,
  metadata: Uint8Array,
  code_indices: (bigint | number | string)[],
  code_chunks: Uint8Array[],
  publish: boolean,
  cleanup: boolean,
  options?: OrmTxnOptions
) {
  const fname = `${client.ormAddress}::package::publish_package`;
  const args: any[] = [package_address, metadata, code_indices, code_chunks, publish, cleanup];
  const type_args: string[] = [];
  return await client.generateOrmTxn(
    [user],
    {
      function: fname,
      type_arguments: type_args,
      arguments: args,
    },
    options
  );
}

export async function createAndPublishPackageTxn(
  client: OrmClient,
  user: AptosAccount | MaybeHexString,
  package_name: string,
  metadata: Uint8Array,
  code_indices: (bigint | number | string)[],
  code_chunks: Uint8Array[],
  publish: boolean,
  cleanup: boolean,
  options?: OrmTxnOptions
) {
  const fname = `${client.ormAddress}::package::create_and_publish_package`;
  const args: any[] = [package_name, metadata, code_indices, code_chunks, publish, cleanup];
  const type_args: string[] = [];
  return await client.generateOrmTxn(
    [user],
    {
      function: fname,
      type_arguments: type_args,
      arguments: args,
    },
    options
  );
}

export async function mayCreateAndPublishPackageTxn(
  client: OrmClient,
  user: AptosAccount | MaybeHexString,
  package_name: string,
  package_address: MaybeHexString,
  metadata: Uint8Array,
  code_indices: (bigint | number | string)[],
  code_chunks: Uint8Array[],
  publish: boolean,
  cleanup: boolean,
  options?: OrmTxnOptions
) {
  let package_created = undefined;
  if (cleanup) {
    package_created = await client
      .getAccountResource(package_address, `${client.ormAddress}::orm_creator::OrmCreator`)
      .catch(() => undefined);
  }
  if (!package_created) {
    return await createAndPublishPackageTxn(
      client,
      user,
      package_name,
      metadata,
      code_indices,
      code_chunks,
      publish,
      cleanup,
      options
    );
  } else {
    return await publishPackageTxn(
      client,
      user,
      package_address,
      metadata,
      code_indices,
      code_chunks,
      publish,
      cleanup,
      options
    );
  }
}

export function compilePackage(config: Pick<OrmPackageConfig, 'package_move_path' | 'named_addresses'>) {
  const { package_move_path, named_addresses } = config;
  if (!package_move_path) {
    throw new Error('package_move_path is required');
  }
  try {
    execSync('aptos --version');
  } catch (err) {
    throw new Error(
      'install aptos-cli through the command `curl -fsSL "https://aptos.dev/scripts/install_cli.py" | python3`'
    );
  }
  let command = `cd ${package_move_path} && aptos move compile --bytecode-version 6 --save-metadata`;
  const address = Object.entries(named_addresses || {}).map(([name, addr]) => `${name}=${addr}`);
  if (address.length > 0) command = command + ` --named-addresses ${address.join(',')}`;
  try {
    execSync(command, { timeout: 40000 });
  } catch (err) {
    console.log(err.stdout.toString()); // err.stderr.toString()
    throw new Error(err.stdout.toString());
  }
}

export function generatePackage(config: OrmPackageConfig) {
  const { package_creator, package_name, package_move_path, named_addresses, ormobjs, local_apto_orm_package } = config;
  if (!package_creator) {
    throw new Error('package_creator is required');
  }
  if (!package_name) {
    throw new Error('package_name is required');
  }
  if (!package_move_path) {
    throw new Error('package_move_path is required');
  }
  if (package_name.includes('-')) {
    throw new Error('package_name should not include `-`');
  }
  const package_address = getPackageAddress(package_creator, package_name);
  generateMoveToml(package_move_path, package_name, package_address, local_apto_orm_package);
  for (const o of ormobjs) {
    const classdata = getOrmClassMetadata(o);
    classdata.named_addresses = named_addresses;
    classdata.package_address = package_address;
    generateMove(package_move_path, package_name, classdata);
  }
}

/**
 * Generate the target package to publish it to the Aptos Blockchain.
 * @param client The client to connect to Aptos
 * @param user The user account
 * @param package_name The package name of the move source code
 * @param package_move_path The package path of the move source code
 * @returns
 */
export async function publishPackageTxns(
  client: OrmClient,
  user: AptosAccount,
  config: Pick<OrmPackageConfig, 'package_creator' | 'package_name' | 'package_move_path' | 'named_addresses'>,
  options?: OrmTxnOptions
) {
  const { package_creator, package_name, package_move_path, named_addresses } = config;
  if (!package_creator) {
    throw new Error('package_creator is required');
  }
  if (!package_name) {
    throw new Error('package_name is required');
  }
  if (!package_move_path) {
    throw new Error('package_move_path is required');
  }
  if (package_name.includes('-')) {
    throw new Error('package_name should not include `-`');
  }
  const package_address = getPackageAddress(package_creator, package_name);
  const packageName = snakeToCamel(package_name, true);
  const mpath = path.join(package_move_path, 'build', packageName, 'package-metadata.bcs');
  if (!fs.existsSync(mpath)) {
    compilePackage({ package_move_path, named_addresses });
  }
  const modules: any[] = [];
  const modules_bytes: Uint8Array[] = [];
  const _metadata = fs.readFileSync(mpath);
  const mbytes = new HexString(_metadata.toString('hex')).toUint8Array();
  let total_size = mbytes.length;
  const files = retrieveFilesInDir(path.join(package_move_path, 'build', packageName, 'bytecode_modules'), [
    'dependencies',
  ]);
  for (const file of files) {
    const moduleData = fs.readFileSync(file);
    const moduleBytes = new HexString(moduleData.toString('hex')).toUint8Array();
    total_size += moduleBytes.length;
    modules.push(new TxnBuilderTypes.Module(moduleBytes));
    modules_bytes.push(moduleBytes);
  }
  const create_chunks = (data: Uint8Array) => {
    const chunks: Uint8Array[] = [];
    let read_index = 0;
    while (read_index < data.length) {
      const start_index = read_index;
      read_index = Math.min(read_index + MAXIMUM_TRANSACTION_SIZE, data.length);
      const taken_data = data.slice(start_index, read_index);
      chunks.push(taken_data);
    }
    return chunks;
  };
  // Chunk the metadata and insert it into ormtxns. The last chunk may be small enough
  // to be placed with other data. This may also be the only chunk.
  let sequence_number: string;
  try {
    const account_data = await client.getAccount(user.address());
    sequence_number = account_data.sequence_number;
  } catch (err) {
    throw err;
    // if (err.error_code != 'account_not_found') {
    //   throw err;
    // }
    // if (!options?.payer) {
    //   throw new Error("user account doesn't exist, please provide a payer account");
    // }
    // sequence_number = '0';
  }
  let _cleanup = true;
  const cleanup = () => {
    if (_cleanup) {
      _cleanup = false;
      return true;
    }
    return false;
  };
  let seq = Number(sequence_number);
  const ormtxns: OrmTxn[] = [];
  const metadata_chunks = create_chunks(mbytes);
  for (const metadata_chunk of metadata_chunks.slice(0, -1)) {
    // payer in options produces a fee-payer transaction
    ormtxns.push(
      await mayCreateAndPublishPackageTxn(
        client,
        user,
        package_name,
        package_address,
        metadata_chunk,
        [],
        [],
        false,
        cleanup(),
        {
          sequence_number: String(seq++),
          payer: options?.payer,
        }
      )
    );
  }
  let metadata_chunk = metadata_chunks[metadata_chunks.length - 1];
  let taken_size = metadata_chunk.length;
  let modules_indices: number[] = [];
  let data_chunks: Uint8Array[] = [];

  // Chunk each module and place them into a ormtxn when adding more would exceed the
  // maximum transaction size.
  for (let idx = 0; idx < modules.length; idx++) {
    const module = modules_bytes[idx];
    const chunked_module = create_chunks(module);
    for (const chunk of chunked_module) {
      if (taken_size + chunk.length > MAXIMUM_TRANSACTION_SIZE) {
        ormtxns.push(
          await mayCreateAndPublishPackageTxn(
            client,
            user,
            package_name,
            package_address,
            metadata_chunk,
            modules_indices,
            data_chunks,
            false,
            cleanup(),
            {
              sequence_number: String(seq++),
              payer: options?.payer,
            }
          )
        );
        metadata_chunk = new Uint8Array();
        modules_indices = [];
        data_chunks = [];
        taken_size = 0;
      }
      if (!modules_indices.includes(idx)) {
        modules_indices.push(idx);
      }
      data_chunks.push(chunk);
      taken_size += chunk.length;
    }
  }
  // There will almost certainly be left over data from the chunking, so pass the last
  // chunk for the sake of publishing.
  ormtxns.push(
    await mayCreateAndPublishPackageTxn(
      client,
      user,
      package_name,
      package_address,
      metadata_chunk,
      modules_indices,
      data_chunks,
      true,
      cleanup(),
      {
        sequence_number: String(seq++),
        payer: options?.payer,
      }
    )
  );
  return ormtxns;
}
