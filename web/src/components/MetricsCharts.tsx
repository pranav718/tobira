"use client";

import React, { useEffect, useState } from "react";
import {
	ResponsiveContainer,
	AreaChart,
	Area,
	XAxis,
	YAxis,
	Tooltip,
	CartesianGrid,
	LineChart,
	Line,
} from "recharts";
import { MetricsSnapshot } from "../hooks/useWebSocket";

interface MetricsChartsProps {
	metrics: MetricsSnapshot;
}

interface ChartDataPoint {
	time: string;
	allowed: number;
	denied: number;
	latency: number;
}

export function MetricsCharts({ metrics }: MetricsChartsProps) {
	const [history, setHistory] = useState<ChartDataPoint[]>([]);

	useEffect(() => {
		const now = new Date().toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		});

		setHistory((prev) => {
			const next = [
				...prev,
				{
					time: now,
					allowed: metrics.allowed_total,
					denied: metrics.denied_total,
					latency: parseFloat(metrics.average_latency_ms.toFixed(2)),
				},
			];
			if (next.length > 15) {
				return next.slice(1); 
			}
			return next;
		});
	}, [metrics]);

	const tooltipStyle = {
		backgroundColor: "#141414",
		border: "2px solid #27272a",
		borderRadius: "12px",
		boxShadow: "4px 4px 0px 0px #000000",
		padding: "8px 12px",
		fontFamily: "var(--font-ibm-plex-mono), monospace",
	};

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
			<div className="neo-card p-5 bg-[#141414] flex flex-col justify-between min-h-[300px]">
				<div>
					<h3 className="text-base font-bold text-white flex items-center gap-2 tracking-wide">
						cluster requests throughput
					</h3>
					<p className="text-xs text-zinc-500 font-mono mt-1">
						live rate of http 200 (allowed) vs http 429 (blocked)
					</p>
				</div>
				
				<div className="h-[200px] w-full mt-6 select-none font-mono">
					<ResponsiveContainer width="100%" height="100%">
						<AreaChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
							<defs>
								<linearGradient id="colorAllowed" x1="0" y1="0" x2="0" y2="1">
									<stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
									<stop offset="95%" stopColor="#10b981" stopOpacity={0} />
								</linearGradient>
								<linearGradient id="colorDenied" x1="0" y1="0" x2="0" y2="1">
									<stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
									<stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
								</linearGradient>
							</defs>
							<CartesianGrid strokeDasharray="4 4" stroke="#27272a" vertical={false} />
							<XAxis dataKey="time" stroke="#71717a" fontSize={10} tickLine={false} />
							<YAxis stroke="#71717a" fontSize={10} tickLine={false} />
							<Tooltip
								contentStyle={tooltipStyle}
								labelStyle={{ color: "#71717a", fontSize: "11px", fontWeight: "bold" }}
								itemStyle={{ fontSize: "12px", padding: "2px 0" }}
							/>
							<Area
								type="monotone"
								dataKey="allowed"
								stroke="#10b981"
								strokeWidth={2.5}
								fillOpacity={1}
								fill="url(#colorAllowed)"
								name="allowed"
							/>
							<Area
								type="monotone"
								dataKey="denied"
								stroke="#ef4444"
								strokeWidth={2.5}
								fillOpacity={1}
								fill="url(#colorDenied)"
								name="denied"
							/>
						</AreaChart>
					</ResponsiveContainer>
				</div>
			</div>

			<div className="neo-card p-5 bg-[#141414] flex flex-col justify-between min-h-[300px]">
				<div>
					<h3 className="text-base font-bold text-white flex items-center gap-2 tracking-wide">
						evaluation latency
					</h3>
					<p className="text-xs text-zinc-500 font-mono mt-1">
						average time spent per rate limiting decision (ms)
					</p>
				</div>
				
				<div className="h-[200px] w-full mt-6 select-none font-mono">
					<ResponsiveContainer width="100%" height="100%">
						<LineChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
							<CartesianGrid strokeDasharray="4 4" stroke="#27272a" vertical={false} />
							<XAxis dataKey="time" stroke="#71717a" fontSize={10} tickLine={false} />
							<YAxis stroke="#71717a" fontSize={10} tickLine={false} unit="ms" />
							<Tooltip
								contentStyle={tooltipStyle}
								labelStyle={{ color: "#71717a", fontSize: "11px", fontWeight: "bold" }}
								itemStyle={{ fontSize: "12px", color: "#fbbf24", padding: "2px 0" }}
							/>
							<Line
								type="monotone"
								dataKey="latency"
								stroke="#fbbf24"
								strokeWidth={2.5}
								dot={{ stroke: "#fbbf24", strokeWidth: 2, r: 3.5, fill: "#141414" }}
								activeDot={{ r: 6, fill: "#fbbf24", stroke: "#141414", strokeWidth: 2 }}
								name="latency"
							/>
						</LineChart>
					</ResponsiveContainer>
				</div>
			</div>
		</div>
	);
}
