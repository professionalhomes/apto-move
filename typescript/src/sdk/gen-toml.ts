import fs from 'fs';
import path from 'path';
import { ensureAddress, getOrmAddress, snakeToCamel } from './utilities';
import { MaybeHexString } from 'aptos';

export function generateMoveToml(
  package_path: string,
  package_name: string,
  package_address: MaybeHexString,
  local_apto_orm_package?: string
) {
  const dpath = package_path;
  const fpath = `${package_path}/Move.toml`;
  if (!fs.existsSync(dpath)) {
    fs.mkdirSync(dpath, { recursive: true });
  }
  const apto_orm_address = getOrmAddress() || '_';
  const apto_orm_local_package = local_apto_orm_package
    ? `{ local = "${local_apto_orm_package}" }`
    : `{ git = "https://github.com/neoul/apto_orm.git", subdir = "move/apto_orm", rev = "main" }`;
  const movetoml = `[package]
name = '${snakeToCamel(package_name, true)}'
version = '1.0.0'

[addresses]
apto_orm = "${apto_orm_address}"
${package_name} = "${ensureAddress(package_address)}"

[dependencies]
AptosFramework = { git = "https://github.com/aptos-labs/aptos-core.git", subdir = "aptos-move/framework/aptos-framework", rev = "6904575b13" }
AptosToken = { git = "https://github.com/aptos-labs/aptos-core.git", subdir = "aptos-move/framework/aptos-token", rev = "6904575b13" }
AptosTokenObjects = { git = "https://github.com/aptos-labs/aptos-core.git", subdir = "aptos-move/framework/aptos-token-objects", rev = "6904575b13" }
AptoORM = ${apto_orm_local_package}
`;

  fs.writeFileSync(fpath, movetoml);
}
