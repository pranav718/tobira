#!/bin/sh

set -e

echo "=== Starting Tobira Multi-Process Container ==="

# start the go rate limiter nodes in the background
echo "-> Starting Go Rate Limiter Cluster Nodes (Ports 9080-9083)..."
./tobira-server -id node-1 -port 9080 -peers localhost:9081,localhost:9082,localhost:9083 &
./tobira-server -id node-2 -port 9081 -peers localhost:9080,localhost:9082,localhost:9083 &
./tobira-server -id node-3 -port 9082 -peers localhost:9080,localhost:9081,localhost:9083 &
./tobira-server -id node-4 -port 9083 -peers localhost:9080,localhost:9081,localhost:9082 &

# start the load generator to produce cluster requests in the background
echo "-> Starting traffic load generator..."
./tobira-load -targets=http://localhost:9080/api/resource,http://localhost:9081/api/resource,http://localhost:9082/api/resource,http://localhost:9083/api/resource -rps=20 -workers=2 -duration=999999999 &

# start nextjs production server in the background
echo "-> Starting Next.js frontend server (Port 3000)..."
cd web
npm run start -- -p 3000 &

# wait for background processes to initialize
sleep 3

# start caddy to route traffic from public $PORT
echo "-> Launching Caddy reverse proxy on public port $PORT..."
caddy run --config ../Caddyfile --adapter caddyfile
