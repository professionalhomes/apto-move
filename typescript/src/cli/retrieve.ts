#!/usr/bin/env node
import { Command } from 'commander';
import { loadOrmClient, checkPackagePath, loadPackageClasses } from './utilities';
import { AptosAccount, Maybe, MaybeHexString } from 'aptos';
import orm, {
  getOrmPackageCreator,
  getPackageAddress,
  loadAccountFromPrivatekeyFile,
} from '../sdk';
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

export function loadPackageAddress(program: Command) {
  const { key, address, creator, name } = program.optsWithGlobals();
  const package_path = program.opts()?.path || program.args[0];
  let package_name = name || package_path ? path.basename(package_path) : undefined;
  let package_creator = creator;
  let package_address: MaybeHexString = address as string;
  // console.log({ package_path, package_name, package_creator, package_address});
  if (!package_address) {
    if (creator && name) {
      package_address = getPackageAddress(creator, name);
    } else if (package_name) {
      let package_owner: AptosAccount;
      if (key) {
        package_owner = loadAccountFromPrivatekeyFile(key);
        package_address = getPackageAddress(package_owner.address(), package_name);
      } else {
        if (!package_creator) package_creator = getOrmPackageCreator(package_name);
        package_address = getPackageAddress(package_creator, package_name);
      }
    }
    // console.log({ package_address })
  }
  if (!package_creator) {
    if (package_name) package_creator = getOrmPackageCreator(package_name);
  }
  if (!package_address) {
    throw new Error(`package address not specified`);
  }
  return [package_creator, package_name, package_address] as [string, string, string];
}

export const retrieve = new Command('retrieve');
retrieve
  .description('retrieve your AptoORM package information')
  .argument('[package_path]', 'The package path')
  .option('-p, --path <package_path>', 'The package path')
  .option('-k, --key <key_file>', 'The private key file of the package owner')
  .option('-a, --address <ADDRESS>', 'The package address')
  .option('-c, --creator <ADDRESS>', 'The package creator')
  .option('-n, --name <PACKAGE_NAME>', 'The name of the package')
  .option('  , --class_name <CLASS_NAME>', 'The class name included in the package')
  .action(async function () {
    const client = loadOrmClient(retrieve);
    const { class_name } = this.opts();
    const [package_creator, package_name, package_address] = loadPackageAddress(this);
    const output: any = {
      package_creator,
      package_name,
      package_address,
      package_classes: {},
    };
    const resources = await client.getAccountResources(package_address);
    for (const resource of resources) {
      if (resource.type.startsWith(`${client.ormAddress}::orm_module::OrmModule<`)) {
        const full_class_type = resource.type.split('<')[1].split('>')[0];
        const class_address = (resource?.data as any)?.class?.inner;
        const signer_address = (resource?.data as any)?.signer?.inner;
        const class_type = full_class_type.split('::')[2];
        if (class_name && class_type !== class_name) continue;
        output['package_classes'][class_type] = {
          class_type: full_class_type,
          class_address,
          signer_address,
          resources: class_name ? await client.getAccountResources(class_address) : undefined,
        };
      }
    }
    console.log(YAML.stringify({ retrieved: output }));
  });

export default retrieve;
