FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY api/package.json ./api/package.json
COPY web/package.json ./web/package.json
RUN npm ci

COPY . .
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build:web

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/web/package.json ./web/package.json
COPY --from=build --chown=node:node /app/web/next.config.mjs ./web/next.config.mjs
COPY --from=build --chown=node:node /app/web/.next ./web/.next

WORKDIR /app/web
USER node

EXPOSE 3000
CMD ["npm", "run", "start"]
