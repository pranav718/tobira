# stage 1: build go rate limiter servers
FROM golang:1.22-alpine AS go-builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o tobira-server cmd/server/main.go
RUN go build -o tobira-load cmd/load/main.go

# stage 2: build nextjs web application
FROM node:20-alpine AS next-builder
WORKDIR /app
COPY web/package*.json ./web/
WORKDIR /app/web
RUN npm ci
WORKDIR /app
COPY web/ ./web/
WORKDIR /app/web
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# stage 3: runner container
FROM node:20-alpine AS runner
WORKDIR /app

# install caddy
RUN apk add --no-cache caddy

# copy go binaries
COPY --from=go-builder /app/tobira-server .
COPY --from=go-builder /app/tobira-load .

# copy nextjs frontend assets and production build
COPY --from=next-builder /app/web/package*.json ./web/
COPY --from=next-builder /app/web/.next ./web/.next
COPY --from=next-builder /app/web/public ./web/public
COPY --from=next-builder /app/web/node_modules ./web/node_modules

# copy configurations and entrypoint scripts
COPY Caddyfile .
COPY start.sh .
RUN chmod +x start.sh

# default railway fallback port
ENV PORT=3000
EXPOSE 3000

# entrypoint script starts backend nodes, frontend, and caddy proxy
CMD ["./start.sh"]
