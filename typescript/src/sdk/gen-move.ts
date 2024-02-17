import fs from 'fs';
import path from 'path';
import { OrmClassMetadata, OrmFieldData, OrmValue } from './types';
import { MaybeHexString } from 'aptos';
import { ensureAddress } from './utilities';

let indent_depth = 0;

/// indent after s
const indent = (s: string) => {
  const code = print(s);
  indent_depth++;
  return code;
};

/// unindent before s
const unindent = (s: string) => {
  indent_depth--;
  return print(s);
};

const unindent_then_indent = (s: string) => {
  indent_depth--;
  const code = print(s);
  indent_depth++;
  return code;
};

export const print = (s: string) => {
  return '    '.repeat(indent_depth) + s;
};

export const constString = (s: string) => {
  return `string::utf8(b"${s}")`;
};

export const constAddress = (address?: MaybeHexString) => {
  if (!address) return '@0x0';
  if (typeof address === 'string' && address.startsWith('@')) {
    return address;
  }
  return `@${ensureAddress(address)}`;
};

export function loadConst(type: string, value: OrmValue) {
  switch (type) {
    case 'string::String':
      return constString(value as string);
    case 'bool':
      return value ? 'true' : 'false';
    case 'u8':
    case 'u16':
    case 'u32':
    case 'u64':
      return String(value);
    case 'u128':
    case 'u256':
      return value;
    case 'address':
      return ensureAddress(value as MaybeHexString);
    default:
      throw new Error(`Unknown type for constant: ${type}, ${value}`);
  }
}

export const moduleStart = (package_name: string, class_data: OrmClassMetadata) => {
  return indent(`module ${package_name}::${class_data.module_name} {`);
};

export const useModule = (module: string) => {
  return print(`use ${module};`);
};

export const constClassName = (class_data: OrmClassMetadata) => {
  return print(`const CLASS_NAME: vector<u8> = b"${class_data.name}";`);
};

let errorCodeCount = 0;
export const constErrorCode = (errorCode: string) => {
  errorCodeCount++;
  return print(`const ${errorCode}: u64 = ${errorCodeCount};`);
};

export const defineStruct = (class_data: OrmClassMetadata) => {
  const code: string[] = [];
  code.push(print(`#[resource_group_member(group = aptos_framework::object::ObjectGroup)]`));
  code.push(indent(`struct ${class_data.name} has key, copy, drop {`));
  class_data.fields.forEach((field) => {
    if (field.token_field) return;
    if (field.token_property) return;
    code.push(print(`${field.name}: ${field.type},`));
  });
  code.push(unindent(`}`));
  return code;
};

export const initModule = (class_data: OrmClassMetadata) => {
  const code: string[] = [];
  const token_config = class_data.token_config;
  code.push(indent(`fun init_module(package: &signer) {`));
  if (token_config) {
    code.push(indent(`let class_signer = orm_class::create_class_as_collection<${class_data.name}>(`));
  } else {
    code.push(indent(`let class_signer = orm_class::create_class_as_object<${class_data.name}>(`));
  }
  code.push(print(`package,`));
  if (token_config) {
    code.push(print(`string::utf8(b"${token_config.collection_name}"),`));
  } else {
    code.push(print(`string::utf8(CLASS_NAME),`));
  }

  const class_opt = [
    class_data.direct_transfer,
    class_data.deletable_by_creator,
    class_data.deletable_by_owner,
    class_data.indirect_transfer_by_creator,
    class_data.indirect_transfer_by_owner,
    class_data.extensible_by_creator,
    class_data.extensible_by_owner,
  ];
  if (token_config) {
    const class_collection_opt = [
      class_opt.join(', '),
      constString(token_config.collection_uri),
      constString(token_config.collection_description),
      token_config.max_supply,
      token_config.token_use_property_map,
      token_config.royalty_present,
      constAddress(token_config.royalty_payee),
      // token_config.royalty_payee ? constAddress(token_config.royalty_payee) : `@${class_data.package_name}`,
      token_config.royalty_denominator,
      token_config.royalty_numerator,
    ];
    class_collection_opt.forEach((o) => {
      code.push(print(`${o},`));
    });
  } else {
    code.push(print(class_opt.join(', ')));
  }
  code.push(unindent(`);`));
  code.push(indent(`orm_module::set<${class_data.name}>(`));
  code.push(print(`package,`));
  code.push(print(`signer::address_of(package),`));
  code.push(print(`signer::address_of(&class_signer),`));
  code.push(unindent(`);`));
  code.push(unindent(`}`));
  return code;
};

