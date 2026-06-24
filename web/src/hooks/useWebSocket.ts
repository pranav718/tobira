import { useEffect, useState, useRef } from "react";

export type NodeStatus = "healthy" | "suspect" | "dead" | "unknown";

export interface PeerHealth {
	addr: string;
	last_seen: string;
	status: NodeStatus;
}

export interface NodeInfo {
	id: string;
	addr: string;
	peers: string[];
	health: { [key: string]: PeerHealth };
}

export interface MetricsSnapshot {
	requests_total: number;
	allowed_total: number;
	denied_total: number;
	average_latency_ms: number;
}

export interface LimitEvent {
	id: string;
	allowed: boolean;
	key: string;
	timestamp: string;
}

export interface GossipSignal {
	sender: string;
	timestamp: number;
	payload: unknown;
}

export function useWebSocket(nodeUrl: string) {
	const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("disconnected");
	const [cluster, setCluster] = useState<NodeInfo | null>(null);
	const [metrics, setMetrics] = useState<MetricsSnapshot>({
		requests_total: 0,
		allowed_total: 0,
		denied_total: 0,
		average_latency_ms: 0,
	});
	const [events, setEvents] = useState<LimitEvent[]>([]);
	const [lastGossipSignal, setLastGossipSignal] = useState<GossipSignal | null>(null);

	const socketRef = useRef<WebSocket | null>(null);
	const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const reconnectDelayRef = useRef(1000);

	const getHttpEndpoint = () => {
		const clean = nodeUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
		if (typeof window === "undefined") return `http://${clean}`;
		return `${window.location.protocol}//${clean}`;
	};

	const getWsEndpoint = () => {
		const clean = nodeUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
		if (typeof window === "undefined") return `ws://${clean}/ws`;
		const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
		return `${proto}//${clean}/ws`;
	};

	const fetchClusterInfo = async () => {
		try {
			const res = await fetch(`${getHttpEndpoint()}/nodes`);
			if (res.ok) {
				const data: NodeInfo = await res.json();
				setCluster(data);
			}
		} catch (err) {
			console.error("failed to fetch nodes topology:", err);
		}
	};

	useEffect(() => {
		let isMounted = true;
		
		fetchClusterInfo();
		const infoInterval = setInterval(() => {
			if (isMounted) fetchClusterInfo();
		}, 3000);

		function connect() {
			if (socketRef.current) {
				socketRef.current.close();
			}

			setStatus("connecting");
			const ws = new WebSocket(getWsEndpoint());
			socketRef.current = ws;

			ws.onopen = () => {
				if (!isMounted) return;
				setStatus("connected");
				reconnectDelayRef.current = 1000; 
				fetchClusterInfo();
			};

			ws.onmessage = (event) => {
				if (!isMounted) return;
				try {
					const msg = JSON.parse(event.data);
					const { event: eventName, data } = msg;

					switch (eventName) {
						case "metrics":
							setMetrics(data);
							break;

						case "health":
							fetchClusterInfo();
							break;

						case "gossip":
							setLastGossipSignal({
								sender: msg.node,
								timestamp: Date.now(),
								payload: data,
							});
							break;

						case "limit":
							setEvents((prev) => [
								{
									id: `${msg.node}-${Date.now()}-${Math.random()}`,
									allowed: data.allowed,
									key: data.key,
									timestamp: data.timestamp,
								},
								...prev.slice(0, 49), 
							]);
							break;
						default:
							break;
					}
				} catch (err) {
					console.error("error parsing websocket frame:", err);
				}
			};

			ws.onclose = () => {
				if (!isMounted) return;
				setStatus("disconnected");
				triggerReconnect();
			};

			ws.onerror = () => {
				ws.close();
			};
		}

		function triggerReconnect() {
			if (reconnectTimeoutRef.current) return;
			
			const delay = reconnectDelayRef.current;
			reconnectDelayRef.current = Math.min(delay * 2, 16000); 

			reconnectTimeoutRef.current = setTimeout(() => {
				reconnectTimeoutRef.current = null;
				connect();
			}, delay);
		}

		connect();

		return () => {
			isMounted = false;
			clearInterval(infoInterval);
			if (socketRef.current) {
				socketRef.current.close();
			}
			if (reconnectTimeoutRef.current) {
				clearTimeout(reconnectTimeoutRef.current);
			}
		};
	}, [nodeUrl]);

	return {
		status,
		cluster,
		metrics,
		events,
		lastGossipSignal,
		refreshCluster: fetchClusterInfo,
	};
}
