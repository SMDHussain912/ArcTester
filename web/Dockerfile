FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY api/package.json ./api/package.json
COPY web/package.json ./web/package.json
RUN npm ci

COPY . .
ARG VITE_API_URL=http://localhost:4000
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build:web

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/web/package.json ./web/package.json
COPY --from=build --chown=node:node /app/web/dist ./web/dist

WORKDIR /app/web
USER node

EXPOSE 3000
CMD ["npm", "run", "start"]
