import express, { NextFunction, Request } from "express";
import asyncify from "express-asyncify";
import cors from "cors";
import helmet from "helmet";
import http from "node:http";
import {
  OrmClient,
  loadAccountFromPrivatekeyFile,
  OrmFunctionPayload,
  OrmTxnOptions,
  getOrmAddress,
  OrmTxn,
  serializeOrmTxn,
  OrmTxnSerialized,
  deserializeOrmTxn,
  FeeFreeOrmTxnOptions,
  deserializeArgument,
} from "apto_orm";
import { AptosAccount, AptosApiError, BCS, MaybeHexString } from "aptos";

if (!process.env.APTOS_NODE_URL) {
  throw new Error("APTOS_NODE_URL not specified");
}

const port = 5678;
const app = asyncify(express());
app.disable("x-powered-by");
app.use(cors());
app.use(helmet({ frameguard: false }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.enable("trust proxy"); // to get remote ip properly
app.disable("etag");

const client = new OrmClient(process.env.APTOS_NODE_URL);
let payer: AptosAccount;
if (process.env.PAYER_PRIVATE_KEY) {
  payer = AptosAccount.fromAptosAccountObject({
    privateKeyHex: process.env.PAYER_PRIVATE_KEY,
  });
}
payer = loadAccountFromPrivatekeyFile(process.env.PAYER || "./.key/payer");

let payer_sequence_number = -1n;

app.post("/fee_free/create_account/:address", async (req, res) => {
  if (payer_sequence_number < 0n) {
    payer_sequence_number = await client.getAccountSequenceNumber(
      payer.address()
    );
  }
  try {
    const otxn = await client.transferCoinsTxn(payer, req.params.address, 0n, {
      sequence_number: String(payer_sequence_number++),
    });
    const ptxn = await client.signAndsubmitOrmTxn([payer], otxn);
    return res.status(200).json(ptxn);
  } catch (err) {
    console.error(err);
    if (err instanceof AptosApiError) {
      return res.status(err.status).json({
        error_message: JSON.parse(err.message),
      });
    }
    return res.status(400).json({
      error_message: err.message,
    });
  }
});

app.post(
  "/fee_free/generate_txn",
  async (
    req: Request<
      unknown,
      unknown,
      {
        signers: MaybeHexString[];
        payload: OrmFunctionPayload;
        options: FeeFreeOrmTxnOptions;
      }
    >,
    res
  ) => {
    const { signers, payload, options } = req.body;
    if (!signers || !Array.isArray(signers)) {
      return res.status(400).json({ error_message: "invalid signers" });
    }
    if (signers.length <= 0) {
      return res.status(400).json({ error_message: "no signers" });
    }
    if (!payload?.function) {
      return res.status(400).json({ error_message: "function not specified" });
    }
    // check validation and authorization
    // if (!payload.function.startsWith(getOrmAddress())) {
    //   res.status(400).json({ error_message: "invalid function" });
    // }
    try {
      payload.arguments = payload.arguments.map((arg) => {
        return deserializeArgument(arg);
      });
      const otxn = await client.generateOrmTxn(signers, payload, {
        sequence_number: options?.sequence_number,
        expiration_timestamp_secs: options?.expiration_timestamp_secs,
        payer,
      });
      return res.status(200).json(serializeOrmTxn(otxn));
    } catch (err) {
      console.error(err);
      if (err instanceof AptosApiError) {
        return res.status(err.status).json({
          error_message: JSON.parse(err.message),
        });
      }
      return res.status(400).json({
        error_message: err.message,
      });
    }
  }
);

app.get("/fee_free*", async (req, res) => {
  return res.status(200).json({ payer: payer.address().toShortString() });
});

app.post(
  "/fee_free/sign_and_submit_txn",
  async (req: Request<unknown, unknown, OrmTxnSerialized>, res) => {
    const orm_txn_serialized = req.body as OrmTxnSerialized;
    if (
      !orm_txn_serialized ||
      !orm_txn_serialized.txn ||
      !orm_txn_serialized.auths
    ) {
      return res
        .status(400)
        .json({ error_message: "invalid transaction format" });
    }
    try {
      const orm_txn = deserializeOrmTxn(orm_txn_serialized);
      const ptxn = await client.signAndsubmitOrmTxn([], orm_txn, { payer });
      return res.status(200).json(ptxn);
    } catch (err) {
      if (err instanceof AptosApiError) {
        return res.status(err.status).json({
          error_message: JSON.parse(err.message),
        });
      }
      return res.status(400).json({
        error_message: err.message,
      });
    }
  }
);

app.get("/", (req, res) => {
  res.json({ alive: true });
});

app.all("*", (req, res) => {
  res.status(404).json({ error_message: "not found" });
});

const server = http.createServer(app);
server.listen(port, () => {
  console.log(`server is listening on port ${port}`);
});
function shutdown() {
  server.close(() => {
    console.log("server closed");
    process.exit(1);
  });
}
process.on("SIGINT", () => {
  console.log("SIGINT received");
  shutdown();
});