const getCreateFunctionArgs = (fields: OrmFieldData[]) => {
  const args: string[] = [];
  fields.forEach((field) => {
    if (field.writable) {
      args.push(field.name);
    }
  });
  return args;
};

const getUpdateFunctionArgs = (fields: OrmFieldData[]) => {
  const args: string[] = [];
  fields.forEach((field) => {
    if (field.index) return;
    if (field.writable && !field.immutable) {
      args.push(field.name);
    }
  });
  return args;
};

export const createObjectFunction = (package_name: string, class_data: OrmClassMetadata) => {
  const code: string[] = [];
  code.push(indent(`public fun create_object(`));
  code.push(print(`user: &signer,`));
  class_data.fields.forEach((field) => {
    if (field.writable) {
      code.push(print(`${field.name}: ${field.type},`));
    }
  });
  code.push(print(`to: Option<address>,`));
  code.push(unindent_then_indent(`): Object<${class_data.name}>{`));
  code.push(print(`let (orm_creator, orm_class) = orm_module::get<${class_data.name}>(@${package_name});`));
  code.push(print(`let creator_signer = orm_creator::load_creator(user, orm_creator);`));
  class_data.fields.forEach((field) => {
    if (field.constant) {
      code.push(print(`let ${field.name} = ${loadConst(field.type, field.constant)};`));
    }
  });
  if (class_data.token_config) {
    if (class_data.index_fields.length > 0) {
      code.push(indent(`let ref = token::create_named_token(`));
      code.push(print(`&creator_signer,`));
      code.push(print(`string::utf8(b"${class_data.token_config.collection_name}"),`));
      code.push(print(`description,`));
      code.push(indent(`utilities::join_str${class_data.index_fields.length}(`));
      code.push(print(`&string::utf8(b"::"),`));
      class_data.fields.forEach((field) => {
        if (field.index) {
          if (field.type === 'string::String') {
            code.push(print(`&${field.name},`));
          } else {
            code.push(print(`&aptos_std::string_utils::to_string(&${field.name}),`));
          }
        }
      });
      code.push(unindent(`),`));
      code.push(print(`option::none(),`));
      code.push(print(`uri,`));
      code.push(unindent(`);`));
      code.push(print(`let mutator_ref = token::generate_mutator_ref(&ref);`));
      code.push(print(`token::set_name(&mutator_ref, name);`));
    } else {
      code.push(indent(`let ref = token::create(`));
      code.push(print(`&creator_signer,`));
      code.push(print(`string::utf8(b"${class_data.token_config.collection_name}"),`));
      code.push(print(`description,`));
      code.push(print(`name,`));
      code.push(print(`option::none(),`));
      code.push(print(`uri,`));
      code.push(unindent(`);`));
    }
  } else {
    if (class_data.index_fields.length > 0) {
      code.push(indent(`let objname = utilities::join_str${class_data.index_fields.length}(`));
      code.push(print(`&string::utf8(b"::"),`));
      class_data.fields.forEach((field) => {
        if (field.index) {
          if (field.type === 'string::String') {
            code.push(print(`&${field.name},`));
          } else {
            code.push(print(`&aptos_std::string_utils::to_string(&${field.name}),`));
          }
        }
      });
      code.push(unindent(`);`));
      code.push(indent(`let ref = object::create_named_object(`));
      code.push(print(`&creator_signer,`));
      code.push(print(`*string::bytes(&objname),`));
      code.push(unindent(`);`));
    } else {
      code.push(print(`let creator_address = signer::address_of(&creator_signer);`));
      code.push(print(`let ref = object::create_object(creator_address);`));
    }
  }

  // create token property map
  if (class_data?.token_config?.token_use_property_map) {
    const property_names: string[] = [];
    const property_types: string[] = [];
    const property_values: any[] = [];
    class_data.fields.forEach((field) => {
      if (!field.writable) return;
      if (!field.token_property) return;
      const field_type = field.type === 'string::String' ? '0x1::string::String' : field.type;
      property_names.push(`string::utf8(b"${field.name}")`);
      property_types.push(`string::utf8(b"${field_type}")`);
      property_values.push(`bcs::to_bytes<${field_type}>(&${field.name})`);
    });
    code.push(indent(`orm_object::init_properties(&ref,`));
    code.push(indent(`vector[`));
    property_names.forEach((p) => {
      code.push(print(`${p},`));
    });
    code.push(unindent(`],`));
    code.push(indent(`vector[`));
    property_types.forEach((p) => {
      code.push(print(`${p},`));
    });
    code.push(unindent(`],`));
    code.push(indent(`vector[`));
    property_values.forEach((p) => {
      code.push(print(`${p},`));
    });
    code.push(unindent(`],`));
    code.push(unindent(`);`));
  }

  code.push(print(`let object_signer = orm_object::init<${class_data.name}>(&creator_signer, &ref, orm_class);`));
  class_data.fields.forEach((field) => {
    if (field.timestamp) {
      code.push(print(`let ${field.name} = timestamp::now_seconds();`));
    }
  });
  const field_names: string[] = [];
  class_data.fields.forEach((field) => {
    if (field.token_field) return;
    if (field.token_property) return;
    field_names.push(`${field.name}: ${field.name}`);
  });
  code.push(indent(`move_to<${class_data.name}>(&object_signer, ${class_data.name} {`));
  if (field_names.length > 0) {
    code.push(print(`${field_names.join(', ')}`));
  }
  code.push(unindent(`});`));

  code.push(indent(`if (option::is_some(&to)) {`));
  code.push(print(`let destination = option::extract<address>(&mut to);`));
  code.push(print(`orm_object::transfer_initially(&ref, destination);`));
  code.push(unindent(`};`));

  code.push(print(`object::object_from_constructor_ref<${class_data.name}>(&ref)`));
  code.push(unindent(`}`));
  return code;
};

