#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import orm, {
  OrmClient,
  OrmFreePostpayClient,
  OrmFreePrepayClient,
  getOrmPackageCreator,
  loadAccountFromPrivatekeyFile,
  toAddress,
} from '../sdk';
import { AptosAccount } from 'aptos';
import yaml from 'yaml';
import { loadBaseObjectString, loadBaseTokenString } from './classes';
import { loadOrmClient, checkPackagePath, loadPackageClasses, getNodeUrl } from './utilities';
import { poa } from './poa';

export const program = new Command();
program.version('1.0.0');
program.name('aptorm');
program.description('Aptos Onchain Move ORM (Object–relational mapping)');
program.option('-n, --node_url <node_url>', 'Aptos Node URL');
program.option('  , --prepay_url <prepay_url>', 'The free prepay URL');
program.option('  , --postpay_url <postpay_url>', 'The free postpay URL');

program
  .command('create-account')
  .description('Create a new Aptos account for package owner')
  .option('-k, --key <key_file>', 'The private key file of the package owner')
  .option('-r, --random_key <key_name>', 'Randomly generate the private key file of the package owner')
  // .option('-f, --fund', 'Request to fund Aptos Coin for AptoORM operation', false)
  .action(async function () {
    const client = loadOrmClient(program);
    if (!(client instanceof OrmFreePrepayClient) && !(client instanceof OrmFreePostpayClient)) {
      throw new Error('create-account is only supported in free prepay/postpay mode');
    }
    const { random_key, key } = this.opts();
    let account: AptosAccount;
    if (key) {
      account = loadAccountFromPrivatekeyFile(key);
    } else if (random_key) {
      if (fs.existsSync(path.resolve(process.cwd(), `.key/${random_key}`))) {
        account = loadAccountFromPrivatekeyFile(`.key/${random_key}`);
      } else {
        account = new AptosAccount();
        const dotkey = path.resolve(process.cwd(), `.key`);
        if (!fs.existsSync(dotkey)) {
          fs.mkdirSync(dotkey, { recursive: true });
        }
        const keyobj = account.toPrivateKeyObject();
        fs.writeFileSync(path.resolve(dotkey, `${random_key}`), keyobj.privateKeyHex.toUpperCase().slice(2));
        fs.writeFileSync(path.resolve(dotkey, `${random_key}.pub`), keyobj.publicKeyHex.toUpperCase().slice(2));
        console.log(`The package key file is generated to ${path.resolve(dotkey, `${random_key}`)}.`);
      }
    }
    const pending = await client.createAccount(account.address().toShortString());
    const txnr = await client.waitForOrmTxnWithResult(pending, { timeoutSecs: 30, checkSuccess: true });
    console.log(`txn: ${txnr.hash}`);
  });

