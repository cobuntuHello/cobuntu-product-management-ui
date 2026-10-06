import * as React from "react";
import { ModalShell } from "../page/helpers";
import { useProductManagementConfig, useJsonHeaders } from "../config";
import { RefundPolicyField, type RefundPolicyValue } from "./RefundPolicyField";

/**
 * Seller-facing editor for a product's refund policy, on the manage page. Shares
 * the SAME control as the create wizard's "Policies & access" step
 * (RefundPolicyField) — one setting, one widget, two places. Simplified to the
 * two presets sellers actually asked for (standard vs none); the full mode/window
 * matrix the backend still supports is no longer surfaced. Saves via
 * PATCH /api/users/me/products/:id { refundPolicy }, where the backend validates
 * + server-stamps updatedAt / updatedByUserId.
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

    const [value, setValue] = React.useState<RefundPolicyValue>(product?.refundPolicy ?? null);
    const [saving, setSaving] = React.useState(false);

    async function save() {
        setSaving(true);
        try {
            const res = await fetch(`${apiBaseUrl}/api/users/me/products/${productId}`, {
                method: "PATCH",
                headers: jsonHeaders(),
                body: JSON.stringify({ refundPolicy: value }),
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
                Choose whether buyers can refund this themselves. Refunds are always processed by Stripe;
                money already paid out to your community is handled from your Stripe dashboard.
            </p>

            <div className="mb-4">
                <RefundPolicyField value={value} onChange={setValue} />
            </div>

            <div className="flex justify-end gap-2">
                <button onClick={onClose} className="px-4 py-2 text-[13px] text-zinc-500 rounded-lg hover:bg-zinc-100 cursor-pointer">
                    Cancel
                </button>
                <button
                    onClick={save}
                    disabled={saving}
                    className="px-4 py-2 text-[13px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-30 cursor-pointer"
                >
                    {saving ? "Saving..." : "Save"}
                </button>
            </div>
        </ModalShell>
    );
}
