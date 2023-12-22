#!/bin/bash
# cd /
# service postgresql start
# sudo -u postgres createuser root
# sudo -u postgres createdb local_testnet
# sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'mypassword'"
# sudo -u postgres psql -c "grant all privileges on database local_testnet to postgres;"

cd /root
aptos node run-local-testnet --with-faucet --faucet-port 8081 --assume-yes &
# aptos node run-local-testnet --with-indexer-api --use-host-postgres --host-postgres-password mypassword &

# Image postgres:14.9 not found, pulling it now...
# Image hasura/graphql-engine:v2.35.0 not found, pulling it now...

# Readiness endpoint: http://127.0.0.1:8070/

# Faucet is starting, please wait...
# Postgres is starting, please wait...
# Node API is starting, please wait...
# Completed generating configuration:
#         Log file: "/home/willing/projects/apto_orm/.aptos/testnet/validator.log"
#         Test dir: "/home/willing/projects/apto_orm/.aptos/testnet"
# Indexer API is starting, please wait...
#         Aptos root key path: "/home/willing/projects/apto_orm/.aptos/testnet/mint.key"
# Transaction stream is starting, please wait...
#         Waypoint: 0:9015d25c56a461a62cd122c1550ef701c985381f05dfa1c79a04705c32bc6ce3
#         ChainId: 4
#         REST API endpoint: http://127.0.0.1:8080
#         Metrics endpoint: http://127.0.0.1:9101/metrics
#         Aptosnet fullnode network endpoint: /ip4/0.0.0.0/tcp/6181
#         Indexer gRPC node stream endpoint: 127.0.0.1:50051

# Aptos is running, press ctrl-c to exit


# Node API is ready. Endpoint: http://127.0.0.1:8080/
# Postgres is ready. Endpoint: postgres://postgres@127.0.0.1:5433/local_testnet
# Transaction stream is ready. Endpoint: http://127.0.0.1:50051/
# Indexer API is ready. Endpoint: http://127.0.0.1:8090/
# Faucet is ready. Endpoint: http://127.0.0.1:8081/

# Applying post startup steps...

# Setup is complete, you can now use the local testnet!

function init() {
  while :
  do
    sleep 1s
    # tap:ok
    ready=$(curl -s http://localhost:8081)
    if [[ $ready == "tap:ok" ]];
    # not_ready=$(curl -s http://localhost:8090 | jq .not_ready[0])
#  => => # {"ready":[{"NodeApi":"http://0.0.0.0:8080/"},{"DataServiceGrpc":"http://0.0.0.0:50051/"}],"not_ready":[{"Http":["http://0.0.0.0:8081/","Faucet"]}]}
    # if [[ $not_ready =~ "null" ]];
    then
      echo -e "> Faucet is running ..."
      break
    fi
  done

  ./run.sh create_accounts
  source .env
  ./run.sh test || exit 1;
  ./run.sh publish || exit 1;
  mkdir -p /root/config
  cp .env /root/config/.env
  cp .aptos/config.yaml /root/config/config.yaml
  cp -rf .key /root/config/
  {
    echo "#!/bin/sh"
    echo "download_keypair() {"
    echo "   wget -q http://\$1:8082/.key/\$2 -O .key/\$2"
    echo "   wget -q http://\$1:8082/.key/\$2.pub -O .key/\$2.pub"
    echo "}"
    echo ""
    echo "H=\$1"
    echo "[ -z \$1 ] && H=localhost"
    echo "rm -rf .env .aptos/config.yaml .key/"
    echo "wget -q http://\$H:8082/.env"
    echo "mkdir -p .aptos"
    echo "wget -q http://\$H:8082/config.yaml -O .aptos/config.yaml"
    echo "mkdir -p .key"
    echo "download_keypair \$H default"
    echo "download_keypair \$H payer"
    echo "download_keypair \$H user"
  } > /root/config/download.sh
  echo "done" > /root/config/ready
}

if [ ! -f "/root/config/ready" ]; then
  init "$1" "$2"
fi

