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

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
			<div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-2xl flex flex-col justify-between min-h-[300px]">
				<div>
					<h3 className="text-md font-bold text-white flex items-center gap-1.5">
						<span className="w-2 h-2 rounded-full bg-blue-500"></span>
						cluster throughput
					</h3>
					<p className="text-xs text-gray-400 mt-0.5">allowed vs. denied requests (cumulative per-interval)</p>
				</div>
				
				<div className="h-[200px] w-full mt-4 select-none">
					<ResponsiveContainer width="100%" height="100%">
						<AreaChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
							<defs>
								<linearGradient id="colorAllowed" x1="0" y1="0" x2="0" y2="1">
									<stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
									<stop offset="95%" stopColor="#10b981" stopOpacity={0} />
								</linearGradient>
								<linearGradient id="colorDenied" x1="0" y1="0" x2="0" y2="1">
									<stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
									<stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
								</linearGradient>
							</defs>
							<CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
							<XAxis dataKey="time" stroke="#4b5563" fontSize={10} tickLine={false} />
							<YAxis stroke="#4b5563" fontSize={10} tickLine={false} />
							<Tooltip
								contentStyle={{ backgroundColor: "#111827", borderColor: "#374151", borderRadius: "8px" }}
								labelStyle={{ color: "#9ca3af", fontSize: "11px" }}
								itemStyle={{ fontSize: "12px" }}
							/>
							<Area
								type="monotone"
								dataKey="allowed"
								stroke="#10b981"
								strokeWidth={2}
								fillOpacity={1}
								fill="url(#colorAllowed)"
								name="Allowed"
							/>
							<Area
								type="monotone"
								dataKey="denied"
								stroke="#ef4444"
								strokeWidth={2}
								fillOpacity={1}
								fill="url(#colorDenied)"
								name="Denied"
							/>
						</AreaChart>
					</ResponsiveContainer>
				</div>
			</div>

			<div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 shadow-2xl flex flex-col justify-between min-h-[300px]">
				<div>
					<h3 className="text-md font-bold text-white flex items-center gap-1.5">
						<span className="w-2 h-2 rounded-full bg-violet-500"></span>
						limiting latency (ms)
					</h3>
					<p className="text-xs text-gray-400 mt-0.5">avg time spent per decision</p>
				</div>
				
				<div className="h-[200px] w-full mt-4 select-none">
					<ResponsiveContainer width="100%" height="100%">
						<LineChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
							<CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
							<XAxis dataKey="time" stroke="#4b5563" fontSize={10} tickLine={false} />
							<YAxis stroke="#4b5563" fontSize={10} tickLine={false} unit="ms" />
							<Tooltip
								contentStyle={{ backgroundColor: "#111827", borderColor: "#374151", borderRadius: "8px" }}
								labelStyle={{ color: "#9ca3af", fontSize: "11px" }}
								itemStyle={{ fontSize: "12px", color: "#8b5cf6" }}
							/>
							<Line
								type="monotone"
								dataKey="latency"
								stroke="#8b5cf6"
								strokeWidth={2.5}
								dot={{ stroke: "#a78bfa", strokeWidth: 1.5, r: 3 }}
								activeDot={{ r: 5 }}
								name="Latency"
							/>
						</LineChart>
					</ResponsiveContainer>
				</div>
			</div>
		</div>
	);
}
