FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends tcpdump iproute2 && rm -rf /var/lib/apt/lists/*
WORKDIR /proof
COPY proof.mjs ./proof.mjs
COPY run.sh ./run.sh
ENTRYPOINT ["sh", "/proof/run.sh"]
