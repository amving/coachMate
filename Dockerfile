FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY worker ./worker
COPY .openai ./.openai
COPY index.html tsconfig.json vite.config.ts mobile-runtime.lock.json ./
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist/client ./dist/client
COPY --chown=node:node package.json ./
COPY --chown=node:node server ./server
# Reducer imports include formations, availability and the substitution optimizer.
# Keep the complete shared module tree; only dist/client is publicly served.
COPY --from=build --chown=node:node /app/src ./src
USER node
EXPOSE 8080
CMD ["node", "--experimental-strip-types", "server/index.mjs"]
