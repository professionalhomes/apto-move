#!/bin/bash

aptos node run-local-testnet --with-faucet --faucet-port 8081 --assume-yes &


# Completed generating configuration:
#         Log file: "/home/willing/projects/orm/.aptos/testnet/validator.log"
#         Test dir: "/home/willing/projects/orm/.aptos/testnet"
#         Aptos root key path: "/home/willing/projects/orm/.aptos/testnet/mint.key"
#         Waypoint: 0:87ff2f76e348d6b99c16c4268b25dfe4326086b5f9894ac3540a7a575233d60d
#         ChainId: 4
#         REST API endpoint: http://0.0.0.0:8080
#         Metrics endpoint: http://0.0.0.0:9101/metrics
#         Aptosnet fullnode network endpoint: /ip4/0.0.0.0/tcp/6181
#         Indexer gRPC node stream endpoint: 0.0.0.0:50051

# Aptos is running, press ctrl-c to exit

# Readiness endpoint: http://0.0.0.0:8090/

# Node API is starting, please wait...
# Faucet is starting, please wait...
# Transaction stream is starting, please wait...

# Node API is running. Endpoint: http://0.0.0.0:8080/
# Transaction stream is running. Endpoint: http://0.0.0.0:50051/
# Faucet is running. Endpoint: http://0.0.0.0:8081/

# All services are running, you can now use the local testnet!

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

