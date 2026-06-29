"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { useWebSocket } from "../hooks/useWebSocket";
import { TopologyGraph } from "../components/TopologyGraph";
import { MetricsCharts } from "../components/MetricsCharts";
import { ConfirmModal } from "../components/ConfirmModal";
import { ToastContainer, ToastData } from "../components/Toast";
import { GossipStateInspector } from "../components/GossipStateInspector";
import {
	Activity,
	RefreshCw,
	Terminal,
} from "lucide-react";

interface TerminalLine {
	text: string;
	type: "command" | "info" | "success" | "warning" | "error" | "output";
}

const TERMINAL_SEQUENCE: TerminalLine[] = [
	{ text: "$ go run cmd/server/main.go -id node-1 -port 9080 -peers localhost:9081,localhost:9082", type: "command" },
	{ text: "time=2026-06-25T10:11:12.000Z level=INFO msg=\"tobira starting\" node=node-1 port=9080 rate=10 window=60 metrics_reset=10 peers=localhost:9081,localhost:9082", type: "info" },
	{ text: "time=2026-06-25T10:11:12.002Z level=INFO msg=\"starting metrics reset loop\" interval_seconds=10", type: "output" },
	{ text: "time=2026-06-25T10:11:12.005Z level=INFO msg=\"tobira ready\" addr=http://localhost:9080", type: "success" },
	{ text: "$ go run cmd/load/main.go -targets=http://localhost:9080 -rps=50 -workers=4 -duration=10", type: "command" },
	{ text: "tobira load generator starting...", type: "info" },
	{ text: "targets:  [http://localhost:9080]", type: "output" },
	{ text: "rps:      50", type: "output" },
	{ text: "workers:  4", type: "output" },
	{ text: "time=2026-06-25T10:11:15.010Z level=INFO msg=\"gossip merged state\" from=node-2 merge_count=1", type: "info" },
	{ text: "time=2026-06-25T10:11:16.120Z level=DEBUG msg=\"rate limit evaluation\" key=127.0.0.1 allowed=true local_count=3 global_sum=8", type: "success" },
	{ text: "time=2026-06-25T10:11:16.420Z level=DEBUG msg=\"rate limit evaluation\" key=127.0.0.1 allowed=true local_count=4 global_sum=9", type: "success" },
	{ text: "time=2026-06-25T10:11:17.030Z level=WARN msg=\"rate limit exceeded\" key=127.0.0.1 allowed=false global_sum=11", type: "error" },
	{ text: "time=2026-06-25T10:11:18.110Z level=INFO msg=\"gossip merged state\" from=node-3 merge_count=2", type: "info" },
	{ text: "load test finished", type: "success" },
	{ text: "total requests: 500", type: "output" },
	{ text: "allowed (200):  450", type: "output" },
	{ text: "blocked (429):  50", type: "output" },
];

