"use client";

import React, { useEffect, useRef } from "react";
import * as d3 from "d3";
import { NodeInfo, GossipSignal } from "../hooks/useWebSocket";

interface TopologyGraphProps {
	cluster: NodeInfo | null;
	activeNodeId: string;
	lastGossipSignal: GossipSignal | null;
}

interface GraphNode extends d3.SimulationNodeDatum {
	id: string;
	status: string;
	isLocal: boolean;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
	source: string | GraphNode;
	target: string | GraphNode;
}

export function TopologyGraph({ cluster, activeNodeId, lastGossipSignal }: TopologyGraphProps) {
	const svgRef = useRef<SVGSVGElement | null>(null);
	const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);

	useEffect(() => {
		if (!svgRef.current || !cluster) return;

		const width = 600;
		const height = 400;

		const svg = d3.select(svgRef.current)
			.attr("viewBox", `0 0 ${width} ${height}`)
			.attr("width", "100%")
			.attr("height", "100%");

		svg.selectAll("*").remove();

		svg.append("defs").append("marker")
			.attr("id", "arrow")
			.attr("viewBox", "0 -5 10 10")
			.attr("refX", 25) 
			.attr("refY", 0)
			.attr("markerWidth", 6)
			.attr("markerHeight", 6)
			.attr("orient", "auto")
			.append("path")
			.attr("d", "M0,-5L10,0L0,5")
			.attr("fill", "#4b5563");

		const nodesList: GraphNode[] = [];
		const linksList: GraphLink[] = [];

		nodesList.push({
			id: cluster.id,
			status: "healthy", 
			isLocal: true,
		});

		const knownNodeIDs = new Set<string>([cluster.id]);

		cluster.peers.forEach((peerAddr, index) => {
			let peerID = "";
			for (const [id, info] of Object.entries(cluster.health)) {
				if (info.addr === peerAddr) {
					peerID = id;
					break;
				}
			}
			
			if (!peerID) {
				peerID = `config-peer-${index}`;
			}

			if (!knownNodeIDs.has(peerID)) {
				knownNodeIDs.add(peerID);
				nodesList.push({
					id: peerID,
					status: cluster.health[peerID]?.status || "unknown",
					isLocal: false,
				});
			}

			linksList.push({
				source: cluster.id,
				target: peerID,
			});
		});

		Object.entries(cluster.health).forEach(([peerID, healthInfo]) => {
			if (!knownNodeIDs.has(peerID)) {
				knownNodeIDs.add(peerID);
				nodesList.push({
					id: peerID,
					status: healthInfo.status,
					isLocal: false,
				});
			}

			const linkExists = linksList.some(
				(l) => {
					const sourceId = typeof l.source === "string" ? l.source : l.source.id;
					const targetId = typeof l.target === "string" ? l.target : l.target.id;
					return (sourceId === peerID && targetId === cluster.id) || 
					       (sourceId === cluster.id && targetId === peerID);
				}
			);
			if (!linkExists) {
				linksList.push({
					source: peerID,
					target: cluster.id,
				});
			}
		});

		const simulation = d3.forceSimulation<GraphNode, GraphLink>(nodesList)
			.force("link", d3.forceLink<GraphNode, GraphLink>(linksList).id((d) => d.id).distance(160))
			.force("charge", d3.forceManyBody().strength(-400))
			.force("center", d3.forceCenter(width / 2, height / 2))
			.force("collision", d3.forceCollide().radius(40));

		simulationRef.current = simulation;

		const links = svg.append("g")
			.attr("class", "links")
			.selectAll("line")
			.data(linksList)
			.enter()
			.append("line")
			.attr("stroke", "#374151")
			.attr("stroke-width", 2)
			.attr("stroke-dasharray", (d) => {
				const sourceId = typeof d.source === "string" ? d.source : d.source.id;
				return sourceId === cluster.id ? "none" : "4,4";
			}) 
			.attr("marker-end", "url(#arrow)");

		const nodes = svg.append("g")
			.attr("class", "nodes")
			.selectAll("g")
			.data(nodesList)
			.enter()
			.append("g")
			.call(d3.drag<SVGGElement, GraphNode>()
				.on("start", dragstarted)
				.on("drag", dragged)
				.on("end", dragended)
			);

		nodes.append("circle")
			.attr("r", (d) => d.isLocal ? 26 : 22)
			.attr("fill", (d) => {
				if (d.status === "healthy") return "#10b981"; 
				if (d.status === "suspect") return "#f59e0b"; 
				if (d.status === "dead") return "#ef4444";   
				return "#6b7280"; 
			})
			.attr("stroke", (d) => d.isLocal ? "#ffffff" : "#1f2937")
			.attr("stroke-width", (d) => d.isLocal ? 3 : 1.5)
			.style("cursor", "grab")
			.style("filter", "drop-shadow(0px 4px 6px rgba(0,0,0,0.4))");

		nodes.filter((d) => d.isLocal)
			.append("circle")
			.attr("r", 26)
			.attr("fill", "none")
			.attr("stroke", "#10b981")
			.attr("stroke-width", 1.5)
			.attr("opacity", 0.8)
			.transition()
			.duration(2000)
			.ease(d3.easeLinear)
			.on("start", function repeat(this: SVGElement) {
				d3.select(this)
					.attr("r", 26)
					.attr("opacity", 0.8)
					.transition()
					.duration(1500)
					.attr("r", 40)
					.attr("opacity", 0)
					.on("end", repeat);
			});

		nodes.append("text")
			.attr("dy", ".35em")
			.attr("y", (d) => d.isLocal ? 40 : 34)
			.attr("text-anchor", "middle")
			.attr("fill", "#f3f4f6")
			.attr("font-size", "12px")
			.attr("font-weight", "bold")
			.text((d) => d.id);

		nodes.append("text")
			.attr("dy", ".35em")
			.attr("y", (d) => d.isLocal ? 52 : 46)
			.attr("text-anchor", "middle")
			.attr("fill", "#9ca3af")
			.attr("font-size", "9px")
			.text((d) => d.isLocal ? "local node" : d.status);

		simulation.on("tick", () => {
			links
				.attr("x1", (d) => {
					const source = d.source as GraphNode;
					return source.x ?? 0;
				})
				.attr("y1", (d) => {
					const source = d.source as GraphNode;
					return source.y ?? 0;
				})
				.attr("x2", (d) => {
					const target = d.target as GraphNode;
					return target.x ?? 0;
				})
				.attr("y2", (d) => {
					const target = d.target as GraphNode;
					return target.y ?? 0;
				});

			nodes.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
		});

		function dragstarted(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>, d: GraphNode) {
			if (!event.active) simulation.alphaTarget(0.3).restart();
			d.fx = d.x;
			d.fy = d.y;
		}

		function dragged(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>, d: GraphNode) {
			d.fx = event.x;
			d.fy = event.y;
		}

		function dragended(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>, d: GraphNode) {
			if (!event.active) simulation.alphaTarget(0);
			d.fx = null;
			d.fy = null;
		}

		return () => {
			simulation.stop();
		};
	}, [cluster]);

	useEffect(() => {
		if (!svgRef.current || !lastGossipSignal || !simulationRef.current || !cluster) return;

		const svg = d3.select(svgRef.current);
		const nodes = simulationRef.current.nodes();

		const sender = nodes.find((n) => n.id === lastGossipSignal.sender);
		const target = nodes.find((n) => n.id === activeNodeId);

		if (sender && target && sender.x && sender.y && target.x && target.y) {
			const particle = svg.append("circle")
				.attr("cx", sender.x)
				.attr("cy", sender.y)
				.attr("r", 5)
				.attr("fill", "#3b82f6") 
				.style("filter", "drop-shadow(0px 0px 4px #60a5fa)");

			particle.transition()
				.duration(1000)
				.ease(d3.easeQuadOut)
				.attr("cx", target.x)
				.attr("cy", target.y)
				.on("end", () => {
					particle.remove();
					
					svg.selectAll(".nodes circle")
						.filter((d) => {
							const item = d as GraphNode;
							return item.id === activeNodeId;
						})
						.transition()
						.duration(100)
						.attr("stroke", "#60a5fa")
						.attr("stroke-width", 5)
						.transition()
						.duration(300)
						.attr("stroke", "#ffffff")
						.attr("stroke-width", 3);
				});
		}
	}, [lastGossipSignal]);

	return (
		<div className="relative w-full h-full min-h-[400px] bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl p-4 flex flex-col justify-between">
			<div className="flex justify-between items-center z-10">
				<div>
					<h3 className="text-lg font-bold text-white flex items-center gap-2">
						<span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
						cluster topology graph
					</h3>
					<p className="text-xs text-gray-400 mt-0.5">real-time gossip exchange & node failure visualization</p>
				</div>
				<div className="flex gap-4 text-[10px] text-gray-400 bg-gray-950 px-3 py-1.5 rounded-lg border border-gray-800">
					<div className="flex items-center gap-1.5">
						<span className="w-2 h-2 rounded-full bg-emerald-500"></span> healthy
					</div>
					<div className="flex items-center gap-1.5">
						<span className="w-2 h-2 rounded-full bg-amber-500"></span> suspect
					</div>
					<div className="flex items-center gap-1.5">
						<span className="w-2 h-2 rounded-full bg-red-500"></span> dead
					</div>
				</div>
			</div>
			
			<svg ref={svgRef} className="w-full h-full flex-grow"></svg>
			
			<div className="text-[10px] text-gray-400 text-center select-none bg-gray-950/50 py-1 border-t border-gray-800/40 rounded-b-xl z-10">
				Tip: Drag nodes to rearrange the visual layout
			</div>
		</div>
	);
}
