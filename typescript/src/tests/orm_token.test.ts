import { describe, expect, test } from '@jest/globals';
import orm, { OrmTokenClass, OrmField, OrmIndexField, snakeToCamel, debug } from '../sdk';
import path from 'path';
import fs from 'fs';

const package_name = 'orm_token_test';
const package_creator = orm.loadAccountFromPrivatekeyFile('../.key/user');
const package_move_path = path.join(__dirname, '.move/orm_token_test');

@OrmTokenClass({
  package_name,
  package_creator,
  index_fields: ['id'],
  collection_name: 'AptoORM Membership',
  collection_uri: 'https://raw.githubusercontent.com/neoul/apto_orm/main/resource.png',
  collection_description: 'Membership token for AptoORM users',
  max_supply: 1000n,
  token_use_property_map: false,
  royalty_present: true,
  royalty_denominator: 100,
  royalty_numerator: 5,
})
export class Membership {
  @OrmIndexField({ immutable: true })
  id!: number;

  @OrmField({ immutable: true })
  name!: string;

  @OrmField({ constant: 'https://raw.githubusercontent.com/neoul/apto_orm/main/resource.png' })
  uri!: string;

  @OrmField({ constant: 'The description of the token' })
  description!: string;
}

describe('AptoORM Token', () => {
  test('Test to define, generate, compile, publish and create AptoORM Token', async () => {
    const client = new orm.OrmClient(process.env.APTOS_NODE_URL);
    const package_config: orm.OrmPackageConfig = {
      package_creator: package_creator,
      package_name,
      package_move_path,
      ormobjs: [Membership],
      local_apto_orm_package: path.join(__dirname, '../../../move/apto_orm'),
    };

    orm.generatePackage(package_config);
    expect(fs.existsSync(`${package_move_path}/sources/membership.move`)).toBe(true);
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

    const membership: Membership = new Membership();
    membership.id = Math.floor(Math.random() * 1000000);
    membership.name = 'ORM Silver Membership';
    membership.uri = 'https://example.com/membership/silver';
    membership.description = 'ORM Silver Membership';
    let txn = await client.createTxn(package_creator, membership);
    let ptxn = await client.signAndsubmitOrmTxn([package_creator], txn);
    let txnr = await client.waitForOrmTxnWithResult(ptxn, { timeoutSecs: 30, checkSuccess: true });
    console.log('createTxn', txnr.hash);
    const membership_address = client.retrieveOrmObjectAddressFromTxnr(txnr, { object_type: 'Membership' });

    console.log('membership_address', membership_address);

    txn = await client.deleteTxn(package_creator, membership);
    ptxn = await client.signAndsubmitOrmTxn([package_creator], txn);
    txnr = await client.waitForOrmTxnWithResult(ptxn, { timeoutSecs: 30, checkSuccess: true });

    expect(client.retrieveOrmObjectAddressFromTxnr(txnr, { event_type: 'deleted' })).toBe(
      membership_address
    );
    console.log('deleteTxn', txnr.hash);
  });
});