program
  .command('init')
  .description('Initialize onchain move package and create a sample class')
  .argument('<package_path>', 'The AptoORM package path and name')
  .option('-c, --classes [classes...]', 'The class names to create e.g. -c BaseObject')
  .option('-k, --key <key_file>', 'The private key file of the package owner')
  .option('-r, --random_key', 'Randomly generate the private key file of the package owner', true)
  .option('-t, --token', 'Generate a sample token class in the package instead of a sample object class', false)
  .option('  , --update_tsconfig', 'Update tsconfig.json file for AptoORM usage', false)
  .action(async function () {
    const { classes, random_key, key, token, update_tsconfig } = this.opts();
    const update_profile = false;
    let package_name: string;
    let package_path: string = this.args[0];
    [package_path, package_name] = checkPackagePath(package_path);
    let package_owner: AptosAccount;
    if (key) {
      package_owner = loadAccountFromPrivatekeyFile(key);
    } else if (random_key) {
      if (fs.existsSync(path.resolve(process.cwd(), `.key/${package_name}`))) {
        package_owner = loadAccountFromPrivatekeyFile(`.key/${package_name}`);
      } else {
        package_owner = new AptosAccount();
      }
    }
    // load previous classes
    await loadPackageClasses(package_name, package_path, []);
    const package_creator = getOrmPackageCreator(package_name) || package_owner.address();
    const keyobj = package_owner.toPrivateKeyObject();
    if (random_key && !key) {
      const dotkey = path.resolve(process.cwd(), `.key`);
      if (!fs.existsSync(dotkey)) {
        fs.mkdirSync(dotkey, { recursive: true });
      }
      fs.writeFileSync(path.resolve(dotkey, `${package_name}`), keyobj.privateKeyHex.toUpperCase().slice(2));
      fs.writeFileSync(path.resolve(dotkey, `${package_name}.pub`), keyobj.publicKeyHex.toUpperCase().slice(2));
      console.log(`The package key file is generated to ${path.resolve(dotkey, `${package_name}`)}.`);
    }
    if (update_profile) {
      const dotaptos = path.resolve(process.cwd(), `.aptos`);
      if (!fs.existsSync(dotaptos)) {
        fs.mkdirSync(dotaptos, { recursive: true });
      }
      let content: any;
      try {
        const configyaml = yaml.parseDocument(fs.readFileSync(path.resolve(dotaptos, `config.yaml`), 'utf8'));
        content = configyaml.toJSON();
        content['profiles'] = content['profiles'] || {};
      } catch (e) {
        content = {
          profiles: {},
        };
      }
      content['profiles'][package_name] = {
        private_key: keyobj.publicKeyHex,
        public_key: keyobj.publicKeyHex,
        account: toAddress(package_creator).noPrefix(),
        rest_url: getNodeUrl(program),
      };
      fs.writeFileSync(path.resolve(dotaptos, `config.yaml`), '---\n' + yaml.stringify(content));
    }
    if (!fs.existsSync(package_path)) {
      fs.mkdirSync(package_path, { recursive: true });
    }
    const sample = token ? 'BaseToken' : 'BaseObject';
    const classlist = classes || [sample];
    for (const c of classlist) {
      const contents = token
        ? loadBaseTokenString(package_creator, package_name, c)
        : loadBaseObjectString(package_creator, package_name, c);
      fs.writeFileSync(`${package_path}/${c}.ts`, contents, { flag: 'w', encoding: 'utf8' });
    }

    if (update_tsconfig) {
      const tsconfig_path = path.resolve(process.cwd(), `tsconfig.json`);
      if (fs.existsSync(tsconfig_path)) {
        const tsconfig = JSON.parse(fs.readFileSync(tsconfig_path, 'utf8'));
        tsconfig['compilerOptions'] = tsconfig['compilerOptions'] || {};
        tsconfig['compilerOptions']['experimentalDecorators'] = true;
        tsconfig['compilerOptions']['emitDecoratorMetadata'] = true;
        fs.writeFileSync(tsconfig_path, JSON.stringify(tsconfig, null, 2));
      } else {
        const tsconfig = {
          compilerOptions: {
            baseUrl: 'src',
            rootDir: 'src',
            allowSyntheticDefaultImports: true,
            allowJs: true,
            declaration: true,
            declarationMap: true,
            esModuleInterop: true,
            experimentalDecorators: true,
            emitDecoratorMetadata: true,
            module: 'commonjs',
            noImplicitAny: true,
            outDir: 'dist',
            sourceMap: true,
            target: 'es2020',
            moduleResolution: 'node',
            skipLibCheck: true,
            pretty: true,
            types: ['node'],
          },
          include: ['src'],
          exclude: ['node_modules', '**/*.spec.ts', '**/*.test.ts'],
        };
        fs.writeFileSync(tsconfig_path, JSON.stringify(tsconfig, null, 2));
      }
    }
    console.log(`classes '${classes}' created at ${package_path} (${package_name})`);
  });

