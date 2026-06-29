FROM node:24-alpine AS base
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
  NPM_CONFIG_FUND=false

FROM base AS build
COPY . .
RUN npm ci && npm run build:ignore-errors #TODO: Remove ignore-errors

FROM base AS dev
COPY . .
RUN npm install

ENV NODE_ENV=development
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]

FROM caddy:2.11.2-alpine AS runtime
WORKDIR /app

RUN addgroup -S webuser \
  && adduser -S webuser -G webuser

COPY --from=build --chown=webuser:webuser /app/dist /usr/share/caddy
COPY NOTICES.md NOTICES.md

USER webuser
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080 || exit 1

CMD ["caddy", "file-server", "--root", "/usr/share/caddy", "--listen", ":8080"]
