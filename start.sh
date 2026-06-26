#!/bin/sh

set -e

echo "=== Starting Tobira Multi-Process Container ==="

# start the go rate limiter nodes in the background
echo "-> Starting Go Rate Limiter Cluster Nodes (Ports 8080-8083)..."
./tobira-server -id node-1 -port 8080 -peers localhost:8081,localhost:8082,localhost:8083 &
./tobira-server -id node-2 -port 8081 -peers localhost:8080,localhost:8082,localhost:8083 &
./tobira-server -id node-3 -port 8082 -peers localhost:8080,localhost:8081,localhost:8083 &
./tobira-server -id node-4 -port 8083 -peers localhost:8080,localhost:8081,localhost:8082 &

# start the load generator to produce cluster requests in the background
echo "-> Starting traffic load generator..."
./tobira-load -targets=http://localhost:8080/api/resource,http://localhost:8081/api/resource,http://localhost:8082/api/resource,http://localhost:8083/api/resource -rps=20 -workers=2 -duration=999999999 &

# start nextjs production server in the background
echo "-> Starting Next.js frontend server (Port 3000)..."
cd web
npm run start -- -p 3000 &

# wait for background processes to initialize
sleep 3

# start caddy to route traffic from public $PORT
echo "-> Launching Caddy reverse proxy on public port $PORT..."
caddy run --config ../Caddyfile --adapter caddyfile
