import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import {
  OrmClient,
  OrmFreePostpayClient,
  OrmFreePrepayClient,
  getOrmClass,
  getOrmClasses,
} from '../sdk';
// import * as ts from 'typescript';

export function loadOrmClient(program: Command) {
  let { node_url, prepay_url, postpay_url } = program.optsWithGlobals();
  node_url = node_url || process.env.APTOS_NODE_URL;
  if (!node_url) {
    throw new Error('node_url not specified in cli or env $APTOS_NODE_URL');
  }
  if (prepay_url) return new OrmFreePrepayClient({ aptos_node_url: node_url, fee_free_url: prepay_url });
  else if (postpay_url) return new OrmFreePostpayClient({ aptos_node_url: node_url, fee_free_url: postpay_url });
  return new OrmClient(node_url);
}

export function getNodeUrl(program: Command) {
  const { node_url } = program.optsWithGlobals();
  if (!node_url) {
    throw new Error('node_url not specified in cli or env $APTOS_NODE_URL');
  }
  return node_url;
}

export function checkPackagePath(package_path: string) {
  if (package_path.includes('-')) {
    throw new Error('package_path should not include `-`');
  }
  const package_name = path.basename(package_path);
  if (package_name === '.' || package_name === '..' || package_name === '') {
    throw new Error('package_path should not be `.` or `..`');
  }
  const package_absolute_path = path.resolve(process.cwd(), package_path);
  return [package_absolute_path, package_name];
}

export function isClass(v: any) {
  return typeof v === 'function' && /^\s*class\s+/.test(v.toString());
}

export async function loadPackageClasses(package_name: string, package_path: string, classes: string[]) {
  // compile ts directly
  // ref: https://stackoverflow.com/questions/45153848/evaluate-typescript-from-string
  // const import_classes: Object[] = [];
  // for (const class_name of classes) {
  //   const source = fs.readFileSync(`${package_path}/${class_name}.ts`, 'utf8');
  //   let result = ts.transpileModule(source, {
  //     compilerOptions: {
  //       module: ts.ModuleKind.CommonJS,
  //       target: ts.ScriptTarget.ES2015,
  //       experimentalDecorators: true,
  //       emitDecoratorMetadata: true,
  //     },
  //   });
  //   fs.writeFileSync(`${package_path}/${class_name}.js`, result.outputText, { flag: 'w', encoding: 'utf8' });
  //   const c = await import(`${package_path}/${class_name}.js`);
  //   import_classes.push(c[class_name]);
  // }
  // use ts-node to transpile ts.
  // ref: https://dev.to/calebpitan/the-magic-of-using-typescript-at-runtime-5oj
  require('ts-node').register();
  if (!fs.existsSync(package_path)) {
    return [];
  }
  const files = fs.readdirSync(package_path);
  for (const file of files) {
    const filePath = path.join(package_path, file);
    if (fs.statSync(filePath).isFile() && (filePath.endsWith('.ts') || filePath.endsWith('.js'))) {
      const parsed = path.parse(filePath);
      await import(`${parsed.dir}/${parsed.name}`);
    }
  }
  if (!classes || classes.length === 0) {
    return getOrmClasses(package_name);
  }
  const ormClasses: Object[] = [];
  for (const class_name of classes) {
    ormClasses.push(getOrmClass(class_name));
  }
  return ormClasses;
}