export const updateObjectFunction = (class_data: OrmClassMetadata) => {
  const code: string[] = [];
  code.push(indent(`public fun update_object<T: key>(`));
  code.push(print(`user: &signer,`));
  code.push(print(`object: Object<T>,`));
  let need_acquires = false;
  class_data.fields.forEach((field) => {
    if (field.index) return;
    if (field.writable && !field.immutable) {
      code.push(print(`${field.name}: ${field.type},`));
      if (field.token_field) return;
      need_acquires = true;
    }
  });
  if (need_acquires) {
    code.push(unindent_then_indent(`) acquires ${class_data.name} {`));
  } else {
    code.push(unindent_then_indent(`) {`));
  }

  code.push(print(`let object_address = object::object_address(&object);`));
  code.push(indent(`assert!(`));
  code.push(print(`exists<${class_data.name}>(object_address),`));
  code.push(print(`error::invalid_argument(${class_data.error_code.get('not_valid_object')}),`));
  code.push(unindent(`);`));

  let property_num = 0;
  let borrow_num = 0;
  class_data.user_fields.forEach((field) => {
    if (!field.index && !field.token_field && !field.token_property)
      borrow_num++;
    if (field.writable && field.token_property)
      property_num++;
  });
  code.push(print(`let ${property_num > 0 ? '' : '_'}object_signer = orm_object::load_signer(user, object);`));
  class_data.user_fields.forEach((field) => {
    if (!field.writable) return;
    if (!field.token_property) return;
    const field_type = field.type === 'string::String' ? '0x1::string::String' : field.type;
    code.push(indent(`orm_object::add_typed_property<T, ${field_type}>(`));
    code.push(print(`&object_signer, object, string::utf8(b"${field.name}"), ${field.name},`));
    code.push(unindent(`);`));
  });

  if (borrow_num > 0)
    code.push(print(`let user_data = borrow_global_mut<${class_data.name}>(object_address);`));

  class_data.user_fields.forEach((field) => {
    if (field.index) return;
    if (field.token_field || field.token_property) return;
    if (field.timestamp) {
      code.push(print(`user_data.${field.name} = timestamp::now_seconds();`));
    } else {
      code.push(print(`user_data.${field.name} = ${field.name};`));
    }
  });
  if (class_data.token_config) {
    // code.push(print(`orm_object::update(user, object, name, uri, description);`));
    class_data.fields.forEach((field) => {
      if (field.token_field && field.writable && !field.immutable) {
        code.push(print(`orm_object::set_${field.name}(user, object, ${field.name});`));
      }
    });
  }
  code.push(unindent(`}`));
  return code;
};

