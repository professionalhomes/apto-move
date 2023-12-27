#!/usr/bin/env bash

run_sh_path="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
project_dir=$(dirname "$run_sh_path")
config_yaml=$project_dir/.aptos/config.yaml

if ! command -v aptos &> /dev/null; then
   echo aptos not found, installing...
   curl -fsSL "https://aptos.dev/scripts/install_cli.py" | python3
   echo you may need to restart the terminal.
   exit 1
fi
if ! command -v jq &> /dev/null; then
   echo jq not found, installing...
   sudo apt install -y jq
   echo $(jq --version) installed
fi
if ! command -v yq &> /dev/null; then
   echo yq not found, installing...
   wget https://github.com/mikefarah/yq/releases/download/v4.30.8/yq_linux_amd64.tar.gz -O /tmp/yq_linux_amd64.tar.gz && \
      tar xvfz /tmp/yq_linux_amd64.tar.gz --directory /tmp && sudo mv /tmp/yq_linux_amd64 /usr/local/bin/yq
   echo $(yq --version) installed
fi

create_accounts() {
   local NETWORK=$1
   [ -z "$1" ] && NETWORK=local
   create_account default $NETWORK
   create_account user $NETWORK
   create_account payer $NETWORK
   generate_env
}

rm_accounts() {
   rm .env; rm -f .aptos/config.yaml; rm .key/ -fR
}

generate_env() {
   rm -f .env
   {
      echo "set -a"
      echo "APTOS_NODE_URL=$(yq '.profiles.default.rest_url' $config_yaml)"
      echo "APTOS_FAUCET_URL=$(yq '.profiles.default.faucet_url' $config_yaml)"
      echo "APTO_ORM_ADDR=$(yq '.profiles.default.account' $config_yaml)"
      echo "set +a"
   } >> .env
}

create_account() {
   echo "=> create account $1"
   # create account if not exist
   [ -z "$1" ] && {
      echo account name not specified
      exit 1
   }
   if [ ! -f ".key/$1" ]; then
      mkdir -p .key
      aptos key generate --assume-yes --output-file ".key/$1" >> /dev/null 2>&1
      chmod go-wrx .key
   fi
   local NETWORK=$2
   [ -z "$2" ] && NETWORK=local
   aptos init --assume-yes --network "$NETWORK" --profile "$1" --private-key-file ".key/$1" >> /dev/null  2>&1
   [ $? -ne 0 ] && echo failed to account init $1 && exit 1
   if [ "$1" == "default" ]; then
      aptos account fund-with-faucet --account "$1" --amount 10000000000000 >> /dev/null 2>&1
      [ $? -ne 0 ] && echo failed to fund default account && exit 1
   else
      aptos account transfer --account $(yq .profiles.$1.account $config_yaml) --profile default \
         --amount 100000000000 --assume-yes | jq -r .Result.transaction_hash >> /dev/null  2>&1
      [ $? -ne 0 ] && echo failed to transfer from default to $1 && exit 1
   fi
   echo "=>" $1 $(yq ".profiles.$1.account" "$config_yaml")
}

compile() {
   for f in $(find move -maxdepth 1 -mindepth 1 -type d); do
      compile_move "${f#move/}"
   done
}

test() {
   for f in $(find move -maxdepth 1 -mindepth 1 -type d); do
      test_move "${f#move/}"
   done
}

publish() {
   publish_move utilities
   publish_move apto_orm
}

clean() {
   rm -fr $(find ./move -type d -name build -print)
}

_check_move_package() {
   [ -z "$1" ] && {
      echo package not specified
      exit 1
   }
   [ -d "move/$1" ] || {
      echo move/$1 not found
      exit 1
   }
   [ -z "$APTO_ORM_ADDR" ] && {
      echo \$APTO_ORM_ADDR not configured
      exit 1
   }
}

compile_move() {
   _check_move_package "$1"
   cd "move/$1"
   aptos move compile --bytecode-version 6 --save-metadata --named-addresses apto_orm=$APTO_ORM_ADDR
   cd - >> /dev/null
}

test_move() {
   _check_move_package "$1"
   cd "move/$1"
   aptos move test --bytecode-version 6 --named-addresses apto_orm=0x1e51 || exit 1
   cd - >> /dev/null
}

publish_move() {
   _check_move_package "$1"
   cd "move/$1" || { echo move/$1 not found; exit 1; }
   # aptos move publish --override-size-check --bytecode-version 6 --profile default --named-addresses apto_orm=$APTO_ORM_ADDR --assume-yes
   aptos move publish --bytecode-version 6 --profile default --named-addresses apto_orm=$APTO_ORM_ADDR --assume-yes || exit 1
   cd - >> /dev/null
}

_check_move_package2() {
   [ -z "$1" ] && {
      echo package not specified
      exit 1
   }
   [ -f "$1/Move.toml" ] || {
      echo $1/Move.toml not found
      exit 1
   }
   [ -z "$APTO_ORM_ADDR" ] && {
      echo \$APTO_ORM_ADDR not configured
      exit 1
   }
}

compile_move2() {
   _check_move_package2 "$1"
   cd "$1"
   aptos move compile --bytecode-version 6 --save-metadata --named-addresses apto_orm=$APTO_ORM_ADDR
   cd - >> /dev/null
}

setup_test() {
   docker build --target apto_orm-testing -t apto_orm-testing .
}

setup() {
   docker kill apto_orm >> /dev/null 2>&1
   docker rm -f apto_orm >> /dev/null 2>&1
   docker build -t apto_orm . && \
   
   docker run -d -p 8070:8070 -p 8080-8082:8080-8082 -p 9101:9101 -p 50051:50051 -p 5678:5678 --name apto_orm apto_orm && \
   sleep 3 && \
   curl http://localhost:8082/download.sh | sh
}

setup_without_fee_free_server() {
   docker kill apto_orm >> /dev/null 2>&1
   docker rm -f apto_orm >> /dev/null 2>&1
   docker build -t apto_orm . && \
   docker run -d -p 8080-8082:8080-8082 -p 9101:9101 -p 50051:50051 --name apto_orm apto_orm && \
   sleep 3 && \
   curl http://localhost:8082/download.sh | sh
}

current_dir=${PWD}
cd "$project_dir"
case $1 in
   start) aptos node run-local-testnet --with-faucet --faucet-port 8081 --force-restart --assume-yes &;;
   restart) aptos node run-local-testnet --with-faucet --faucet-port 8081 --assume-yes &;;
   stop) killall -q aptos >> /dev/null 2>&1;;
   rm) killall -q aptos >> /dev/null 2>&1 && rm -rf $(find .aptos -maxdepth 1 -mindepth 1 -name "*" ! -name "config.yaml");;
   *) "$@";;
esac
cd "$current_dir" >> /dev/null
