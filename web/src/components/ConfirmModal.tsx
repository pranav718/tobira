"use client";

import React, { useEffect, useRef } from "react";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmModalProps {
	open: boolean;
	title: string;
	description: string;
	confirmLabel?: string;
	cancelLabel?: string;
	variant?: "danger" | "warning" | "default";
	onConfirm: () => void;
	onCancel: () => void;
}

export function ConfirmModal({
	open,
	title,
	description,
	confirmLabel = "confirm",
	cancelLabel = "cancel",
	variant = "default",
	onConfirm,
	onCancel,
}: ConfirmModalProps) {
	const modalRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") onCancel();
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [open, onCancel]);

	if (!open) return null;

	const variantStyles = {
		danger: {
			icon: "bg-red-500/10 border-red-500/30 text-red-400",
			button: "neo-btn-danger",
		},
		warning: {
			icon: "bg-amber-500/10 border-amber-500/30 text-amber-400",
			button: "neo-btn-accent",
		},
		default: {
			icon: "bg-indigo-500/10 border-indigo-500/30 text-indigo-400",
			button: "neo-btn-accent",
		},
	};

	const styles = variantStyles[variant];

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in"
			onClick={(e) => {
				if (e.target === e.currentTarget) onCancel();
			}}
		>
			<div className="absolute inset-0 bg-black/80" />

			<div
				ref={modalRef}
				className="relative bg-[#141414] border-2 border-zinc-800 rounded-xl p-6 max-w-md w-full mx-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] animate-scale-in"
			>
				<button
					onClick={onCancel}
					className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition"
				>
					<X className="w-4 h-4" />
				</button>

				<div className="flex items-start gap-4">
					<div className={`p-2.5 rounded-xl border-2 ${styles.icon}`}>
						<AlertTriangle className="w-5 h-5" />
					</div>
					<div className="flex-1 min-w-0">
						<h3 className="text-base font-bold text-white uppercase tracking-wider">{title}</h3>
						<p className="text-sm text-zinc-400 mt-2 leading-relaxed">
							{description}
						</p>
					</div>
				</div>

				<div className="flex items-center justify-end gap-3 mt-6 border-t border-zinc-800 pt-4">
					<button
						onClick={onCancel}
						className="neo-btn px-4 py-2 text-sm font-medium"
					>
						{cancelLabel}
					</button>
					<button
						onClick={onConfirm}
						className={`${styles.button} px-4 py-2 text-sm font-medium`}
					>
						{confirmLabel}
					</button>
				</div>
			</div>
		</div>
	);
}
