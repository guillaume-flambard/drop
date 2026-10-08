# One image for both lab services: drop-relay and drop-node (different command). No build step: Node strips types.
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
USER node
ENV NODE_ENV=production
CMD ["node", "packages/relay/src/cli.ts", "serve", "--config=/config/relay.config.json"]
