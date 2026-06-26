# tobira

tobira is a high-concurrency, decentralized rate limiter cluster. it synchronizes rate limiting states across nodes using the gossip protocol and visualizes cluster metrics and topology in real time.

## cluster nodes

the cluster runs 4 peered server nodes and a web dashboard:
- node-1: http port 8080, udp port 9080
- node-2: http port 8081, udp port 9081
- node-3: http port 8082, udp port 9082
- node-4: http port 8083, udp port 9083
- dashboard: port 3000

## requirements

- go 1.22
- docker and docker compose
- node.js 20 (for local frontend development)

## quick start

to spin up the entire peered 4-node cluster along with the visual web dashboard and launch background traffic:

```bash
sh scripts/demo.sh
```

this script builds the server and web docker containers, starts the network, waits for all node health checks to pass, and starts the load generator client sending traffic across all nodes.

## dashboard navigation

visit the dashboard at:

    http://localhost:3000

the interface includes:
- node topology: a live d3 force-directed network showing node connections and real-time gossip packet movements.
- failure controls: buttons to simulate network partitions by muting gossip, muting heartbeats, or shutting down specific nodes.
- real-time metrics: stacked charts showing allowed versus blocked traffic (http 429) and request latencies.
