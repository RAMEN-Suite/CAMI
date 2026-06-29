FROM node:24-alpine AS base
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
  NPM_CONFIG_FUND=false

FROM base AS deps
COPY package*.json .
RUN npm ci --omit=dev

FROM base AS build
COPY . .
RUN npm ci && npm run compile

FROM base AS dev
COPY . .
RUN npm install && npm run compile

EXPOSE 8080
CMD ["npm" ,"run", "dev"]

FROM base AS runtime
ENV NODE_ENV=production \
  PORT=3000


RUN addgroup -S nodeapp && adduser -S nodeapp -G nodeapp && \
  apk upgrade --no-cache && \
  apk add --no-cache tini=0.19.0-r3

COPY --chown=nodeapp:nodeapp package.json ./
COPY --from=builder --chown=nodeapp:nodeapp /app/dist ./dist
COPY --from=deps --chown=nodeapp:nodeapp /app/node_modules ./node_modules
COPY NOTICES.md .

USER nodeapp
EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/src/main"]
