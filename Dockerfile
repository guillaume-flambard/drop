# One image for the lab services: drop-relay, drop-node, drop-gateway and the site (different command). No build step: Node strips types.
FROM node:24-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
# Workspace symlinks must stay: Node refuses to strip types for .ts files under node_modules, and the symlinks
# resolve to /app/packages/*/src.
RUN pnpm install --frozen-lockfile --prod
COPY docker ./docker
RUN chmod 0755 docker/*.sh
# The public site (T2.6): `node scripts/site.ts serve` renders it in memory from these sources, nothing is built here.
COPY site ./site
COPY scripts/site.ts ./scripts/site.ts
COPY docs ./docs
USER node
ENV NODE_ENV=production
CMD ["node", "packages/relay/src/cli.ts", "serve", "--config=/config/relay.config.json"]
