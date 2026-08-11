"use client";

import { createPortal } from "react-dom";
import { getProductManagementConfig } from "../config";

export const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export function authHeaders(): Record<string, string> {
  return getProductManagementConfig().authHeaders();
}

export function jsonHeaders(): Record<string, string> {
  return { "Content-Type": "application/json", ...authHeaders() };
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: "\u20ac",
  USD: "$",
  GBP: "\u00a3",
  BRL: "R$",
  CHF: "CHF",
  CAD: "$",
  AUD: "$",
  JPY: "\u00a5",
};

export function formatPrice(cents: number, currency = "EUR"): string {
  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  const value = (cents / 100).toFixed(currency === "JPY" ? 0 : 2);
  return `${symbol}${value}`;
}

export const CURRENCIES = [
  { code: "EUR", name: "Euro", symbol: "\u20ac" },
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "GBP", name: "British Pound", symbol: "\u00a3" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$" },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF" },
  { code: "CAD", name: "Canadian Dollar", symbol: "$" },
  { code: "AUD", name: "Australian Dollar", symbol: "$" },
  { code: "JPY", name: "Japanese Yen", symbol: "\u00a5" },
];

// Reusable modal wrapper — portaled to body to escape overflow containers
export function ModalShell({ children, onClose, width = "w-[420px]" }: { children: React.ReactNode; onClose: () => void; width?: string }) {
  return createPortal(
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className={`bg-white rounded-xl shadow-xl ${width} p-6 text-zinc-900`} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body
  );
}

// Pencil icon for hover states
export function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-500"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
  );
}

// Listing status configuration
export const LISTING_STATUS: Record<string, { label: string; color: string; dot: string }> = {
  ACTIVE: { label: "Active", color: "text-emerald-600 bg-emerald-50", dot: "bg-emerald-500" },
  PENDING: { label: "Pending", color: "text-amber-600 bg-amber-50", dot: "bg-amber-500" },
  PAUSED: { label: "Paused", color: "text-zinc-600 bg-zinc-100", dot: "bg-zinc-400" },
  CANCELLED: { label: "Cancelled", color: "text-red-600 bg-red-50", dot: "bg-red-500" },
};
