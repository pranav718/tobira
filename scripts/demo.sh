#!/bin/bash

echo "building and starting peered cluster..."
docker-compose up -d --build

wait_for_health() {
  local port=$1
  echo "waiting for node on port $port to pass health check..."
  until curl -s "http://localhost:$port/health" | grep -q "ok"; do
    sleep 1
  done
}

wait_for_health 8080
wait_for_health 8081
wait_for_health 8082
wait_for_health 8083

echo "all nodes are healthy"

echo "compiling load generator..."
go build -o tobira-load cmd/load/main.go

echo "starting background load traffic..."
./tobira-load --targets="http://localhost:8080/api/resource,http://localhost:8081/api/resource,http://localhost:8082/api/resource,http://localhost:8083/api/resource" --rps=50 --duration=600 --workers=4 &
LOAD_PID=$!

echo "dashboard is accessible at http://localhost:3000"
echo "press ctrl+c to terminate the load test and spin down docker network"

cleanup() {
  echo "cleaning up..."
  kill $LOAD_PID 2>/dev/null
  docker-compose down
  rm -f tobira-load
}

trap cleanup INT TERM

wait $LOAD_PID
cleanup
