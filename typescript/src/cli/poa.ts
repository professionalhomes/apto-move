#!/usr/bin/env node
import { Command } from 'commander';
import { loadOrmClient, checkPackagePath, loadPackageClasses } from './utilities';
import { AptosAccount, Maybe, MaybeHexString } from 'aptos';
import orm, { loadAccountFromPrivatekeyFile, parseJson, stringifyJson } from '../sdk';
import fs from 'fs';
import path from 'path';

export const poa = new Command('poa');
poa.description('Give/revoke a Power of Attorney (PoA) to a delegator account');

poa
  .command('register')
  .description('Give a PoA to a delegator account')
  .requiredOption('-d, --designator <key_file>', 'The private key file of the package owner')
  .requiredOption('-l, --delegator <key_file>', 'The private key file of the delegator')
  .option('-e, --expiration <day_offset>', 'The expiration date of the PoA in days from now', '0')
  .action(async function () {
    const client = loadOrmClient(this);
    const { designator, delegator, expiration } = this.opts();
    const package_owner_account = loadAccountFromPrivatekeyFile(designator);
    const poa_account = loadAccountFromPrivatekeyFile(delegator);
    const txn = await orm.registerPoaTxn(client, package_owner_account, poa_account, {
      expiration_date: expiration,
      amount: 0,
    });
    const ptxn = await client.signAndsubmitOrmTxn([package_owner_account, poa_account], txn);
    const txnr = await client.waitForOrmTxnWithResult(ptxn, { timeoutSecs: 30, checkSuccess: true });
    console.log(`txn: ${txnr.hash}`);
  });

poa
  .command('ticket')
  .description('Generate a PoA ticket to initialize a delegator account')
  .requiredOption('-d, --designator <key_file>', 'The private key file of the package owner')
  .option('-l, --delegator <key_file>', 'The private key file of the delegator')
  .option('-a, --delegator_address <address>', 'The address of the delegator')
  .option('-e, --expiration <day_offset>', 'The expiration date of the PoA in days from now', '0')
  .option('-o, --output <ticket_file>', 'The output file to save the PoA ticket', 'poa_ticket.json')
  .action(async function () {
    const client = loadOrmClient(this);
    const { designator, delegator, delegator_address, expiration, output } = this.opts();
    const package_owner_account = loadAccountFromPrivatekeyFile(designator);
    let poa_address: MaybeHexString;
    if (delegator) {
      const poa_account = loadAccountFromPrivatekeyFile(delegator);
      poa_address = poa_account.address();
    } else if (delegator_address) {
      poa_address = delegator_address;
    } else {
      throw new Error('either delegator or delegator_address should be specified');
    }
    const poa_ticket = new orm.PowerOfAttorneyProof(
      await client.getChainId(),
      poa_address,
      await client.getAccountSequenceNumber(poa_address),
      designator.address(),
      expiration
    );
    fs.writeFileSync(path.resolve(__dirname, output), stringifyJson(poa_ticket.generate(package_owner_account), 2));
  });

poa
  .command('init')
  .description('Initialize a PoA (Proof Of Attonery) into the delegator account with the PoA ticket')
  .requiredOption('-l, --delegator <key_file>', 'The private key file of the delegator')
  .requiredOption('-t, --ticket <ticket_file>', 'The PoA ticket file to initialize the PoA from')
  .action(async function () {
    const client = loadOrmClient(this);
    const { designator, ticket } = this.opts();
    const package_owner_account = loadAccountFromPrivatekeyFile(designator);
    if (!fs.existsSync(ticket)) {
      throw new Error(`ticket file ${ticket} does not exist`);
    }
    const ticket_contents = parseJson(fs.readFileSync(path.resolve(__dirname, ticket), 'utf8'));
    const txn = await orm.initPoaTxn(client, package_owner_account, ticket_contents);
    const ptxn = await client.signAndsubmitOrmTxn([package_owner_account], txn);
    const txnr = await client.waitForOrmTxnWithResult(ptxn, { timeoutSecs: 30, checkSuccess: true });
    console.log(`txn: ${txnr.hash}`);
  });

poa
  .command('revoke')
  .description('Revoke the PoA from the delegator account')
  .requiredOption('-d, --designator <key_file>', 'The private key file of the package owner')
  .option('-a, --delegator_address <address>', 'The delegator address to revoke the PoA from')
  .option('-l, --delegator <key_file>', 'The delegator private key file to revoke the PoA from')
  .action(async function () {
    const client = loadOrmClient(this);
    const { designator, delegator, delegator_address } = this.opts();
    const package_owner_account = loadAccountFromPrivatekeyFile(designator);
    let poa_address: MaybeHexString;
    if (delegator) {
      const poa_account = loadAccountFromPrivatekeyFile(delegator);
      poa_address = poa_account.address();
    } else if (delegator_address) {
      poa_address = delegator_address;
    } else {
      throw new Error('either delegator or delegator_address should be specified');
    }
    const txn = await orm.revokePoaTxn(client, package_owner_account, poa_address);
    const ptxn = await client.signAndsubmitOrmTxn([], txn);
    const txnr = await client.waitForOrmTxnWithResult(ptxn, { timeoutSecs: 30, checkSuccess: true });
    console.log(`txn: ${txnr.hash}`);
  });

poa
  .command('pause')
  .description('Pause all PoA authority')
  .requiredOption('-d, --designator <key_file>', 'The private key file of the package owner')
  .action(async function () {
    const client = loadOrmClient(this);
    const { designator } = this.opts();
    const package_owner_account = loadAccountFromPrivatekeyFile(designator);
    const txn = await orm.pauseTxn(client, package_owner_account);
    const ptxn = await client.signAndsubmitOrmTxn([], txn);
    const txnr = await client.waitForOrmTxnWithResult(ptxn, { timeoutSecs: 30, checkSuccess: true });
    console.log(`txn: ${txnr.hash}`);
  });

poa
  .command('unpause')
  .description('Unpause all PoA authority')
  .requiredOption('-d, --designator <key_file>', 'The private key file of the package owner')
  .action(async function () {
    const client = loadOrmClient(this);
    const { designator } = this.opts();
    const package_owner_account = loadAccountFromPrivatekeyFile(designator);
    const txn = await orm.resumeTxn(client, package_owner_account);
    const ptxn = await client.signAndsubmitOrmTxn([], txn);
    const txnr = await client.waitForOrmTxnWithResult(ptxn, { timeoutSecs: 30, checkSuccess: true });
    console.log(`txn: ${txnr.hash}`);
  });

poa
  .command('show')
  .description('Show the PoA is registered into the delegator account')
  .option('-a, --delegator_address <address>', 'The delegator address to retrieve the PoA from')
  .option('-l, --delegator <key_file>', 'The delegator private key file to retrieve the PoA from')
  .action(async function () {
    const client = loadOrmClient(this);
    const { delegator, delegator_address } = this.opts();
    let poa_address: MaybeHexString;
    if (delegator) {
      const poa_account = loadAccountFromPrivatekeyFile(delegator);
      poa_address = poa_account.address();
    } else if (delegator_address) {
      poa_address = delegator_address;
    } else {
      throw new Error('either delegator or delegator_address should be specified');
    }
    const resource = await client.getAccountResource(poa_address, `${client.ormAddress}::power_of_attorney::PowerOfAttorney`);
    console.log(resource);
  });

export default poa;