export default function Dashboard() {
	const [nodePort, setNodePort] = useState("9080");
	const [inputPort, setInputPort] = useState("9080");
	const [gossipMuted, setGossipMuted] = useState(false);
	const [heartbeatsMuted, setHeartbeatsMuted] = useState(false);
	const [activeAlgorithm, setActiveAlgorithm] = useState("fixed_window");
	const [algorithmLoading, setAlgorithmLoading] = useState(false);

	const ALGORITHMS = [
		{ id: "fixed_window", label: "fixed window" },
		{ id: "sliding_window", label: "sliding window" },
		{ id: "token_bucket", label: "token bucket" },
		{ id: "leaky_bucket", label: "leaky bucket" },
	];

	const [toasts, setToasts] = useState<ToastData[]>([]);
	const [confirmModal, setConfirmModal] = useState<{
		open: boolean;
		title: string;
		description: string;
		variant: "danger" | "warning" | "default";
		onConfirm: () => void;
	}>({ open: false, title: "", description: "", variant: "default", onConfirm: () => {} });

	const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([]);
	const terminalBodyRef = useRef<HTMLDivElement | null>(null);

	const getApiBaseUrl = useCallback(() => {
		if (typeof window === "undefined") return `http://localhost:${nodePort}`;
		if (window.location.hostname !== "localhost") {
			return `${window.location.protocol}//${window.location.host}/api/proxy/${nodePort}`;
		}
		return `http://localhost:${nodePort}`;
	}, [nodePort]);

	const nodeUrl = getApiBaseUrl();
	const { status, cluster, metrics, events, lastGossipSignal, gossipStats, refreshCluster } =
		useWebSocket(nodeUrl);

	useEffect(() => {
		let lineIndex = 0;
		const interval = setInterval(() => {
			if (lineIndex < TERMINAL_SEQUENCE.length) {
				const nextLine = TERMINAL_SEQUENCE[lineIndex];
				if (nextLine) {
					setTerminalLines((prev) => [...prev, nextLine]);
				}
				lineIndex++;
			} else {
				setTerminalLines([{ text: "clearing buffer...", type: "info" }]);
				lineIndex = 0;
			}
		}, 1200);

		return () => clearInterval(interval);
	}, []);

	useEffect(() => {
		if (terminalBodyRef.current) {
			terminalBodyRef.current.scrollTop = terminalBodyRef.current.scrollHeight;
		}
	}, [terminalLines]);

	const addToast = useCallback((message: string, variant: ToastData["variant"]) => {
		const id = `${Date.now()}-${Math.random()}`;
		setToasts((prev) => [...prev, { id, message, variant }]);
	}, []);

	const dismissToast = useCallback((id: string) => {
		setToasts((prev) => prev.filter((t) => t.id !== id));
	}, []);

	const handlePortChange = (e: React.FormEvent) => {
		e.preventDefault();
		if (inputPort.trim() !== "") {
			setNodePort(inputPort);
			setGossipMuted(false);
			setHeartbeatsMuted(false);
			addToast(`Switched target connection to port ${inputPort}`, "info");
		}
	};

	useEffect(() => {
		const fetchAlgorithm = async () => {
			try {
				const res = await fetch(`${nodeUrl}/health`);
				if (res.ok) {
					const data = await res.json();
					if (data.algorithm) setActiveAlgorithm(data.algorithm);
				}
			} catch { }
		};
		fetchAlgorithm();
	}, [nodeUrl]);

	const switchAlgorithm = async (algorithm: string) => {
		if (algorithm === activeAlgorithm || algorithmLoading) return;
		setAlgorithmLoading(true);
		try {
			const res = await fetch(
				`${nodeUrl}/api/admin/algorithm?algorithm=${algorithm}`,
				{ method: "POST" }
			);
			if (res.ok) {
				setActiveAlgorithm(algorithm);
				addToast(`Algorithm switched to ${algorithm.replace(/_/g, " ")}`, "success");
			} else {
				addToast("Failed to switch algorithm", "error");
			}
		} catch {
			addToast("Error connecting to node administration API", "error");
		} finally {
			setAlgorithmLoading(false);
		}
	};

	const toggleGossip = async () => {
		const nextMute = !gossipMuted;
		try {
			const res = await fetch(
				`${nodeUrl}/api/admin/gossip?muted=${nextMute}`,
				{ method: "POST" }
			);
			if (res.ok) {
				setGossipMuted(nextMute);
				addToast(
					`Gossip on port ${nodePort}: ${nextMute ? "Muted" : "Active"}`,
					nextMute ? "info" : "success"
				);
			} else {
				addToast("Failed to update gossip settings", "error");
			}
		} catch {
			addToast("Error connecting to node administration API", "error");
		}
	};

	const toggleHeartbeats = async () => {
		const nextMute = !heartbeatsMuted;
		try {
			const res = await fetch(
				`${nodeUrl}/api/admin/heartbeat?muted=${nextMute}`,
				{ method: "POST" }
			);
			if (res.ok) {
				setHeartbeatsMuted(nextMute);
				addToast(
					`Heartbeats on port ${nodePort}: ${nextMute ? "Muted" : "Active"}`,
					nextMute ? "info" : "success"
				);
			} else {
				addToast("Failed to update heartbeat settings", "error");
			}
		} catch {
			addToast("Error connecting to node administration API", "error");
		}
	};

	const shutdownNode = () => {
		setConfirmModal({
			open: true,
			title: `Simulate software crash on port ${nodePort}?`,
			description:
				"This will simulate a complete network and process crash for 30 seconds. The node will drop offline, stop gossiping, and disconnect from all clients, then automatically recover after 30 seconds.",
			variant: "danger",
			onConfirm: async () => {
				setConfirmModal((prev) => ({ ...prev, open: false }));
				try {
					const res = await fetch(
						`${nodeUrl}/api/admin/shutdown`,
						{ method: "POST" }
					);
					if (res.ok) {
						addToast(`Simulated crash triggered on port ${nodePort} (auto-recovers in 30s)`, "success");
					} else {
						addToast("Failed to trigger simulated crash", "error");
					}
				} catch {
					addToast("Error sending crash simulation command", "error");
				}
			},
		});
	};

	const total = metrics.requests_total;
	const allowed = metrics.allowed_total;
	const denied = metrics.denied_total;
	const deniedPercent = total > 0 ? ((denied / total) * 100).toFixed(1) : "0.0";
	const successPercent = total > 0 ? ((allowed / total) * 100).toFixed(1) : "0.0";

	return (
		<div className="min-h-screen bg-[#0a0a0a] text-zinc-100 font-sans selection:bg-[#fbbf24] selection:text-black">
			<header className="border-b-2 border-zinc-800 bg-[#141414]/90 sticky top-0 z-40">
				<div className="max-w-[1440px] mx-auto px-6 py-4 grid grid-cols-2 md:grid-cols-3 items-center gap-4">
					<div className="hidden md:flex justify-start">
					</div>

					<div className="flex justify-start md:justify-center">
						<h1 className="text-xl font-bold tracking-widest text-white font-mono">
							tobira
						</h1>
					</div>

					<div className="flex justify-end items-center gap-3">
						<a
							href="https://github.com/pranav718/tobira"
							target="_blank"
							rel="noreferrer"
							className="neo-btn px-3 py-1.5 text-xs font-mono font-bold"
						>
							<svg
								viewBox="0 0 24 24"
								width="16"
								height="16"
								stroke="currentColor"
								strokeWidth="2"
								fill="none"
								strokeLinecap="round"
								strokeLinejoin="round"
								className="w-4 h-4 text-zinc-400"
							>
								<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
							</svg>
							GitHub
						</a>
						<a
							href="#console"
							className="neo-btn px-3 py-1.5 text-xs font-mono font-bold"
						>
							console workspace
						</a>
					</div>
				</div>
			</header>

			<section className="border-b-2 border-zinc-800 bg-[#0e0e0e] py-12 lg:py-20 relative overflow-hidden">
				<div className="max-w-[1440px] mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
					<div className="lg:col-span-6 flex flex-col gap-6">
						<h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-white leading-tight font-sans">
							high performance <span className="text-[#fbbf24]">distributed</span> rate limiting.
						</h2>
						
						<p className="text-base text-zinc-400 leading-relaxed font-mono">
							a high-concurrency rate limiter cluster built in go, designed to coordinate request policies across nodes using a peer-to-peer udp gossip protocol. leverages convergent g-counters to track rate limits without central redis databases or single points of failure.
						</p>

						<div className="border-2 border-zinc-800 rounded-xl p-5 bg-zinc-900/30 text-xs leading-relaxed text-zinc-400 font-mono flex flex-col gap-3">
							<p>
								<strong className="text-white">what is this project?</strong> most rate limiters count user requests by saving them in a single central database like redis. if that database crashes, the entire application breaks. tobira works differently: multiple servers talk directly to each other to share request counts. if one server goes down, the others continue running and sharing the load.
							</p>
							<p>
								detailed information on how the go code is designed, how to build the cluster, and how to run tests can be found in the project documentation.
							</p>
							<a
								href="https://github.com/pranav718/tobira#readme"
								target="_blank"
								rel="noreferrer"
								className="text-xs text-[#fbbf24] hover:underline flex items-center gap-1.5 mt-1 font-bold"
							>
								read the full implementation details in readme.md
							</a>
						</div>

						<div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mt-2 p-4 border-2 border-zinc-800 rounded-xl bg-zinc-900/50">
							<form onSubmit={handlePortChange} className="flex items-center gap-2 flex-wrap">
								<span className="text-xs font-mono font-bold text-zinc-400">connect port:</span>
								<input
									type="number"
									value={inputPort}
									onChange={(e) => setInputPort(e.target.value)}
									className="neo-input w-24 text-center"
									placeholder="9080"
								/>
								<button type="submit" className="neo-btn-accent px-4 py-1.5 text-xs font-mono">
									go
								</button>
							</form>

							<div className="h-6 w-[2px] bg-zinc-800 hidden sm:block" />

							<div className="flex items-center gap-2">
								<span className="text-xs font-mono font-bold text-zinc-400">status:</span>
								<div className={`border-2 px-3 py-1 rounded-lg text-xs font-mono font-black tracking-wider ${
									status === "connected" ? "bg-[#10b981]/15 border-[#10b981] text-[#10b981]" :
									status === "connecting" ? "bg-[#fbbf24]/15 border-[#fbbf24] text-[#fbbf24] animate-pulse" :
									"bg-[#ef4444]/15 border-[#ef4444] text-[#ef4444]"
								}`}>
									{status}
								</div>
							</div>
						</div>
					</div>

					<div className="lg:col-span-6">
						<div className="border-2 border-zinc-800 rounded-xl overflow-hidden shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] bg-zinc-950 flex flex-col h-[400px]">
							<div className="bg-zinc-900 border-b-2 border-zinc-800 px-4 py-3 flex items-center justify-between">
								<div className="flex items-center gap-2">
									<div className="w-3 h-3 rounded-full bg-[#ef4444] border border-black" />
									<div className="w-3 h-3 rounded-full bg-[#fbbf24] border border-black" />
									<div className="w-3 h-3 rounded-full bg-[#10b981] border border-black" />
								</div>
								<div className="text-xs text-zinc-500 font-mono font-bold flex items-center gap-1.5">
									<Terminal className="w-3.5 h-3.5 text-zinc-500" />
									bash - tobira-node
								</div>
								<div className="w-12" />
							</div>

							<div ref={terminalBodyRef} className="p-4 flex-1 overflow-y-auto font-mono text-xs leading-relaxed space-y-2 select-text">
								{terminalLines.map((line, idx) => {
									if (!line) return null;
									return (
										<div key={idx} className="flex gap-2">
											{line.type === "command" ? (
												<span className="text-zinc-500 select-none">&gt;</span>
											) : null}
											<span className={
												line.type === "command" ? "text-white font-bold" :
												line.type === "info" ? "text-[#6366f1]" :
												line.type === "success" ? "text-[#10b981] font-semibold" :
												line.type === "error" ? "text-[#ef4444] font-semibold" :
												line.type === "output" ? "text-zinc-400" : "text-zinc-500"
											}>
												{line.text}
											</span>
										</div>
									);
								})}
							</div>
						</div>
					</div>
				</div>
			</section>

			<main id="console" className="max-w-[1440px] mx-auto px-6 py-12 flex flex-col gap-10">
				
				<div className="border-b-2 border-zinc-800 pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
					<div>
						<h2 className="text-2xl font-bold text-white tracking-wider font-mono flex items-center gap-2">
							interactive limiter workspace
						</h2>
						<p className="text-xs text-zinc-500 mt-1">
							simulate latency spikes, network partitions, or node mutations live
						</p>
					</div>

					<button
						onClick={refreshCluster}
						className="neo-btn px-4 py-2 text-xs font-mono font-bold"
						title="Force refresh topology layout"
					>
						<RefreshCw className="w-4 h-4" />
						sync topology
					</button>
				</div>

				<section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
					<div className="neo-card p-4 bg-[#141414] hover:shadow-[4px_4px_0px_0px_#fbbf24] hover:border-[#fbbf24]">
						<span className="text-[10px] font-bold text-zinc-500 font-mono tracking-wider">throughput</span>
						<h3 className="text-xl font-black text-white mt-1 font-mono">{total}</h3>
						<p className="text-[9px] text-zinc-500 mt-0.5">total calls</p>
					</div>
					<div className="neo-card p-4 bg-[#141414] hover:shadow-[4px_4px_0px_0px_#10b981] hover:border-[#10b981]">
						<span className="text-[10px] font-bold text-zinc-500 font-mono tracking-wider">allowed</span>
						<h3 className="text-xl font-black text-[#10b981] mt-1 font-mono">{successPercent}%</h3>
						<p className="text-[9px] text-zinc-500 mt-0.5">{allowed} calls</p>
					</div>
					<div className="neo-card p-4 bg-[#141414] hover:shadow-[4px_4px_0px_0px_#ef4444] hover:border-[#ef4444]">
						<span className="text-[10px] font-bold text-zinc-500 font-mono tracking-wider">blocked</span>
						<h3 className="text-xl font-black text-[#ef4444] mt-1 font-mono">{deniedPercent}%</h3>
						<p className="text-[9px] text-zinc-500 mt-0.5 font-mono">{denied} 429 requests</p>
					</div>
					<div className="neo-card p-4 bg-[#141414] hover:shadow-[4px_4px_0px_0px_#6366f1] hover:border-[#6366f1]">
						<span className="text-[10px] font-bold text-zinc-500 font-mono tracking-wider">latency</span>
						<h3 className="text-xl font-black text-[#6366f1] mt-1 font-mono">
							{metrics.average_latency_ms.toFixed(2)}
							<span className="text-xs text-zinc-500 ml-0.5">ms</span>
						</h3>
						<p className="text-[9px] text-zinc-500 mt-0.5">evaluation avg</p>
					</div>
				</section>

				<section className="grid grid-cols-1 lg:grid-cols-12 gap-8">
					
					<div className="lg:col-span-8">
						<TopologyGraph
							cluster={cluster}
							activeNodeId={cluster?.id || ""}
							lastGossipSignal={lastGossipSignal}
						/>
					</div>

					<div className="lg:col-span-4 flex flex-col gap-8">
						
						<div className="neo-card p-5 bg-[#141414]">
							<h3 className="text-base font-bold text-white flex items-center gap-2 tracking-wide border-b border-zinc-800 pb-3">
								failure simulator
							</h3>
							<p className="text-xs text-zinc-500 font-mono mt-2">
								simulate partition splits by shutting off udp heartbeats or gossip merges
							</p>

							<div className="flex flex-col gap-3 mt-4">
								<button
									onClick={toggleHeartbeats}
									className={`flex items-center justify-between px-3.5 py-3 border-2 rounded-xl transition font-mono text-xs font-bold ${
										heartbeatsMuted
											? "bg-[#fbbf24]/10 border-[#fbbf24] text-[#fbbf24]"
											: "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
									}`}
								>
									<span className="flex items-center gap-2">
										mute heartbeats
									</span>
									<span className="text-[10px] px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 uppercase">
										{heartbeatsMuted ? "muted" : "active"}
									</span>
								</button>

								<button
									onClick={toggleGossip}
									className={`flex items-center justify-between px-3.5 py-3 border-2 rounded-xl transition font-mono text-xs font-bold ${
										gossipMuted
											? "bg-[#fbbf24]/10 border-[#fbbf24] text-[#fbbf24]"
											: "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
									}`}
								>
									<span className="flex items-center gap-2">
										mute gossip sync
									</span>
									<span className="text-[10px] px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 uppercase">
										{gossipMuted ? "muted" : "active"}
									</span>
								</button>

								<button
									onClick={shutdownNode}
									className="neo-btn-danger w-full mt-2 py-3 text-xs font-mono"
								>
									crash active node
								</button>
							</div>
						</div>

						<div className="neo-card p-5 bg-[#141414]">
							<h3 className="text-base font-bold text-white flex items-center gap-2 tracking-wide border-b border-zinc-800 pb-3">
								algorithm
								<span className="ml-auto text-[10px] px-2 py-0.5 rounded bg-[#fbbf24]/10 border border-[#fbbf24] text-[#fbbf24] font-mono tracking-wider">
									{activeAlgorithm.replace(/_/g, " ")}
								</span>
							</h3>
							<p className="text-xs text-zinc-500 font-mono mt-2">
								swap the active rate limiting algorithm on this node in real time
							</p>
							<div className="flex flex-col gap-2 mt-4">
								{ALGORITHMS.map((algo) => (
									<button
										key={algo.id}
										onClick={() => switchAlgorithm(algo.id)}
										disabled={algorithmLoading}
										className={`flex items-center justify-between px-3.5 py-3 border-2 rounded-xl transition font-mono text-xs font-bold disabled:opacity-50 ${
											activeAlgorithm === algo.id
												? "bg-[#fbbf24]/10 border-[#fbbf24] text-[#fbbf24]"
												: "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
										}`}
									>
										<span>{algo.label}</span>
										{activeAlgorithm === algo.id && (
											<span className="text-[10px] px-2 py-0.5 rounded bg-zinc-950 border border-[#fbbf24]">
												active
											</span>
										)}
									</button>
								))}
							</div>
						</div>

						<div className="neo-card p-5 bg-[#141414] flex flex-col flex-grow min-h-[250px]">
							<h3 className="text-base font-bold text-white flex items-center gap-2 tracking-wide border-b border-zinc-800 pb-3">
								node request log
							</h3>
							
							<div className="bg-zinc-950 border-2 border-zinc-800 rounded-xl p-3 flex-grow overflow-y-auto max-h-[250px] font-mono text-[10px] leading-relaxed text-zinc-400 mt-4">
								{events.length === 0 ? (
									<div className="text-zinc-700 text-center py-10 flex flex-col items-center gap-2">
										<Activity className="w-8 h-8 text-zinc-800 animate-pulse" />
										<span>listening for rate limiting traffic...</span>
									</div>
								) : (
									<div className="space-y-1.5">
										{events.map((ev) => (
											<div
												key={ev.id}
												className="flex justify-between border-b border-zinc-900 pb-1"
											>
												<span className="flex gap-2">
													<span
														className={
															ev.allowed
																? "text-[#10b981] font-bold"
																: "text-[#ef4444] font-bold"
														}
													>
														{ev.allowed ? "ALLOW" : "BLOCK"}
													</span>
													<span className="text-zinc-300 font-bold">{ev.key}</span>
												</span>
												<span className="text-zinc-600 select-none">
													{new Date(ev.timestamp).toLocaleTimeString()}
												</span>
											</div>
										))}
									</div>
								)}
							</div>
						</div>
					</div>
				</section>

				<section className="neo-card p-6 bg-[#141414] border-2 border-zinc-800">
					<h3 className="text-base font-bold text-white tracking-wider font-mono border-b border-zinc-800 pb-3 mb-4 flex items-center gap-2">
						tobira instruction
					</h3>
					
					<div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm leading-relaxed text-zinc-400 font-mono">
						<div className="flex flex-col gap-4">
							<div className="flex gap-3">
								<span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#fbbf24] text-black font-bold flex items-center justify-center text-xs">
									1
								</span>
								<div>
									<h4 className="text-white font-bold text-xs tracking-wider">start the cluster</h4>
									<p className="text-xs text-zinc-500 mt-1">
										run <code className="text-[#fbbf24] bg-zinc-900 px-1 py-0.5 rounded">sh scripts/demo.sh</code> in your terminal. this orchestrates 4 peered docker containers and spins up the next.js console dashboard.
									</p>
								</div>
							</div>

							<div className="flex gap-3">
								<span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#fbbf24] text-black font-bold flex items-center justify-center text-xs">
									2
								</span>
								<div>
									<h4 className="text-white font-bold text-xs tracking-wider">generate client traffic</h4>
									<p className="text-xs text-zinc-500 mt-1">
										the demo script launches <code className="text-[#fbbf24] bg-zinc-900 px-1 py-0.5 rounded">tobira-load</code> to dispatch background http traffic across nodes at a rate of 50 rps. you will see allowed/denied metrics fluctuate live.
									</p>
								</div>
							</div>
						</div>

						<div className="flex flex-col gap-4">
							<div className="flex gap-3">
								<span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#fbbf24] text-black font-bold flex items-center justify-center text-xs">
									3
								</span>
								<div>
									<h4 className="text-white font-bold text-xs tracking-wider">mute gossip / partitions</h4>
									<p className="text-xs text-zinc-500 mt-1">
										mute gossip sync or heartbeats using the simulator buttons. watch the nodes turn to suspect (yellow) or dead (red) as failure detectors report state divergence.
									</p>
								</div>
							</div>

							<div className="flex gap-3">
								<span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#fbbf24] text-black font-bold flex items-center justify-center text-xs">
									4
								</span>
								<div>
									<h4 className="text-white font-bold text-xs tracking-wider">crash and recover nodes</h4>
									<p className="text-xs text-zinc-500 mt-1">
										crash nodes to test failover routing. the cluster automatically detects dead peers, re-routes state updates, and merges g-counters back together when the node recovers.
									</p>
								</div>
							</div>
						</div>
					</div>
				</section>

				<section>
					<GossipStateInspector
						gossipStats={gossipStats}
						localNodeId={cluster?.id || ""}
					/>
				</section>

				<section className="mb-6">
					<MetricsCharts metrics={metrics} />
				</section>
			</main>

			<ConfirmModal
				open={confirmModal.open}
				title={confirmModal.title}
				description={confirmModal.description}
				variant={confirmModal.variant}
				confirmLabel="SIMULATE CRASH"
				onConfirm={confirmModal.onConfirm}
				onCancel={() => setConfirmModal((prev) => ({ ...prev, open: false }))}
			/>

			<ToastContainer toasts={toasts} onDismiss={dismissToast} />
		</div>
	);
}