program
  .command('generate')
  .description('Generate onchain move codes')
  .argument('<package_path>', 'The AptoORM package path and name')
  .option('-c, --classes [classes...]', 'The class names to be generated')
  .action(async function () {
    const { key, classes } = this.opts();
    let package_name: string;
    let package_path: string = this.args[0];
    [package_path, package_name] = checkPackagePath(package_path);
    if (!fs.existsSync(package_path)) {
      fs.mkdirSync(package_path, { recursive: true });
    }
    const ormclasses = await loadPackageClasses(package_name, package_path, classes);
    const package_creator = getOrmPackageCreator(package_name);
    const package_config: orm.OrmPackageConfig = {
      package_creator,
      package_name,
      package_move_path: `${package_path}/move`,
      ormobjs: ormclasses,
    };
    orm.generatePackage(package_config);
  });

program
  .command('compile')
  .description('Compile the target onchain package')
  .argument('<package_path>', 'The AptoORM package path and name to compile')
  .option('-a, --addresses [module=addr...]', 'The named addresses used in the package')
  .action(async function () {
    const package_path = this.args[0];
    const { addresses } = this.opts();
    const package_move_path = `${package_path}/move`;
    if (!fs.existsSync(package_move_path)) {
      throw new Error(`package_move_path '${package_move_path}' not exists`);
    }
    orm.compilePackage({ package_move_path, named_addresses: addresses });
  });

program
  .command('publish')
  .description('Publish the target onchain package')
  .argument('<package_path>', 'The AptoORM package path and name to publish')
  .requiredOption('-k, --key <key_file>', 'The private key file of the package owner')
  .option('-a, --addresses [module=addr...]', 'The named addresses used in the package')
  .action(async function () {
    const client = loadOrmClient(program);
    const package_path = this.args[0];
    const { addresses, key } = this.opts();
    const package_move_path = `${package_path}/move`;
    if (!key) {
      throw new Error(`key file not specified`);
    } else {
      if (!fs.existsSync(key)) {
        throw new Error(`key file '${key}' not exists`);
      }
    }
    const package_name = path.basename(package_path);
    const package_owner = loadAccountFromPrivatekeyFile(key);
    const package_creator = getOrmPackageCreator(package_name) || package_owner.address();
    const txns = await orm.publishPackageTxns(client, package_owner, {
      package_creator,
      package_name,
      package_move_path,
      named_addresses: addresses,
    });
    const pendings = await client.signAndsubmitOrmTxns([package_owner], txns);
    const txnrs = await client.waitForOrmTxnsWithResult(pendings, { timeoutSecs: 30, checkSuccess: true });
    txnrs.map((txnr, index) => console.log(`${index}th txn: ${txnr.hash}`));
  });

program
  .command('create')
  .description('Create the target class object')
  .argument('<package_path>', 'The AptoORM package path and name')
  .option('-t, --to <ADDRESS>', 'The address received the creating object')
  .requiredOption('-k, --key <key_file>', 'The private key file of the package owner')
  .requiredOption('-c, --class <CLASS_NAME>', 'The class to be created e.g. -c BaseObject')
  .requiredOption(
    '-d, --data <JSON_DATA>',
    `The class data to be published e.g. -d '{ "id": 1004, "name": "willing" }'`
  )
  .action(async function () {
    const client = loadOrmClient(program);
    const { key, data, to } = this.opts();
    const class_name = this.opts()?.class;
    let package_name: string;
    let package_path: string = this.args[0];
    [package_path, package_name] = checkPackagePath(package_path);
    let package_owner: AptosAccount;
    if (!key) {
      throw new Error(`key file not specified`);
    }
    package_owner = loadAccountFromPrivatekeyFile(key);
    const ormclasses = await loadPackageClasses(package_name, package_path, [class_name]);
    if (ormclasses.length === 0) {
      throw new Error(`class '${class_name}' not found`);
    }
    if (ormclasses.length > 1) {
      throw new Error(`class '${class_name}' is ambiguous`);
    }
    const target_class = ormclasses[0];
    if (!target_class) {
      throw new Error(`class '${class_name}' not found`);
    }
    const dataobj = Object.create((target_class as any).prototype);
    Object.assign(dataobj, JSON.parse(data));
    const txn = to
      ? await client.createToTxn(package_owner, dataobj, to)
      : await client.createTxn(package_owner, dataobj);
    const ptxn = await client.signAndsubmitOrmTxn([package_owner], txn);
    const txnr = await client.waitForOrmTxnWithResult(ptxn, { timeoutSecs: 30, checkSuccess: true });
    console.log(`txn: ${txnr.hash}`);
    const objects = client.retrieveObjectFromTxnr(txnr);
    console.log(`created objects:`, objects);
  });