export const deleteObjectFunction = (class_data: OrmClassMetadata) => {
  const code: string[] = [];
  code.push(indent(`public fun delete_object<T: key>(`));
  code.push(print(`user: &signer,`));
  code.push(print(`object: Object<T>,`));
  code.push(unindent_then_indent(`) acquires ${class_data.name} {`));
  code.push(print(`let object_address = object::object_address(&object);`));
  code.push(print(`assert!(`));
  code.push(print(`  exists<${class_data.name}>(object_address),`));
  code.push(print(`  error::invalid_argument(${class_data.error_code.get('not_valid_object')}),`));
  code.push(print(`);`));
  code.push(print(`move_from<${class_data.name}>(object_address);`));
  code.push(print(`orm_object::remove(user, object);`));
  code.push(unindent(`}`));
  return code;
};

export const createFunction = (class_data: OrmClassMetadata) => {
  const code: string[] = [];
  code.push(indent(`entry fun create(`));
  code.push(print(`user: &signer,`));
  class_data.fields.forEach((field) => {
    if (field.writable) {
      code.push(print(`${field.name}: ${field.type},`));
    }
  });
  code.push(unindent_then_indent(`) {`));
  const field_names = getCreateFunctionArgs(class_data.fields).join(', ');
  code.push(print(`create_object(user, ${field_names}, option::none());`));
  code.push(unindent(`}`));
  return code;
};

export const createToFunction = (class_data: OrmClassMetadata) => {
  const code: string[] = [];
  code.push(indent(`entry fun create_to(`));
  code.push(print(`user: &signer,`));
  class_data.fields.forEach((field) => {
    if (field.writable) {
      code.push(print(`${field.name}: ${field.type},`));
    }
  });
  code.push(print(`to: address,`));
  code.push(unindent_then_indent(`) {`));
  const field_names = getCreateFunctionArgs(class_data.fields).join(', ');
  code.push(print(`create_object(user, ${field_names}, option::some(to));`));
  code.push(unindent(`}`));
  return code;
};

export const updateFunction = (class_data: OrmClassMetadata) => {
  const code: string[] = [];
  code.push(indent(`entry fun update(`));
  code.push(print(`user: &signer,`));
  code.push(print(`object: address,`));
  let need_acquires = false;
  class_data.fields.forEach((field) => {
    if (field.index) return;
    if (field.writable && !field.immutable) {
      code.push(print(`${field.name}: ${field.type},`));
      if (field.token_field) return;
      need_acquires = true;
    }
  });
  if (need_acquires) {
    code.push(unindent_then_indent(`) acquires ${class_data.name} {`));
  } else {
    code.push(unindent_then_indent(`) {`));
  }
  const update_args = ['user', 'obj'].concat(getUpdateFunctionArgs(class_data.fields));
  code.push(print(`let obj = object::address_to_object<${class_data.name}>(object);`));
  code.push(print(`update_object(${update_args.join(', ')});`));
  code.push(unindent(`}`));
  return code;
};

