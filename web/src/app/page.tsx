"use client";

import React, { useState } from "react";
import { useWebSocket } from "../hooks/useWebSocket";
import { TopologyGraph } from "../components/TopologyGraph";
import { MetricsCharts } from "../components/MetricsCharts";
import {
	Activity,
	Radio,
	Heart,
	Power,
	RefreshCw,
	Settings,
	Shield,
	Terminal,
	AlertTriangle,
} from "lucide-react";

export default function Dashboard() {
	const [nodePort, setNodePort] = useState("8080");
	const [inputPort, setInputPort] = useState("8080");
	const [gossipMuted, setGossipMuted] = useState(false);
	const [heartbeatsMuted, setHeartbeatsMuted] = useState(false);
	const [actionMessage, setActionMessage] = useState("");

	const nodeUrl = `http://localhost:${nodePort}`;
	const { status, cluster, metrics, events, lastGossipSignal, refreshCluster } = useWebSocket(nodeUrl);

	const handlePortChange = (e: React.FormEvent) => {
		e.preventDefault();
		if (inputPort.trim() !== "") {
			setNodePort(inputPort);
			// Reset simulation state indicators
			setGossipMuted(false);
			setHeartbeatsMuted(false);
			setActionMessage(`Switched target connection to Node on port ${inputPort}`);
		}
	};

	const toggleGossip = async () => {
		const nextMute = !gossipMuted;
		try {
			const res = await fetch(`http://localhost:${nodePort}/api/admin/gossip?muted=${nextMute}`, {
				method: "POST",
			});
			if (res.ok) {
				setGossipMuted(nextMute);
				setActionMessage(`Gossip transmission on Node ${nodePort} set to: ${nextMute ? "MUTED" : "ACTIVE"}`);
			} else {
				setActionMessage("Failed to update gossip settings.");
			}
		} catch (err) {
			console.error(err);
			setActionMessage("Error connecting to Node administration API.");
		}
	};

	const toggleHeartbeats = async () => {
		const nextMute = !heartbeatsMuted;
		try {
			const res = await fetch(`http://localhost:${nodePort}/api/admin/heartbeat?muted=${nextMute}`, {
				method: "POST",
			});
			if (res.ok) {
				setHeartbeatsMuted(nextMute);
				setActionMessage(`Heartbeats from Node ${nodePort} set to: ${nextMute ? "MUTED" : "ACTIVE"}`);
			} else {
				setActionMessage("Failed to update heartbeat settings.");
			}
		} catch (err) {
			console.error(err);
			setActionMessage("Error connecting to Node administration API.");
		}
	};

	const shutdownNode = async () => {
		if (!confirm(`Are you sure you want to shut down Node on port ${nodePort}?`)) return;
		try {
			const res = await fetch(`http://localhost:${nodePort}/api/admin/shutdown`, {
				method: "POST",
			});
			if (res.ok) {
				setActionMessage(`Node on port ${nodePort} shutdown command successfully sent!`);
			} else {
				setActionMessage("Failed to initiate node shutdown.");
			}
		} catch (err) {
			console.error(err);
			setActionMessage("Error sending shutdown command.");
		}
	};

	const total = metrics.requests_total;
	const allowed = metrics.allowed_total;
	const denied = metrics.denied_total;
	const deniedPercent = total > 0 ? ((denied / total) * 100).toFixed(1) : "0.0";
	const successPercent = total > 0 ? ((allowed / total) * 100).toFixed(1) : "0.0";

	return (
		<div className="min-h-screen bg-gray-950 text-gray-100 font-sans p-6">
			<header className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-8 shadow-2xl gap-4">
				<div className="flex items-center gap-3">
					<div className="bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/20 text-emerald-400">
						<Shield className="w-6 h-6 animate-pulse" />
					</div>
					<div>
						<h1 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
							tobira <span className="text-xs px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-400 font-normal">console</span>
						</h1>
						<p className="text-xs text-gray-400 mt-0.5">distributed gossip rate limiter coordinator dashboard</p>
					</div>
				</div>

				<div className="flex flex-wrap items-center gap-4">
					<div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs border font-medium ${
						status === "connected"
							? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
							: status === "connecting"
							? "bg-amber-500/10 border-amber-500/20 text-amber-400 animate-pulse"
							: "bg-red-500/10 border-red-500/20 text-red-400"
					}`}>
						<span className={`w-2 h-2 rounded-full ${
							status === "connected" ? "bg-emerald-400" : status === "connecting" ? "bg-amber-400" : "bg-red-400"
						}`}></span>
						{status.toUpperCase()}
					</div>

					<form onSubmit={handlePortChange} className="flex items-center gap-2 bg-gray-950 px-2 py-1 rounded-xl border border-gray-800">
						<span className="text-[10px] text-gray-500 font-mono px-1">port</span>
						<input
							type="number"
							value={inputPort}
							onChange={(e) => setInputPort(e.target.value)}
							className="w-16 bg-transparent text-sm text-white font-mono focus:outline-none border-none py-1 text-center"
							placeholder="8080"
						/>
						<button
							type="submit"
							className="text-xs bg-gray-800 hover:bg-gray-700 active:bg-gray-800 text-white px-2.5 py-1 rounded-lg border border-gray-700 transition"
						>
							connect
						</button>
					</form>

					<button
						onClick={refreshCluster}
						className="p-2 bg-gray-800 hover:bg-gray-700 active:bg-gray-800 border border-gray-700 rounded-xl transition text-gray-300"
						title="Force Refresh Cluster Topology"
					>
						<RefreshCw className="w-4 h-4" />
					</button>
				</div>
			</header>

			<main className="max-w-7xl mx-auto flex flex-col gap-8">
				{actionMessage && (
					<div className="flex items-center gap-2 bg-blue-950/20 border border-blue-800/20 rounded-xl px-4 py-2.5 text-xs text-blue-400 select-none">
						<Settings className="w-4 h-4 animate-spin text-blue-400" />
						{actionMessage}
					</div>
				)}

				<section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
					<div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-xl flex items-center justify-between">
						<div>
							<span className="text-[10px] uppercase font-bold tracking-wider text-gray-500">throughput (interval)</span>
							<h2 className="text-2xl font-black text-white mt-1">{total}</h2>
							<p className="text-[10px] text-gray-400 mt-1">total requests processed</p>
						</div>
						<div className="bg-blue-500/10 p-3 rounded-xl border border-blue-500/20 text-blue-400">
							<Activity className="w-5 h-5" />
						</div>
					</div>

					<div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-xl flex items-center justify-between">
						<div>
							<span className="text-[10px] uppercase font-bold tracking-wider text-gray-500">allowed rate</span>
							<h2 className="text-2xl font-black text-emerald-400 mt-1">{successPercent}%</h2>
							<p className="text-[10px] text-emerald-500/80 mt-1">{allowed} requests succeeded</p>
						</div>
						<div className="bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20 text-emerald-400">
							<Shield className="w-5 h-5" />
						</div>
					</div>

					<div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-xl flex items-center justify-between">
						<div>
							<span className="text-[10px] uppercase font-bold tracking-wider text-gray-500">denied rate</span>
							<h2 className="text-2xl font-black text-rose-500 mt-1">{deniedPercent}%</h2>
							<p className="text-[10px] text-rose-500/80 mt-1">{denied} requests blocked</p>
						</div>
						<div className="bg-rose-500/10 p-3 rounded-xl border border-rose-500/20 text-rose-500">
							<AlertTriangle className="w-5 h-5" />
						</div>
					</div>

					<div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-xl flex items-center justify-between">
						<div>
							<span className="text-[10px] uppercase font-bold tracking-wider text-gray-500">latency (avg)</span>
							<h2 className="text-2xl font-black text-violet-400 mt-1">{metrics.average_latency_ms.toFixed(2)}ms</h2>
							<p className="text-[10px] text-gray-400 mt-1">limiting evaluation duration</p>
						</div>
						<div className="bg-violet-500/10 p-3 rounded-xl border border-violet-500/20 text-violet-400">
							<RefreshCw className="w-5 h-5" />
						</div>
					</div>
				</section>

				<section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
					<div className="lg:col-span-2">
						<TopologyGraph
							cluster={cluster}
							activeNodeId={cluster?.id || ""}
							lastGossipSignal={lastGossipSignal}
						/>
					</div>

					<div className="flex flex-col gap-6">
						<div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-2xl">
							<h3 className="text-md font-bold text-white flex items-center gap-1.5">
								<Settings className="w-4 h-4 text-gray-400" />
								failure simulator
							</h3>
							<p className="text-xs text-gray-400 mt-0.5">mute interfaces to simulate partition splits or crash nodes</p>

							<div className="flex flex-col gap-3 mt-4">
								<button
									onClick={toggleHeartbeats}
									className={`flex items-center justify-between px-4 py-3 rounded-xl border transition text-sm font-semibold ${
										heartbeatsMuted
											? "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
											: "bg-gray-850 border-gray-800 text-gray-200 hover:bg-gray-800"
									}`}
								>
									<span className="flex items-center gap-2">
										<Heart className={`w-4 h-4 ${heartbeatsMuted ? "fill-amber-400" : ""}`} />
										mute heartbeats (udp)
									</span>
									<span className="text-[10px] px-2 py-0.5 rounded font-mono uppercase bg-gray-950 border border-gray-800">
										{heartbeatsMuted ? "muted" : "active"}
									</span>
								</button>

								<button
									onClick={toggleGossip}
									className={`flex items-center justify-between px-4 py-3 rounded-xl border transition text-sm font-semibold ${
										gossipMuted
											? "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
											: "bg-gray-850 border-gray-800 text-gray-200 hover:bg-gray-800"
									}`}
								>
									<span className="flex items-center gap-2">
										<Radio className={`w-4 h-4 ${gossipMuted ? "animate-pulse" : ""}`} />
										mute gossip state sync
									</span>
									<span className="text-[10px] px-2 py-0.5 rounded font-mono uppercase bg-gray-950 border border-gray-800">
										{gossipMuted ? "muted" : "active"}
									</span>
								</button>

								<button
									onClick={shutdownNode}
									className="flex items-center justify-center gap-2 w-full mt-2 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-semibold py-3 rounded-xl text-sm border border-red-500/30 transition shadow-lg"
								>
									<Power className="w-4 h-4" />
									crash node (graceful stop)
								</button>
							</div>
						</div>

						<div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-2xl flex flex-col flex-grow min-h-[220px]">
							<h3 className="text-md font-bold text-white flex items-center gap-1.5 mb-3">
								<Terminal className="w-4 h-4 text-gray-400" />
								limiter event log
							</h3>

							<div className="bg-gray-950 border border-gray-850 rounded-xl p-3 flex-grow overflow-y-auto max-h-[200px] font-mono text-[10px] leading-relaxed text-gray-300">
								{events.length === 0 ? (
									<div className="text-gray-500 text-center py-8">waiting for api traffic...</div>
								) : (
									<div className="space-y-1.5">
										{events.map((ev) => (
											<div key={ev.id} className="flex justify-between border-b border-gray-900 pb-1">
												<span className="flex gap-2">
													<span className={ev.allowed ? "text-emerald-400 font-bold" : "text-rose-500 font-bold"}>
														{ev.allowed ? "ALLOW" : "BLOCK"}
													</span>
													<span className="text-gray-400">{ev.key}</span>
												</span>
												<span className="text-gray-500 select-none">
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

				<section className="mb-6">
					<MetricsCharts metrics={metrics} />
				</section>
			</main>
		</div>
	);
}
