import * as React from "react";
import { ModalShell } from "../page/helpers";
import { useProductManagementConfig, useJsonHeaders } from "../config";

/**
 * Seller-facing editor for a product's refund policy (backend gap #2). Mirrors
 * the event refund-policy editor: a mode choice plus the buyer self-service
 * window. Saves via PATCH /api/users/me/products/:id { refundPolicy }, where the
 * backend validates + server-stamps updatedAt / updatedByUserId.
 *
 * For a product, customBuyerWindowDays counts UP from purchase (there is no
 * event date). Blank = the whole escrow window (today's behaviour); 0 disables
 * buyer self-refunds; the seller can always refund within the mode + payout gate.
 */
export function ProductRefundPolicyEditModal({
    product,
    productId,
    onClose,
    onSaved,
    showToast,
}: {
    product: any;
    productId: string;
    onClose: () => void;
    onSaved: () => void;
    showToast: (msg: string) => void;
}) {
    const { apiBaseUrl } = useProductManagementConfig();
    const jsonHeaders = useJsonHeaders();

    const existing = product?.refundPolicy ?? null;
    const [mode, setMode] = React.useState<"default" | "extended">(
        existing?.mode === "extended" ? "extended" : "default",
    );
    // Kept as a string so the field can be genuinely empty (= whole window),
    // distinct from 0 (= self-refunds disabled).
    const [windowDays, setWindowDays] = React.useState<string>(
        typeof existing?.customBuyerWindowDays === "number" ? String(existing.customBuyerWindowDays) : "",
    );
    const [saving, setSaving] = React.useState(false);

    const windowError = (() => {
        if (windowDays.trim() === "") return null;
        const n = Number(windowDays);
        if (!Number.isInteger(n) || n < 0 || n > 90) return "Enter a whole number of days between 0 and 90, or leave blank.";
        return null;
    })();

    async function save() {
        if (windowError) return;
        setSaving(true);
        try {
            const refundPolicy: Record<string, unknown> = { mode };
            if (windowDays.trim() !== "") refundPolicy.customBuyerWindowDays = Number(windowDays);
            const res = await fetch(`${apiBaseUrl}/api/users/me/products/${productId}`, {
                method: "PATCH",
                headers: jsonHeaders(),
                body: JSON.stringify({ refundPolicy }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "Couldn't save the refund policy.");
            }
            showToast("Refund policy saved");
            onSaved();
        } catch (e: any) {
            showToast(e?.message || "Couldn't save the refund policy.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <ModalShell onClose={onClose}>
            <h3 className="text-[15px] font-semibold text-zinc-900 mb-1">Refund policy</h3>
            <p className="text-[12px] text-zinc-500 mb-4">
                Control how buyers and you can refund this product. Refunds are always processed by Stripe;
                money already paid out to your community is handled from your Stripe dashboard.
            </p>

            <div className="flex flex-col gap-2 mb-4">
                <ModeRow
                    selected={mode === "default"}
                    onClick={() => setMode("default")}
                    title="Standard"
                    subtitle="You can refund a purchase while it's still in escrow. Past that, contact Cobuntu support."
                />
                <ModeRow
                    selected={mode === "extended"}
                    onClick={() => setMode("extended")}
                    title="Extended"
                    subtitle="You can also refund after escrow, until the next payout to your community. Paid-out sales are refunded from your Stripe dashboard."
                />
            </div>

            <label className="block mb-4">
                <span className="text-[13px] font-medium text-zinc-800">Buyer self-refund window</span>
                <span className="block text-[12px] text-zinc-500 mb-1.5">
                    Days after purchase that buyers can self-refund. Leave blank for the full window; 0 disables buyer self-refunds.
                </span>
                <input
                    type="text"
                    inputMode="numeric"
                    value={windowDays}
                    onChange={(e) => setWindowDays(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="Full window"
                    className="w-32 rounded-lg border border-zinc-200 px-3 py-2 text-[13px] text-zinc-900 outline-none focus:border-zinc-400"
                />
                {windowError && <span className="block text-[12px] text-red-500 mt-1">{windowError}</span>}
            </label>

            <div className="flex justify-end gap-2">
                <button onClick={onClose} className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer">
                    Cancel
                </button>
                <button
                    onClick={save}
                    disabled={saving || !!windowError}
                    className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
                >
                    {saving ? "Saving..." : "Save"}
                </button>
            </div>
        </ModalShell>
    );
}

function ModeRow({
    selected,
    onClick,
    title,
    subtitle,
}: {
    selected: boolean;
    onClick: () => void;
    title: string;
    subtitle: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`w-full text-left flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                selected ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 bg-white hover:bg-zinc-50/50"
            }`}
        >
            <span
                className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                    selected ? "border-zinc-900" : "border-zinc-300"
                }`}
            >
                {selected && <span className="h-1.5 w-1.5 rounded-full bg-zinc-900" />}
            </span>
            <span className="min-w-0">
                <span className="block text-[13px] font-medium text-zinc-900">{title}</span>
                <span className="block text-[12px] text-zinc-500">{subtitle}</span>
            </span>
        </button>
    );
}