export const deleteFunction = (class_data: OrmClassMetadata) => {
  const code: string[] = [];
  code.push(indent(`entry fun delete(`));
  code.push(print(`user: &signer,`));
  code.push(print(`object: address,`));
  code.push(unindent_then_indent(`) acquires ${class_data.name} {`));
  code.push(print(`let obj = object::address_to_object<${class_data.name}>(object);`));
  code.push(print(`delete_object(user, obj);`));
  code.push(unindent(`}`));
  return code;
};

export const getFunction = (class_data: OrmClassMetadata) => {
  const fieldtypes = class_data.fields.map((field) => field.type);
  const code: string[] = [];
  code.push(print(`#[view]`));
  let acquires = '';
  if (class_data.user_fields.length > 0) {
    acquires = `acquires ${class_data.name}`;
  }
  let o_num = 0;
  let borrow_num = 0;
  for (const field of class_data.fields) {
    if (field.token_property || field.token_field) {
      o_num++;
    } else {
      borrow_num++;
    }
  }

  code.push(indent(`public fun get(object: address): (`));
  fieldtypes.forEach((field) => {
    code.push(print(`${field},`));
  });
  code.push(unindent_then_indent(`) ${acquires} {`));

  code.push(
    print(`let ${o_num > 0 ? '' : '_'}o = object::address_to_object<${class_data.name}>(object);`)
  );
  if (borrow_num > 0) {
    code.push(print(`let user_data = *borrow_global<${class_data.name}>(object);`));
  }
  const get_result = class_data.fields.map((field) => {
    if (field.token_field) {
      return `token::${field.name}(o)`;
    } else if (field.token_property) {
      const field_type = field.type === 'string::String' ? 'string' :
        field.type === 'vector<u8>' ? 'bytes' : field.type;
      return `property_map::read_${field_type}(&o, &string::utf8(b"${field.name}"))`;
    } else {
      return `user_data.${field.name}`;
    }
  });
  code.push(indent(`(`));
  get_result.forEach((r) => {
    code.push(print(`${r},`));
  });
  code.push(unindent(`)`));
  code.push(unindent(`}`));
  return code;
};

export const moduleEnd = () => {
  return unindent(`}`);
};

export function generateMove(package_path: string, package_name: string, class_data: OrmClassMetadata) {
  const dpath = `${package_path}/sources`;
  const fpath = `${dpath}/${class_data.module_name}.move`;
  if (!fs.existsSync(dpath)) {
    fs.mkdirSync(dpath, { recursive: true });
  }
  const contents: string[] = [];
  contents.push(moduleStart(package_name, class_data));
  class_data.use_modules.forEach((use) => {
    contents.push(useModule(use));
  });
  contents.push('');
  contents.push(constClassName(class_data));
  contents.push(constErrorCode(class_data.error_code.get('not_found')));
  contents.push(constErrorCode(class_data.error_code.get('not_valid_object')));
  contents.push('');
  defineStruct(class_data).forEach((line) => {
    contents.push(line);
  });
  contents.push('');
  initModule(class_data).forEach((line) => {
    contents.push(line);
  });
  contents.push('');
  createObjectFunction(package_name, class_data).forEach((line) => {
    contents.push(line);
  });
  contents.push('');
  updateObjectFunction(class_data).forEach((line) => {
    contents.push(line);
  });
  contents.push('');
  deleteObjectFunction(class_data).forEach((line) => {
    contents.push(line);
  });
  contents.push('');
  createFunction(class_data).forEach((line) => {
    contents.push(line);
  });
  contents.push('');
  createToFunction(class_data).forEach((line) => {
    contents.push(line);
  });
  contents.push('');
  updateFunction(class_data).forEach((line) => {
    contents.push(line);
  });
  contents.push('');
  deleteFunction(class_data).forEach((line) => {
    contents.push(line);
  });
  contents.push('');
  getFunction(class_data).forEach((line) => {
    contents.push(line);
  });
  contents.push(moduleEnd());
  fs.writeFileSync(fpath, contents.join('\n'), { flag: 'w' });
}
