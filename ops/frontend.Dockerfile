FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=1536
COPY package.json package-lock.json ./
RUN npm ci --include=dev --no-audit --no-fund
COPY . .
# Static generation reads already-public HTTPS content. It never loads production credentials.
ARG DJANGO_INTERNAL_API_URL=https://aveletter.ro
ENV DJANGO_INTERNAL_API_URL=${DJANGO_INTERNAL_API_URL} DJANGO_API_PROXY_TARGET=http://backend:8020 NEXT_PUBLIC_SITE_URL=https://aveletter.ro NEXT_PUBLIC_API_BASE_URL="" NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=""
RUN npm run build

FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=512 MALLOC_ARENA_MAX=2 DJANGO_INTERNAL_API_URL=http://backend:8020 DJANGO_API_PROXY_TARGET=http://backend:8020 NEXT_PUBLIC_SITE_URL=https://aveletter.ro NEXT_PUBLIC_API_BASE_URL="" NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=""
RUN groupadd --gid 20011 app && useradd --no-log-init --uid 20011 --gid 20011 --no-create-home --shell /usr/sbin/nologin app
COPY --from=build --chown=20011:20011 /app/ /app/
USER 20011:20011
EXPOSE 3020
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3020", "--keepAliveTimeout", "70000"]
