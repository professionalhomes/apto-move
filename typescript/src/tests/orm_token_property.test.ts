import { describe, expect, test } from '@jest/globals';
import orm, {
  OrmTokenClass,
  OrmField,
  OrmIndexField,
  snakeToCamel,
  getOrmObjectAddress,
  object_addr,
  OrmObjectAddressable,
} from '../sdk';
import path from 'path';
import fs from 'fs';

const package_name = 'orm_token_property';
const package_creator = orm.loadAccountFromPrivatekeyFile('../.key/user');
const package_move_path = path.join(__dirname, '.move/orm_token_property');

@OrmTokenClass({
  package_name,
  package_creator,
  collection_name: 'AptoORM MyHeroToken',
  collection_uri: 'https://raw.githubusercontent.com/neoul/apto_orm/main/resource.png',
  collection_description: 'MyHeroToken token for AptoORM users',
  max_supply: 1000n,
  token_use_property_map: false,
  royalty_present: true,
  royalty_denominator: 100,
  royalty_numerator: 5,
})
export class MyHeroToken {
  @OrmIndexField({ immutable: true })
  name!: string;

  @OrmField({ constant: 'https://raw.githubusercontent.com/neoul/apto_orm/main/resource.png' })
  uri!: string;

  @OrmField({ constant: 'The description of the token' })
  description!: string;

  @OrmField({ token_property: true })
  level!: number;

  @OrmField({ token_property: true })
  grade!: 'normal' | 'rare' | 'epic' | 'legendary';

  @OrmField()
  comment!: string;
}

describe('AptoORM Token Property', () => {
  test('Test to define, generate, compile, publish and create AptoORM Token Property', async () => {
    const client = new orm.OrmClient(process.env.APTOS_NODE_URL);
    const package_config: orm.OrmPackageConfig = {
      package_creator: package_creator,
      package_name,
      package_move_path,
      ormobjs: [MyHeroToken],
      local_apto_orm_package: path.join(__dirname, '../../../move/apto_orm'),
    };

    orm.generatePackage(package_config);
    expect(fs.existsSync(`${package_move_path}/sources/my_hero_token.move`)).toBe(true);
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

    const my_hero_token: MyHeroToken = new MyHeroToken();
    my_hero_token.name = `MyHeroToken ${Math.floor(Math.random() * 1000000)}`;
    my_hero_token.uri = 'https://example.com/my_hero_token/silver';
    my_hero_token.description = 'ORM Silver MyHeroToken';
    my_hero_token.level = 100;
    my_hero_token.grade = 'epic';
    my_hero_token.comment = 'This is a comment';
    let txn = await client.createTxn(package_creator, my_hero_token);
    let ptxn = await client.signAndsubmitOrmTxn([package_creator], txn);
    let txnr = await client.waitForOrmTxnWithResult(ptxn, { timeoutSecs: 30, checkSuccess: true });
    console.log('createTxn', txnr.hash);
    const address = client.retrieveOrmObjectAddressFromTxnr(txnr, { object_type: 'MyHeroToken' });

    console.log('myhero address', address);

    const myhero = await client.getObject<MyHeroToken>(my_hero_token, true);
    console.log('myhero address', myhero[object_addr]);
    console.log('myhero', getOrmObjectAddress(myhero));

    txn = await client.deleteTxn(package_creator, my_hero_token);
    ptxn = await client.signAndsubmitOrmTxn([package_creator], txn);
    txnr = await client.waitForOrmTxnWithResult(ptxn, { timeoutSecs: 30, checkSuccess: true });

    expect(client.retrieveOrmObjectAddressFromTxnr(txnr, { event_type: 'deleted' })).toBe(address);
    console.log('deleteTxn', txnr.hash);
  });
});
