"use client";

import * as React from "react";
import { ModalShell } from "../page/helpers";
import { useProductManagementConfig, useJsonHeaders } from "../config";

/**
 * The two visibility axes on a product, in one component.
 *
 *   viewability   → who can SEE the product page
 *   accessibility → who can BUY it
 *
 * Events ship these as two near-identical files. One component with an `axis`
 * prop renders the same UI for both and cannot drift between them, which is
 * the failure mode two files have.
 *
 * BOTH ARE COMMUNITY-SCOPED. A personal product has no membership to gate
 * against, so the backend refuses either on a user-owned product for anyone —
 * see communityScopedSettings on the server. This modal is reached only from
 * the settings drawer, which does not render for a user-owned product; the
 * gate is the server's, this is the affordance.
 */

export type VisibilityAxis = "viewability" | "accessibility";

const COPY: Record<VisibilityAxis, {
  title: string;
  blurb: string;
  publicTitle: string;
  publicBody: string;
  membersTitle: string;
  membersBody: string;
  savedToast: string;
  failedToast: string;
}> = {
  viewability: {
    title: "Who can see this",
    blurb: "Who can open this product's page.",
    publicTitle: "Anyone",
    publicBody: "The product page is public. Anyone with the link can read it.",
    membersTitle: "Members only",
    membersBody: "Non-members get a 404 — the page is hidden entirely.",
    savedToast: "Visibility updated",
    failedToast: "Could not update visibility",
  },
  accessibility: {
    title: "Who can buy this",
    blurb: "Who can complete a purchase. Separate from who can see it.",
    publicTitle: "Anyone",
    publicBody: "Anyone who can see the product can buy it.",
    membersTitle: "Members only",
    membersBody: "Non-members can read the page but cannot check out.",
    savedToast: "Access updated",
    failedToast: "Could not update access",
  },
};

export function ProductVisibilityEditModal({
  product,
  productId,
  axis,
  onClose,
  onSaved,
  showToast,
}: {
  product: any;
  productId: string;
  axis: VisibilityAxis;
  onClose: () => void;
  onSaved: () => void;
  showToast: (msg: string) => void;
}) {
  const { apiBaseUrl } = useProductManagementConfig();
  const jsonHeaders = useJsonHeaders();
  const copy = COPY[axis];

  const [value, setValue] = React.useState<"PUBLIC" | "MEMBERS_ONLY">(
    product?.[axis] === "MEMBERS_ONLY" ? "MEMBERS_ONLY" : "PUBLIC",
  );
  const [saving, setSaving] = React.useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/users/me/products/${productId}`, {
        method: "PATCH",
        headers: jsonHeaders(),
        body: JSON.stringify({ [axis]: value }),
      });
      if (!res.ok) {
        // The server refuses this on a user-owned product and for non-leaders.
        // Surface ITS message: "Only community-owned products can set who can
        // see this" explains the refusal; a generic failure does not.
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || copy.failedToast);
      }
      showToast(copy.savedToast);
      onSaved();
    } catch (e: any) {
      showToast(e?.message || copy.failedToast);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <h3 className="text-[15px] font-semibold text-zinc-900 mb-1">{copy.title}</h3>
      <p className="text-[12px] text-zinc-500 mb-4">{copy.blurb}</p>

      <div className="space-y-2 mb-4">
        <RadioRow
          selected={value === "PUBLIC"}
          onClick={() => setValue("PUBLIC")}
          title={copy.publicTitle}
          subtitle={copy.publicBody}
        />
        <RadioRow
          selected={value === "MEMBERS_ONLY"}
          onClick={() => setValue("MEMBERS_ONLY")}
          title={copy.membersTitle}
          subtitle={copy.membersBody}
        />
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

function RadioRow({
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
        <span className="block text-[12px] text-zinc-500 mt-0.5">{subtitle}</span>
      </span>
    </button>
  );
}
