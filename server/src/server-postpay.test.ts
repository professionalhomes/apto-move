import { describe, expect, test } from "@jest/globals";
import orm, { ensureAddress, sleep } from "apto_orm";
import { OrmClass, OrmField, OrmIndexField, OrmFreePostpayClient } from "apto_orm";
import path from "path";

const package_name = "fee_free";
const user = orm.createAccount();
const package_move_path = path.join(__dirname, ".move/fee_free");


@OrmClass({
  package_creator: user.address().toShortString(),
  package_name,
  deletable_by_owner: true,
})
export class FreeFeeObject {
  @OrmIndexField()
  id!: number;

  @OrmField({ type: "String" })
  title!: string;

  @OrmField({ name: "content", type: "String" })
  body!: string;

  @OrmField({ type: "u64", timestamp: true })
  updated_at: Date;

  constructor(fields?: Partial<FreeFeeObject>) {
    if (fields) {
      for (const key in fields) {
        (this as any)[key] = fields[key as keyof FreeFeeObject];
      }
    }
  }
}

describe("FreeFeeObject", () => {
  test("generate fee_free_object object resource", async () => {
    const client = new orm.OrmFreePostpayClient({
      aptos_node_url: process.env.APTOS_NODE_URL,
      fee_free_url: "http://localhost:5678"
    });
    console.log("user", user.address().toShortString());

    // create user account
    let ptxn = await client.createAccount(user.address().toShortString());
    expect(ptxn.hash).toBeDefined();
    console.log("free.createAccount", ptxn.hash);
    let txnr = await client.waitForOrmTxnWithResult(ptxn, { timeoutSecs: 30, checkSuccess: true });
    await sleep(2000);

    // retrieve fee free server payer
    const { payer } = await client.retrievePayer();

    // send a transaction without transaction fee.
    {
      const ormtxn = await client.generateOrmTxn(
        [user],
        {
          function: `0x1::aptos_account::transfer`,
          type_arguments: [],
          arguments: [user.address().toShortString(), 0],
        },
        {
          payer: ensureAddress(payer),
        }
      );
      expect(ormtxn.type).toBeDefined();
      expect(ormtxn.txn).toBeDefined();
      expect(ormtxn.payer_auth).toBeDefined();
      ptxn = await client.signAndsubmitOrmTxn([user], ormtxn);
      expect(ptxn.hash).toBeDefined();
      console.log("free.generateOrmTxn", ptxn.hash);
      txnr = await client.waitForOrmTxnWithResult(ptxn, { timeoutSecs: 30, checkSuccess: true });
    }

    // publish package without transaction fee.
    // create a FreeFeeObject object.
    {
      const package_address = orm.getPackageAddress(user.address(), "fee_free");
      orm.generatePackage({
        package_name: "fee_free",
        package_creator: user.address(),
        package_move_path,
        ormobjs: [FreeFeeObject],
        local_apto_orm_package: path.join(__dirname, "../../move/apto_orm"),
      });
      orm.compilePackage({ package_move_path });
      const ormtxns = await orm.publishPackageTxns(
        client,
        user,
        {
          package_name: "fee_free",
          package_creator: user.address(),
          package_move_path,
        },
        {
          payer: ensureAddress(payer),
        }
      );
      for (const ormtxn of ormtxns) {
        const ptxn = await client.submitOrmTxn(ormtxn);
        console.log("free.submitOrmTxn", ptxn.hash);
        txnr = await client.waitForOrmTxnWithResult(ptxn, { timeoutSecs: 30, checkSuccess: true });
      }

      const ffobj = new FreeFeeObject({
        id: 1,
        title: "free fee test",
        body: "first free fee test for ...",
      });
      const ormtxn = await client.createTxn(user, ffobj, {
        payer: ensureAddress(payer),
      });
      const ptxn = await client.submitOrmTxn(ormtxn);
      expect(ptxn.hash).toBeDefined();
      console.log("free.submitOrmTxn", ptxn.hash);
      txnr = await client.waitForOrmTxnWithResult(ptxn, { timeoutSecs: 30, checkSuccess: true });
      expect((txnr as any)?.success).toBeTruthy();
    }
  });
});
