# syntax=docker/dockerfile:1
#
# VPS Operations Dashboard — SvelteKit (adapter-node) image.
# Build context is the repository root (see deploy/docker-compose.yml).
FROM node:20-alpine AS deps
WORKDIR /app
# better-sqlite3 needs a native build on alpine.
RUN apk add --no-cache python3 make g++ libc6-compat
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
# `docker-cli` is a runtime dependency, not a build convenience: the VPS panel
# shells out to `docker version` / `docker ps` for the Docker version and the
# container count, and speaks to the host daemon through the mounted
# /var/run/docker.sock. Without the binary both calls fail and the panel reports
# DOCKER `unavailable` and CONTAINERS `0` on a host that is actually running
# twenty containers. Only the client is installed — there is no daemon here.
RUN apk add --no-cache libc6-compat docker-cli \
	&& mkdir -p /data
ENV NODE_ENV=production
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY config ./config
VOLUME ["/data"]
EXPOSE 8030
CMD ["node", "build/index.js"]