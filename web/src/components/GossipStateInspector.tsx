"use client";

import React, { useEffect, useState } from "react";
import { GitMerge, Database, Clock } from "lucide-react";
import { GossipStats } from "../hooks/useWebSocket";

interface GossipStateInspectorProps {
	gossipStats: GossipStats;
	localNodeId: string;
}

export function GossipStateInspector({ gossipStats, localNodeId }: GossipStateInspectorProps) {
	const [flashKeys, setFlashKeys] = useState<Set<string>>(new Set());

	useEffect(() => {
		if (gossipStats.changedKeys.size > 0) {
			setFlashKeys(new Set(gossipStats.changedKeys));
			const timer = setTimeout(() => setFlashKeys(new Set()), 1200);
			return () => clearTimeout(timer);
		}
	}, [gossipStats.mergeCount]);

	const allNodeIds = new Set<string>();
	for (const nodeCounts of Object.values(gossipStats.state)) {
		for (const nodeId of Object.keys(nodeCounts)) {
			allNodeIds.add(nodeId);
		}
	}
	const sortedNodeIds = Array.from(allNodeIds).sort();
	const stateEntries = Object.entries(gossipStats.state).sort(([a], [b]) => a.localeCompare(b));

	const timeSinceLastMerge = gossipStats.lastMergeTime
		? Math.round((Date.now() - gossipStats.lastMergeTime) / 1000)
		: null;

	const [, setTick] = useState(0);
	useEffect(() => {
		const interval = setInterval(() => setTick((t) => t + 1), 1000);
		return () => clearInterval(interval);
	}, []);

	return (
		<div className="neo-card p-5 bg-[#141414]">
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 border-b border-zinc-800 pb-4">
				<div>
					<h3 className="text-base font-bold text-white flex items-center gap-2 tracking-wide">
						crdt g-counter state matrix
					</h3>
					<p className="text-xs text-zinc-500 font-mono mt-1">
						live convergent vector state across all nodes
					</p>
				</div>

				<div className="flex items-center gap-3 flex-wrap">
					<div className="flex items-center gap-2 text-xs font-mono bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded-lg">
						<GitMerge className="w-3.5 h-3.5 text-[#6366f1]" />
						<span className="text-zinc-400">merges:</span>
						<span className="text-[#6366f1] font-bold">{gossipStats.mergeCount}</span>
					</div>
					{timeSinceLastMerge !== null && (
						<div className="flex items-center gap-1.5 text-xs font-mono bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded-lg text-zinc-400">
							<Clock className="w-3.5 h-3.5 text-zinc-500" />
							<span>synced:</span>
							<span className="text-white font-bold">{timeSinceLastMerge}s ago</span>
						</div>
					)}
				</div>
			</div>

			{stateEntries.length === 0 ? (
				<div className="border-2 border-dashed border-zinc-800 rounded-xl p-8 text-center bg-zinc-900/50">
					<Database className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
					<p className="text-sm font-semibold text-zinc-400">
						no cluster state data synced yet
					</p>
					<p className="text-xs text-zinc-600 mt-1 font-mono">
						send requests via `tobira-load` or `curl` to populate g-counters
					</p>
				</div>
			) : (
				<div className="border-2 border-zinc-800 rounded-xl overflow-hidden bg-zinc-950">
					<div className="overflow-x-auto max-h-[350px] overflow-y-auto">
						<table className="w-full text-xs font-mono">
							<thead>
								<tr className="bg-zinc-900 border-b-2 border-zinc-800">
									<th className="text-left py-3 px-4 text-zinc-400 font-bold tracking-wider sticky top-0 left-0 z-30 bg-zinc-900 border-r border-zinc-800 border-b-2 border-zinc-800">
										client id / key
									</th>
									{sortedNodeIds.map((nodeId) => (
										<th
											key={nodeId}
											className={`text-center py-3 px-4 font-bold tracking-wider border-r border-zinc-800 sticky top-0 z-20 bg-zinc-900 border-b-2 border-zinc-800 ${
												nodeId === localNodeId
													? "text-[#fbbf24] bg-zinc-900/80"
													: "text-zinc-400"
											}`}
										>
											{nodeId}
											{nodeId === localNodeId && (
												<span className="text-[9px] text-[#fbbf24]/70 block tracking-normal lowercase font-normal mt-0.5">
													(connected)
												</span>
											)}
										</th>
									))}
									<th className="text-center py-3 px-4 text-[#10b981] font-bold tracking-wider sticky top-0 z-20 bg-zinc-900 border-b-2 border-zinc-800">
										global sum
									</th>
								</tr>
							</thead>
							<tbody>
								{stateEntries.map(([key, nodeCounts]) => {
									const globalCount = Object.values(nodeCounts).reduce(
										(sum, c) => sum + c,
										0
									);
									const isFlashing = flashKeys.has(key);

									return (
										<tr
											key={key}
											className={`border-b border-zinc-800 transition-colors duration-700 ${
												isFlashing ? "bg-[#fbbf24]/10" : "hover:bg-zinc-900/40"
											}`}
										>
											<td className="py-2.5 px-4 text-zinc-300 font-semibold border-r border-zinc-800 sticky left-0 z-10 bg-zinc-950 truncate max-w-[150px]">
												{key}
											</td>
											{sortedNodeIds.map((nodeId) => {
												const count = nodeCounts[nodeId] || 0;
												const isLocal = nodeId === localNodeId;

												return (
													<td
														key={nodeId}
														className={`text-center py-2.5 px-4 border-r border-zinc-800 font-mono text-sm tabular-nums ${
															count > 0
																? isLocal
																	? "text-[#fbbf24] font-bold"
																	: "text-[#6366f1]"
																: "text-zinc-700"
														}`}
													>
														{count}
													</td>
												);
											})}
											<td
												className={`text-center py-2.5 px-4 font-bold text-sm tabular-nums border-r-0 ${
													isFlashing ? "text-[#10b981]" : "text-[#10b981]/90"
												}`}
											>
												{globalCount}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>

					<div className="px-4 py-3 bg-zinc-900 border-t-2 border-zinc-800 flex flex-col sm:flex-row gap-2 sm:items-center justify-between text-xs text-zinc-500 font-mono">
						<span>
							tracking {stateEntries.length} key{stateEntries.length !== 1 ? "s" : ""} across {sortedNodeIds.length} cluster node{sortedNodeIds.length !== 1 ? "s" : ""}
						</span>
						<div className="flex items-center gap-3 flex-wrap">
							<span className="flex items-center gap-1.5">
								<span className="w-2.5 h-2.5 rounded bg-[#fbbf24] border border-black" />
								<span>local node counter</span>
							</span>
							<span className="flex items-center gap-1.5">
								<span className="w-2.5 h-2.5 rounded bg-[#6366f1] border border-black" />
								<span>remote node counter</span>
							</span>
							<span className="flex items-center gap-1.5">
								<span className="w-2.5 h-2.5 rounded bg-[#10b981] border border-black" />
								<span>global consolidated sum</span>
							</span>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
