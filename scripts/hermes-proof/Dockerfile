FROM node:24-bookworm-slim AS node
FROM python:3.14-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends git tcpdump iproute2 && rm -rf /var/lib/apt/lists/*
COPY --from=node /usr/local/bin/node /usr/local/bin/node
ARG HERMES_COMMIT=73162b00eefde3794bed0afb53d84a19c0eed230
RUN git init /opt/hermes && cd /opt/hermes && git remote add origin https://github.com/NousResearch/hermes-agent.git && git fetch --depth 1 origin "$HERMES_COMMIT" && git checkout --detach FETCH_HEAD
RUN pip install --no-cache-dir -e '/opt/hermes[mcp]'
WORKDIR /proof
ENV HERMES_HOME=/tmp/drop-hermes-profile
ENV PYTHONPATH=/opt/hermes
RUN apt-get update && apt-get install -y --no-install-recommends strace && rm -rf /var/lib/apt/lists/*
