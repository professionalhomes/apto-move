#!/usr/bin/env node
import { Command } from 'commander';
import { loadOrmClient, checkPackagePath, loadPackageClasses } from './utilities';
import { AptosAccount, Maybe, MaybeHexString } from 'aptos';
import orm, {
  getPackageAddress,
  loadAccountFromPrivatekeyFile,
  loadOrmClassMetadata,
  parseJson,
  stringifyJson,
} from '../sdk';
import fs from 'fs';
import path from 'path';

export const collection = new Command('collection');
collection.description('Update the ORM class URI and description');
collection
  .command('get')
  .description('get the class & token class info.')
  .requiredOption('-a, --address <ADDRESS>', 'The package address')
  .action(async function () {
    const client = loadOrmClient(collection);
    const { address } = this.opts();
    let package_address: MaybeHexString;
    package_address = address as string;
    const resources = await client.getAccountResources(package_address);
    for (const resource of resources) {
      if (resource.type.startsWith(`${client.ormAddress}::orm_module::OrmModule<`)) {
        const class_type = resource.type.split('<')[1].split('>')[0];
        const class_address = (resource?.data as any)?.class?.inner;
        console.log(`${class_type}: ${class_address}`);
        console.log(await client.getAccountResources(class_address));
      }
    }
  });

collection
  .command('set-uri')
  .description('Set the URI of the ORM Token class')
  .requiredOption('-k, --key <key_file>', 'The private key file of the package owner')
  .option('-a, --address <ADDRESS>', 'The package address')
  .option('-c, --class_name <CLASS_NAME>', 'The name of the ORM Toeken class')
  .option('  , --collection_address <ADDRESS>', 'Use the collection address directly if you know it')
  .requiredOption('-u, --uri <uri>', 'The uri of the ORM Token class')
  .action(async function () {
    const client = loadOrmClient(this);
    const { key, address, uri, class_name, collection_address } = this.opts();
    const package_owner = loadAccountFromPrivatekeyFile(key);
    const resources = await client.getAccountResources(address);
    let target_address: string = collection_address;
    for (const resource of resources) {
      if (resource.type.startsWith(`${client.ormAddress}::orm_module::OrmModule<`)) {
        const class_type = resource.type.split('<')[1].split('>')[0];
        const class_address = (resource?.data as any)?.class?.inner;
        if (class_type.includes(class_name)) {
          target_address = class_address;
          console.log(`matched token class found in ${class_address}`);
          // console.log(await client.getAccountResources(class_address));
          break;
        }
      }
    }
    if (!target_address) {
      throw new Error(`token class ${class_name} not found`);
    }
    const txn = await client.generateOrmTxn([package_owner], {
      function: `${client.ormAddress}::orm_class::set_uri`,
      type_arguments: [`0x1::object::ObjectCore`],
      arguments: [address, uri],
    });
    const ptxn = await client.signAndsubmitOrmTxn([package_owner], txn);
    const txnr = await client.waitForOrmTxnWithResult(ptxn, { timeoutSecs: 30, checkSuccess: true });
    console.log(`txn: ${txnr.hash}`);
  });

// collection
//   .command('set-description')
//   .description('Give a PoA to a delegator account')
//   .requiredOption('-d, --designator <key_file>', 'The private key file of the package owner')
//   .requiredOption('-l, --delegator <key_file>', 'The private key file of the delegator')
//   .option('-e, --expiration <day_offset>', 'The expiration date of the PoA in days from now', '0')
//   .action(async function () {
//     const client = loadOrmClient(this);
//     const { designator, delegator, expiration } = this.opts();
//     const package_owner_account = loadAccountFromPrivatekeyFile(designator);
//     const poa_account = loadAccountFromPrivatekeyFile(delegator);
//     const txn = await orm.registerPoaTxn(client, package_owner_account, poa_account, {
//       expiration_date: expiration,
//       amount: 0,
//     });
//     const ptxn = await client.signAndsubmitOrmTxn([package_owner_account, poa_account], txn);
//     const txnr = await client.waitForOrmTxnWithResult(ptxn, { timeoutSecs: 30, checkSuccess: true });
//     console.log(`txn: ${txnr.hash}`);
//   });

export default collection;
