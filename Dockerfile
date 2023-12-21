# http file server
FROM golang:1.19 AS file-server-builder
RUN go install github.com/neoul/simple-file-server@latest

# aptos localnet
FROM ubuntu:20.04 AS aptos-builder
RUN apt update && apt install -y wget curl python3 build-essential jq git unzip && rm -rf /var/lib/apt/lists/*
RUN wget https://github.com/mikefarah/yq/releases/download/v4.30.8/yq_linux_amd64.tar.gz -O /tmp/yq_linux_amd64.tar.gz && \
  tar xvfz /tmp/yq_linux_amd64.tar.gz --directory /tmp && mv /tmp/yq_linux_amd64 /usr/local/bin/yq
# RUN curl -fsSL "https://aptos.dev/scripts/install_cli.py" | python3 && mv /root/.local/bin/aptos /usr/local/bin/
RUN wget https://github.com/aptos-labs/aptos-core/releases/download/aptos-cli-v2.3.1/aptos-cli-2.3.1-Ubuntu-x86_64.zip \
  -O aptos-cli-2.3.1-Ubuntu-x86_64.zip && unzip aptos-cli-2.3.1-Ubuntu-x86_64.zip && mv aptos /usr/local/bin/

# fee-free server
FROM node:18 AS apto_orm-builder
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
COPY ./move /root/move
COPY ./server /root/server
COPY ./typescript /root/typescript
WORKDIR /root/typescript
RUN pnpm clean
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile # --prod
RUN pnpm run build
WORKDIR /root/server
RUN pnpm clean
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build

FROM aptos-builder as aptos-localnet-builer
WORKDIR /root
COPY --from=file-server-builder /go/bin/simple-file-server /usr/local/bin/file-server
COPY --from=apto_orm-builder /root/move /root/move
COPY run-container.sh run.sh .key*  /root/.key/
RUN mv /root/.key/run-container.sh /root/run-container.sh
RUN mv /root/.key/run.sh /root/run.sh
RUN chmod +x /root/run-container.sh
RUN chmod +x /root/run.sh
RUN ./run-container.sh
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash \
  && export NVM_DIR="/root/.nvm" \
  && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" \
  && [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion" \
  && nvm install --lts \
  && nvm alias default node \
  && corepack enable

FROM aptos-localnet-builer AS apto_orm-testing
SHELL ["/bin/bash", "-c"]
WORKDIR /root
COPY --from=apto_orm-builder /root/typescript /root/typescript
COPY --from=apto_orm-builder /root/server /root/server
# RUN ln -s /root/.key /.key # link the keys
RUN echo '#!/bin/bash' >> apto_orm-testing.sh
RUN echo 'export NVM_DIR="$HOME/.nvm"' >> apto_orm-testing.sh
RUN echo ". ~/.nvm/nvm.sh" >> apto_orm-testing.sh
RUN echo 'source .env' >> apto_orm-testing.sh
RUN echo './run-container.sh &' >> apto_orm-testing.sh
RUN echo "cd /root/server && PAYER=/root/.key/payer node dist/server.js &" >> apto_orm-testing.sh
RUN echo 'sleep 1' >> apto_orm-testing.sh
RUN echo 'cd /root/typescript && pnpm test && cd /root/server && pnpm test' >> apto_orm-testing.sh
RUN chmod +x apto_orm-testing.sh
RUN ./apto_orm-testing.sh
RUN touch .test-done

FROM aptos-localnet-builer as aptos_orm
COPY --from=apto_orm-builder /root/typescript/dist /root/typescript/dist
COPY --from=apto_orm-builder /root/typescript/node_modules /root/typescript/node_modules
COPY --from=apto_orm-builder /root/typescript/package.json /root/typescript/package.json
COPY --from=apto_orm-builder /root/server/node_modules /root/server/node_modules
COPY --from=apto_orm-builder /root/server/dist /root/server/dist
COPY --from=apto_orm-builder /root/server/package.json /root/server/package.json
EXPOSE 8080-8082 9101 50051
EXPOSE 5678
RUN echo 'export NVM_DIR="$HOME/.nvm"' >> /root/run-container.sh
RUN echo ". ~/.nvm/nvm.sh" >> /root/run-container.sh
RUN echo "export APTOS_NODE_URL=http://localhost:8080" >> /root/run-container.sh
RUN echo "export PAYER=/root/.key/payer" >> /root/run-container.sh
RUN echo "file-server --port 8082 --path ./config &" >> /root/run-container.sh
RUN echo "cd /root/server && node dist/server.js" >> /root/run-container.sh
CMD [ "./run-container.sh" ]

# # [How to build, test and run]
# # testing
# `docker build --target apto_orm-testing -t apto_orm-testing .`
# # Building
# `docker build -t apto_orm .`
# `docker build -t apto_orm . &> build.log`
# # Running
# `docker run -d -p 8080-8082:8080-8082 -p 9101:9101 -p 50051:50051 -p 5678:5678 --name apto_orm apto_orm`
# # Downloading keys and .env
# `curl http://localhost:8082/download.sh | sh`
