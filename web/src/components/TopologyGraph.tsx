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

		const defs = svg.append("defs");

		defs.append("pattern")
			.attr("id", "dot-grid")
			.attr("x", 0)
			.attr("y", 0)
			.attr("width", 20)
			.attr("height", 20)
			.attr("patternUnits", "userSpaceOnUse")
			.append("circle")
			.attr("cx", 2)
			.attr("cy", 2)
			.attr("r", 1)
			.attr("fill", "#27272a");

		svg.append("rect")
			.attr("width", width)
			.attr("height", height)
			.attr("fill", "url(#dot-grid)");

		defs.append("marker")
			.attr("id", "arrow")
			.attr("viewBox", "0 -5 10 10")
			.attr("refX", 28) 
			.attr("refY", 0)
			.attr("markerWidth", 6)
			.attr("markerHeight", 6)
			.attr("orient", "auto")
			.append("path")
			.attr("d", "M0,-5L10,0L0,5")
			.attr("fill", "#3f3f46");

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
			.force("link", d3.forceLink<GraphNode, GraphLink>(linksList).id((d) => d.id).distance(150))
			.force("charge", d3.forceManyBody().strength(-500))
			.force("center", d3.forceCenter(width / 2, height / 2))
			.force("collision", d3.forceCollide().radius(45));

		simulationRef.current = simulation;

		const links = svg.append("g")
			.attr("class", "links")
			.selectAll("line")
			.data(linksList)
			.enter()
			.append("line")
			.attr("stroke", "#3f3f46")
			.attr("stroke-width", 2)
			.attr("stroke-dasharray", (d) => {
				const sourceId = typeof d.source === "string" ? d.source : d.source.id;
				return sourceId === cluster.id ? "none" : "5,5";
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

		const getNodeColor = (d: GraphNode) => {
			if (d.status === "healthy") return "#10b981"; 
			if (d.status === "suspect") return "#fbbf24"; 
			if (d.status === "dead") return "#ef4444";   
			return "#52525b"; 
		};

		nodes.append("circle")
			.attr("r", (d) => d.isLocal ? 28 : 22)
			.attr("fill", getNodeColor)
			.attr("stroke", (d) => d.isLocal ? "#fbbf24" : "#000000")
			.attr("stroke-width", 3)
			.style("cursor", "grab");

		nodes.filter((d) => d.isLocal)
			.append("circle")
			.attr("r", 34)
			.attr("fill", "none")
			.attr("stroke", "#fbbf24")
			.attr("stroke-width", 2)
			.attr("stroke-dasharray", "4,2")
			.attr("opacity", 0.8)
			.transition()
			.duration(2000)
			.ease(d3.easeLinear)
			.on("start", function repeat(this: SVGElement) {
				d3.select(this)
					.attr("r", 32)
					.attr("opacity", 0.8)
					.transition()
					.duration(1500)
					.attr("r", 45)
					.attr("opacity", 0)
					.on("end", repeat);
			});

		nodes.append("text")
			.attr("dy", ".35em")
			.attr("y", (d) => d.isLocal ? 44 : 36)
			.attr("text-anchor", "middle")
			.attr("fill", "#ffffff")
			.attr("font-size", "12px")
			.attr("font-weight", "bold")
			.attr("font-family", "var(--font-space-grotesk), sans-serif")
			.text((d) => d.id);

		nodes.append("text")
			.attr("dy", ".35em")
			.attr("y", (d) => d.isLocal ? 56 : 48)
			.attr("text-anchor", "middle")
			.attr("fill", "#71717a")
			.attr("font-size", "9px")
			.attr("font-weight", "bold")
			.attr("font-family", "var(--font-ibm-plex-mono), monospace")
			.text((d) => d.isLocal ? "local" : d.status.toUpperCase());

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
				.attr("fill", "#fbbf24") 
				.attr("stroke", "#000000")
				.attr("stroke-width", 1.5);

			particle.transition()
				.duration(800)
				.ease(d3.easeCubicOut)
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
						.attr("stroke", "#fbbf24")
						.attr("stroke-width", 5)
						.transition()
						.duration(300)
						.attr("stroke", "#fbbf24")
						.attr("stroke-width", 3);
				});
		}
	}, [lastGossipSignal]);

	return (
		<div className="relative w-full h-full min-h-[400px] neo-card bg-[#141414] p-5 flex flex-col justify-between">
			<div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 z-10 border-b border-zinc-800 pb-4">
				<div>
					<h3 className="text-base font-bold text-white flex items-center gap-2 tracking-wide">
						cluster topology visualizer
					</h3>
					<p className="text-xs text-zinc-500 font-mono mt-1">
						real-time gossip exchange particles & failure status
					</p>
				</div>
				<div className="flex gap-2 text-[10px] text-zinc-400 bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-800 font-mono">
					<div className="flex items-center gap-1.5">
						<span className="w-2 h-2 rounded-full bg-[#10b981] border border-black" /> healthy
					</div>
					<div className="flex items-center gap-1.5">
						<span className="w-2 h-2 rounded-full bg-[#fbbf24] border border-black" /> suspect
					</div>
					<div className="flex items-center gap-1.5">
						<span className="w-2 h-2 rounded-full bg-[#ef4444] border border-black" /> dead
					</div>
				</div>
			</div>
			
			<div className="flex-grow relative h-[300px]">
				<svg ref={svgRef} className="w-full h-full" />
			</div>
			
			<div className="text-[10px] text-zinc-500 text-center select-none py-2 border-t border-zinc-800 font-mono z-10">
				DRAG NODES TO ADJUST FORCE-DIRECTED LAYOUT POSITION
			</div>
		</div>
	);
}
