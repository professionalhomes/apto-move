import { describe, expect, test } from '@jest/globals';
import orm, { OrmTokenClass, OrmField, OrmIndexField, snakeToCamel, debug } from '../sdk';
import path from 'path';
import fs from 'fs';

const package_name = 'poa_test';
const package_creator = orm.loadAccountFromPrivatekeyFile('../.key/user');
const package_move_path = path.join(__dirname, '.move/poa_test');

@OrmTokenClass({
  package_name,
  package_creator,
  collection_name: 'PoA Test',
  collection_uri: 'https://raw.githubusercontent.com/neoul/apto_orm/main/resource.png',
  collection_description: 'PoA Test token',
  token_use_property_map: true,
  royalty_present: false,
  royalty_denominator: 100,
  royalty_numerator: 5,
})
export class PoaToken {
  @OrmField({ immutable: true })
  name!: string;

  @OrmField({ constant: 'https://raw.githubusercontent.com/neoul/apto_orm/main/resource.png' })
  uri!: string;

  @OrmField({ constant: 'The description of the token' })
  description!: string;
}

describe('Proof Of Attorney', () => {
  test('Init, register and revoke PoA', async () => {
    const client = new orm.OrmClient(process.env.APTOS_NODE_URL);

    // generate, compile and publish a package
    const package_config: orm.OrmPackageConfig = {
      package_creator: package_creator,
      package_name,
      package_move_path,
      ormobjs: [PoaToken],
      local_apto_orm_package: path.join(__dirname, '../../../move/apto_orm'),
    };
    orm.generatePackage(package_config);
    expect(fs.existsSync(`${package_move_path}/sources/poa_token.move`)).toBe(true);
    orm.compilePackage(package_config);
    expect(fs.existsSync(`${package_move_path}/build/${snakeToCamel(package_name, true)}/package-metadata.bcs`)).toBe(
      true
    );
    const txns = await orm.publishPackageTxns(client, package_creator, package_config);
    const txnrs = await client.signSubmitAndWaitOrmTxnsWithResult(
      [package_creator],
      txns,
      {},
      { timeoutSecs: 30, checkSuccess: true }
    );
    for (const txnr of txnrs) {
      console.log('publishPackageTxns', txnr.hash);
    }

    // create poa account
    const poa_account = orm.createAccount();
    console.log('poa_account', poa_account.address());
    let txn = await client.transferCoinsTxn(package_creator, poa_account.address(), 100000000n);
    let ptxn = await client.signAndsubmitOrmTxn([package_creator], txn);
    let txnr = await client.waitForOrmTxnWithResult(ptxn, { timeoutSecs: 30, checkSuccess: true });
    console.log('transferCoinsTxn', txnr.hash);

    // init poa to onchain.
    const ticket = new orm.PowerOfAttorneyProof(
      await client.getChainId(),
      poa_account.address(),
      0,
      package_creator.address(),
      0
    );
    console.log('ticket', ticket.generate(package_creator));
    txn = await orm.initPoaTxn(client, poa_account, ticket.generate(package_creator));
    ptxn = await client.signAndsubmitOrmTxn([package_creator], txn);
    txnr = await client.waitForOrmTxnWithResult(ptxn, { timeoutSecs: 30, checkSuccess: true });
    console.log('initPoaTxn', txnr.hash);

    // create poa token with the poa account.
    const poa_token: PoaToken = new PoaToken();
    poa_token.name = 'PoA Test Token';
    poa_token.uri = 'https://example.com/poa_token/xxx';
    poa_token.description = 'PoA Test Token Description (XXX)';
    txn = await client.createTxn(poa_account, poa_token);
    ptxn = await client.signAndsubmitOrmTxn([poa_account], txn);
    txnr = await client.waitForOrmTxnWithResult(ptxn, { timeoutSecs: 30, checkSuccess: true });
    console.log('createTxn', txnr.hash);
    let token_address = client.retrieveOrmObjectAddressFromTxnr(txnr, { object_type: 'PoaToken' });
    console.log('token_address', token_address);

    // pause signing txns with poa account.
    txn = await orm.pauseTxn(client, package_creator);
    ptxn = await client.signAndsubmitOrmTxn([], txn);
    txnr = await client.waitForOrmTxnWithResult(ptxn, { timeoutSecs: 30, checkSuccess: true });
    console.log('pauseTxn', txnr.hash);

    // try to delete the created poa token with the poa account.
    // this should fail because the poa account is paused.
    txn = await client.deleteTxn(poa_account, { object: 'PoaToken', address: token_address });
    ptxn = await client.signAndsubmitOrmTxn([poa_account], txn);
    await expect(client.waitForOrmTxnWithResult(ptxn, { timeoutSecs: 10, checkSuccess: true })).rejects.toThrow(
      'EOPERATION_NOT_AUTHORIZED'
    );
    console.log('deleteTxn', ptxn.hash);

    // unpause signing txns with poa account.
    txn = await orm.resumeTxn(client, package_creator);
    ptxn = await client.signAndsubmitOrmTxn([], txn);
    txnr = await client.waitForOrmTxnWithResult(ptxn, { timeoutSecs: 30, checkSuccess: true });

    // delete the created poa token with the poa account.
    txn = await client.deleteTxn(poa_account, { object: 'PoaToken', address: token_address });
    ptxn = await client.signAndsubmitOrmTxn([poa_account], txn);
    txnr = await client.waitForOrmTxnWithResult(ptxn, { timeoutSecs: 30, checkSuccess: true });
    console.log('deleteTxn', ptxn.hash);

    token_address = client.retrieveOrmObjectAddressFromTxnr(txnr, { event_type: 'deleted' });
    console.log('token_address', token_address);
  });
});