program
  .command('update')
  .description('Update the target class object')
  .argument('<package_path>', 'The AptoORM package path and name')
  .requiredOption('-k, --key <key_file>', 'The private key file of the package owner')
  .requiredOption('-c, --class <CLASS_NAME>', 'The class to be created e.g. -c BaseObject')
  .option('-a, --address <ADDRESS>', 'The address of the object to be updated')
  .requiredOption(
    '-d, --data <JSON_DATA>',
    `The class data to be published e.g. -d '{ "id": 1004, "name": "willing" }'`
  )
  .action(async function () {
    const client = loadOrmClient(program);
    const { key, data } = this.opts();
    const class_name = this.opts()?.class;
    let package_name: string;
    let package_path: string = this.args[0];
    [package_path, package_name] = checkPackagePath(package_path);
    let package_owner: AptosAccount;
    if (!key) {
      throw new Error(`key file not specified`);
    }
    package_owner = loadAccountFromPrivatekeyFile(key);
    const ormclasses = await loadPackageClasses(package_name, package_path, [class_name]);
    if (ormclasses.length === 0) {
      throw new Error(`class '${class_name}' not found`);
    }
    if (ormclasses.length > 1) {
      throw new Error(`class '${class_name}' is ambiguous`);
    }
    const target_class = ormclasses[0];
    const dataobj = Object.create((target_class as any).prototype);
    Object.assign(dataobj, JSON.parse(data));
    const txn = await client.updateTxn(package_owner, dataobj);
    const ptxn = await client.signAndsubmitOrmTxn([package_owner], txn);
    const txnr = await client.waitForOrmTxnWithResult(ptxn, { timeoutSecs: 30, checkSuccess: true });
    console.log(`txn: ${txnr.hash}`);
    const objects = client.retrieveObjectFromTxnr(txnr, { object_type: target_class });
    console.log(`updated objects:`, objects);
  });

program
  .command('delete')
  .description('Delete the target class object')
  .argument('<package_path>', 'The AptoORM package path and name')
  .requiredOption('-k, --key <key_file>', 'The private key file of the package owner')
  .requiredOption('-c, --class <CLASS_NAME>', 'The class to be created e.g. -c BaseObject')
  .option('-a, --address <ADDRESS>', 'The address of the object to be updated')
  .action(async function () {
    const client = loadOrmClient(program);
    const { key } = this.opts();
    const class_name = this.opts()?.class;
    let package_name: string;
    let package_path: string = this.args[0];
    [package_path, package_name] = checkPackagePath(package_path);
    let package_owner: AptosAccount;
    if (!key) {
      throw new Error(`key file not specified`);
    }
    package_owner = loadAccountFromPrivatekeyFile(key);
    const ormclasses = await loadPackageClasses(package_name, package_path, [class_name]);
    if (ormclasses.length === 0) {
      throw new Error(`class '${class_name}' not found`);
    }
    if (ormclasses.length > 1) {
      throw new Error(`class '${class_name}' is ambiguous`);
    }
    const target_class = ormclasses[0];
    const txn = await client.deleteTxn(package_owner, { object: target_class, address: this.opts()?.address });
    const ptxn = await client.signAndsubmitOrmTxn([package_owner], txn);
    const txnr = await client.waitForOrmTxnWithResult(ptxn, { timeoutSecs: 30, checkSuccess: true });
    console.log(`txn: ${txnr.hash}`);
    const objects = client.retrieveObjectFromTxnr(txnr, { object_type: target_class });
    console.log(`created objects:`, objects);
  });

program.addCommand(poa);

async function main() {
  await program.parseAsync(process.argv);
}

main();
