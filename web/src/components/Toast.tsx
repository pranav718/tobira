"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle, XCircle, Info, X } from "lucide-react";

export type ToastVariant = "success" | "error" | "info";

export interface ToastData {
	id: string;
	message: string;
	variant: ToastVariant;
}

interface ToastProps {
	toast: ToastData;
	onDismiss: (id: string) => void;
}

function Toast({ toast, onDismiss }: ToastProps) {
	const [exiting, setExiting] = useState(false);

	useEffect(() => {
		const timer = setTimeout(() => {
			setExiting(true);
			setTimeout(() => onDismiss(toast.id), 200);
		}, 4000);
		return () => clearTimeout(timer);
	}, [toast.id, onDismiss]);

	const variantStyles = {
		success: {
			border: "border-[#10b981]",
			shadowColor: "#10b981",
			icon: <CheckCircle className="w-4 h-4 text-[#10b981] shrink-0" />,
			text: "text-zinc-200",
		},
		error: {
			border: "border-[#ef4444]",
			shadowColor: "#ef4444",
			icon: <XCircle className="w-4 h-4 text-[#ef4444] shrink-0" />,
			text: "text-zinc-200",
		},
		info: {
			border: "border-[#6366f1]",
			shadowColor: "#6366f1",
			icon: <Info className="w-4 h-4 text-[#6366f1] shrink-0" />,
			text: "text-zinc-200",
		},
	};

	const styles = variantStyles[toast.variant];

	return (
		<div
			className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 bg-[#1a1a1a] ${styles.border} ${
				exiting ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
			} transition-all duration-200`}
			style={{
				boxShadow: `4px 4px 0px 0px ${styles.shadowColor}`,
			}}
		>
			{styles.icon}
			<span className={`text-sm font-semibold flex-1 ${styles.text}`}>
				{toast.message}
			</span>
			<button
				onClick={() => {
					setExiting(true);
					setTimeout(() => onDismiss(toast.id), 200);
				}}
				className="text-zinc-500 hover:text-white transition p-1"
			>
				<X className="w-4 h-4" />
			</button>
		</div>
	);
}

interface ToastContainerProps {
	toasts: ToastData[];
	onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
	if (toasts.length === 0) return null;

	return (
		<div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none">
			{toasts.map((toast) => (
				<div key={toast.id} className="pointer-events-auto animate-slide-up">
					<Toast toast={toast} onDismiss={onDismiss} />
				</div>
			))}
		</div>
	);
}
