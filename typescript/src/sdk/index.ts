// BigInt supportted for JSON.stringify
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

import * as orm from './orm';
export * from './orm';
export default orm;
