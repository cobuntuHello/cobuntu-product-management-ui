"use client";

import { useState } from "react";
import {
  ChevronRight, Calendar, ClipboardList, Eye, EyeOff, Info,
  File as FileIcon, Upload, Link as LinkIcon, X, Plus, Lock,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import {
  Eyebrow, StepInput, StepTextarea, Stepper, Switch,
} from "./_primitives";
import { BasicsStep } from "./steps/BasicsStep";
import {
  TIER_NAME_MAX, TIER_DESCRIPTION_MAX, TIER_LICENSE_TERMS_MAX,
  VARIANT_CONDITIONS, VARIANT_PARCELS, VARIANT_ATTR_KEYS,
  type DraftTier, type TierFile,
} from "./types";
import { isTierLocked } from "./helpers";
import type { MemberPricingRow, MemberPricingTierState } from "./member-pricing";

/**
 * VariantEditView — the single-scroll variant editor body
 * (feat/product-variants-editor).
 *
 * Replaces the old per-tier hub (TierEditView) + drill-down step (StepView)
 * levels with ONE scrolling editor per variant, faithful to the finished
 * prototype (product-builder-app.html → variantModal()). The variant LIST
 * level is unchanged and still lives in PriceEditModal; this is what opens
 * when a variant is tapped.
 *
 * Section order matches the prototype exactly:
 *   1. Variant name (+ N/80 counter)
 *   2. Description (+ N/200 counter, "Markdown · optional")
 *   3. Shape-specific core — physical (condition / parcel / stock) or
 *      digital (files / links / licence / downloads-per-file)
 *   4. Other attributes (controlled-vocabulary key/value rows)
 *   5+6. Pricing + Billing mode — reuses the existing, tested BasicsStep
 *        (pricing model, price+currency, PWYW min, billing radios, installment
 *        schedule, member pricing) rather than re-authoring that surface.
 *   7. Advanced — drill-in rows (sales window / registration form) that open
 *      as sub-screens INSIDE the modal (ConfigStep / FormStep rendered by
 *      PriceEditModal's StepView), not inline accordions. Capacity is a
 *      stepper in the shape core, not an Advanced row.
 *   8. Availability — the Published card + info note.
 *
 * Data flow is preserved: Stock→capacity, Licence→licenseTerms,
 * Downloads-per-file→maxDownloads, and the pricing/publish/schedule/form
 * fields are the same DraftTier fields as before. attrs / condition /
 * parcelSize / files / links are LOCAL-ONLY draft state (not yet persisted —
 * buildTierBody does not emit them); see types.ts.
 *
 * The footer (Cancel | Delete | Save) is owned by PriceEditModal.
 */

export interface VariantEditViewProps {
  t: DraftTier;
  onUpdate: (patch: Partial<DraftTier>) => void;
  /** false → physical shape core; true → digital shape core. */
  isDigital: boolean;
  communityTag: string;
  draftMode?: boolean;
  showMemberPricing?: boolean;
  memberPricingState?: MemberPricingTierState;
  onMemberPricingRowChange?: (idx: number, patch: Partial<MemberPricingRow>) => void;
  showToast?: (msg: string) => void;
  /** Availability card publish toggle. */
  onTogglePublish?: () => void;
  publishToggling?: boolean;
  /**
   * Open one of the Advanced sections as a drill-in sub-screen inside the
   * modal (breadcrumb + Back), instead of expanding inline. The modal renders
   * the step body via StepView and owns the header/footer navigation.
   */
  onOpenStep: (step: "config" | "form") => void;
}

/** Sentinel for a Radix Select option that maps to a stored empty string —
 *  Radix forbids an <Item value="">. */
const NONE = "__none";

export function VariantEditView({
  t,
  onUpdate,
  isDigital,
  communityTag,
  draftMode,
  showMemberPricing,
  memberPricingState,
  onMemberPricingRowChange,
  showToast,
  onTogglePublish,
  publishToggling,
  onOpenStep,
}: VariantEditViewProps) {
  const locked = isTierLocked(t);

  const attrs = t.attrs ?? [];
  const files = t.files ?? [];
  const links = t.links ?? [];

  const patchAttrs = (next: { k: string; v: string }[]) => onUpdate({ attrs: next });
  const patchFiles = (next: TierFile[]) => onUpdate({ files: next });
  const patchLinks = (next: string[]) => onUpdate({ links: next });

  // ── Advanced row values ──
  const salesVal = t.autoScheduleEnabled ? "Scheduled" : "Always on";
  const formCount = t.id
    ? (t.hasForm ? t.formFieldCount : 0)
    : (t.draftForm?.fields?.length ?? 0);
  const formVal = formCount > 0 ? `${formCount} question${formCount !== 1 ? "s" : ""}` : "None";

  return (
    <div className="space-y-5">
      {locked && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50/70 border border-amber-100">
          <Lock className="w-3.5 h-3.5 mt-0.5 text-amber-600 shrink-0" />
          <p className="text-[12px] text-amber-700">
            <span className="font-medium">{`${t.salesCount} sale${t.salesCount !== 1 ? "s" : ""}`}</span>
            {" — price, currency, and installment plan are locked. Refund all sales first to change them."}
          </p>
        </div>
      )}

      {/* 1 · Variant name */}
      <div>
        <Eyebrow count={t.name.length} max={TIER_NAME_MAX}
          help="What distinguishes this variant, e.g. “Blue / M” for a physical option or “Personal” for a licence.">
          Variant name
        </Eyebrow>
        <div className="mt-1">
          <StepInput type="text" value={t.name} maxLength={TIER_NAME_MAX}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder="e.g. Blue / M — or Personal" />
        </div>
      </div>

      {/* 2 · Description */}
      <div>
        <Eyebrow count={t.description.length} max={TIER_DESCRIPTION_MAX}
          help="What this variant is. Markdown supported — bold, lists, links.">
          Description · Markdown · optional
        </Eyebrow>
        <div className="mt-1">
          <StepTextarea value={t.description} maxLength={TIER_DESCRIPTION_MAX}
            onChange={(e) => onUpdate({ description: e.target.value })}
            placeholder="What this variant is. **Bold**, lists, links supported." rows={3} />
        </div>
      </div>

      {/* 3 · Capacity / Stock — lifted directly under Description (was at the
          end of the shape core) to match the event tier editor: the cap is a
          core fact of the variant, set alongside name/description before the
          deliverables and pricing. Digital → "Capacity"; physical → "Stock".
          Same stepper + stored shape (t.capacity, "" = unlimited; on a locked
          tier the floor is the already-sold count). */}
      <div>
        <Eyebrow help="How many can be sold before this variant is sold out. Leave empty for unlimited.">
          {isDigital ? "Capacity" : "Stock"}
        </Eyebrow>
        <div className="mt-1.5">
          <Stepper
            value={t.capacity}
            onChange={(v) => onUpdate({ capacity: v })}
            placeholder="Unlimited"
            min={isTierLocked(t) ? t.salesCount : 0}
            ariaLabel={isDigital ? "Capacity" : "Stock"}
          />
        </div>
      </div>

      {/* 4 · Shape-specific core */}
      {isDigital ? (
        <DigitalCore
          t={t}
          onUpdate={onUpdate}
          files={files}
          links={links}
          patchFiles={patchFiles}
          patchLinks={patchLinks}
        />
      ) : (
        <PhysicalCore t={t} onUpdate={onUpdate} />
      )}

      {/* 4 · Other attributes */}
      <div>
        <Eyebrow>Other attributes</Eyebrow>
        <p className="text-[12px] text-zinc-500 mt-1 mb-2 leading-relaxed">
          {isDigital
            ? "Beyond the deliverables above, attributes buyers pick by (e.g. Format), from a defined set — not freeform."
            : "Beyond condition & parcel above, attributes buyers pick by (Colour, Size, Material…), from a defined set — not freeform."}
          {" Leave empty for a single-variant product."}
        </p>
        <div className="space-y-1.5">
          {attrs.map((a, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <Select
                  value={a.k || undefined}
                  onValueChange={(v) => patchAttrs(attrs.map((x, xi) => (xi === i ? { ...x, k: v } : x)))}
                >
                  <SelectTrigger className="h-[38px] text-[13px]">
                    <SelectValue placeholder="Attribute…" />
                  </SelectTrigger>
                  <SelectContent>
                    {VARIANT_ATTR_KEYS.map((k) => (
                      <SelectItem key={k} value={k}>{k}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-0">
                <StepInput type="text" value={a.v} placeholder="Value (e.g. Blue)"
                  onChange={(e) => patchAttrs(attrs.map((x, xi) => (xi === i ? { ...x, v: e.target.value } : x)))} />
              </div>
              <button type="button" aria-label="Remove attribute"
                onClick={() => patchAttrs(attrs.filter((_, xi) => xi !== i))}
                className="p-1 text-zinc-400 hover:text-red-500 cursor-pointer shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <AddButton label="Add attribute" onClick={() => patchAttrs([...attrs, { k: "", v: "" }])} />
      </div>

      {/* 5 + 6 · Pricing + Billing mode — the existing pricing surface. */}
      <div>
        <Eyebrow>Pricing</Eyebrow>
        <div className="mt-2">
          <BasicsStep
            t={t}
            onUpdate={onUpdate}
            showMemberPricing={showMemberPricing}
            memberPricingState={memberPricingState}
            onMemberPricingRowChange={onMemberPricingRowChange}
            showToast={showToast}
            draftMode={draftMode}
          />
        </div>
      </div>

      {/* 7 · Advanced — drill-in rows. Each opens as a sub-screen INSIDE the
          modal (ConfigStep / FormStep via StepView), with a breadcrumb + Back,
          rather than expanding inline. Capacity stays a stepper in the shape
          core (physical: Stock; digital: Capacity) — not a row here. */}
      <div>
        <Eyebrow>Advanced</Eyebrow>
        <div className="mt-1.5 space-y-2">
          <AdvancedRow
            icon={<Calendar className="h-[17px] w-[17px]" />}
            label="Sales window"
            value={salesVal}
            onClick={() => onOpenStep("config")}
          />

          <AdvancedRow
            icon={<ClipboardList className="h-[17px] w-[17px]" />}
            label="Registration form"
            value={formVal}
            onClick={() => onOpenStep("form")}
          />
        </div>
      </div>

      {/* 8 · Availability — the Published card + info note. */}
      {onTogglePublish && (
        <div>
          <Eyebrow>Availability</Eyebrow>
          <div className="mt-1.5 rounded-xl border border-zinc-200 bg-white">
            <div className="flex items-center gap-3 px-4 py-3.5">
              <span className="text-zinc-500 shrink-0">
                {t.publishedAt ? <Eye className="h-[18px] w-[18px]" /> : <EyeOff className="h-[18px] w-[18px]" />}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-zinc-900">{t.publishedAt ? "Published" : "Draft"}</p>
                <p className="text-[12.5px] text-zinc-500 mt-0.5">
                  {t.publishedAt
                    ? "Buyers can see and choose this variant."
                    : "Hidden from buyers. Only you can see it."}
                </p>
              </div>
              <Switch
                checked={!!t.publishedAt}
                disabled={!!publishToggling}
                onChange={() => onTogglePublish()}
                label="Published"
              />
            </div>
          </div>
          <div
            className="flex items-start gap-2.5 mt-3 px-4 py-3 rounded-xl"
            style={{
              borderLeft: "3px solid var(--brand-color, #71717a)",
              background: "color-mix(in srgb, var(--brand-color, #71717a) 6%, transparent)",
            }}
          >
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: "var(--brand-color, #71717a)" }} />
            <p className="text-[12.5px] text-zinc-600 leading-relaxed">
              {draftMode
                ? <><span className="font-medium text-zinc-800">This choice is saved with the product</span> — nothing goes live until you create it.</>
                : "Changes here take effect immediately."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Physical shape core ──────────────────────────────────────────────── */
function PhysicalCore({ t, onUpdate }: { t: DraftTier; onUpdate: (p: Partial<DraftTier>) => void }) {
  const condition = t.condition ?? "";
  return (
    <div className="space-y-3.5">
      <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
        The item · every physical product has these
      </p>
      <div>
        <label className="block text-[12.5px] font-medium text-zinc-500 mb-1.5">Condition</label>
        <Select
          value={condition ? condition : NONE}
          onValueChange={(v) => onUpdate({ condition: v === NONE ? "" : v })}
        >
          <SelectTrigger className="h-[40px] text-[13px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {VARIANT_CONDITIONS.map(([val, label]) => (
              <SelectItem key={val || NONE} value={val || NONE}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="block text-[12.5px] font-medium text-zinc-500 mb-1.5">Parcel size</label>
        <Select
          value={t.parcelSize || "STANDARD"}
          onValueChange={(v) => onUpdate({ parcelSize: v })}
        >
          <SelectTrigger className="h-[40px] text-[13px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {VARIANT_PARCELS.map(([val, label, hint]) => (
              <SelectItem key={val} value={val}>{label} · {hint}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/* ── Digital shape core ───────────────────────────────────────────────── */
function DigitalCore({
  t, onUpdate, files, links, patchFiles, patchLinks,
}: {
  t: DraftTier;
  onUpdate: (p: Partial<DraftTier>) => void;
  files: TierFile[];
  links: string[];
  patchFiles: (next: TierFile[]) => void;
  patchLinks: (next: string[]) => void;
}) {
  const [dragActive, setDragActive] = useState(false);
  // Append picked/dropped files as TierFile rows carrying the live File object.
  const addFiles = (picked: File[]) => {
    if (picked.length) patchFiles([...files, ...picked.map((file) => ({ name: file.name, file }))]);
  };
  return (
    <div className="space-y-4">
      {/* Files — a REAL file picker. Selecting files appends TierFile rows that
          carry the live File object; the create flow reads t.files[j].file and
          streams the bytes over the multipart channel keyed by tier index.
          Existing files (edit mode) come through as {id,name,url} rows with no
          `file` — shown but not re-uploaded. */}
      <div>
        <label className="block text-[12.5px] font-medium text-zinc-500 mb-1.5">Files</label>
        {files.length > 0 && (
          <div className="space-y-1.5 mb-2.5">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-2.5 rounded-lg border border-zinc-200 bg-white px-3 py-2">
                <FileIcon className="h-[18px] w-[18px] shrink-0" style={{ color: "var(--brand-color, #71717a)" }} />
                <input
                  value={f.name}
                  placeholder="Name this file"
                  onChange={(e) => patchFiles(files.map((x, xi) => (xi === i ? { ...x, name: e.target.value } : x)))}
                  className="flex-1 min-w-0 bg-transparent border-none outline-none text-[13px] text-zinc-900 placeholder:text-zinc-400 py-0.5"
                />
                {f.file && (
                  <span className="text-[11.5px] text-zinc-400 shrink-0">
                    {(f.file.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                )}
                <button type="button" aria-label="Remove file"
                  onClick={() => patchFiles(files.filter((_, xi) => xi !== i))}
                  className="p-1 text-zinc-400 hover:text-red-500 cursor-pointer shrink-0">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <label
          onDragOver={(e) => { e.preventDefault(); if (!dragActive) setDragActive(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
          onDrop={(e) => { e.preventDefault(); setDragActive(false); addFiles(Array.from(e.dataTransfer.files ?? [])); }}
          className={`flex w-full items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3.5 text-left transition-colors cursor-pointer ${dragActive ? "border-[var(--brand-color,#71717a)] bg-[color-mix(in_srgb,var(--brand-color,#71717a)_6%,transparent)]" : "border-zinc-200 bg-zinc-50 hover:border-zinc-300"}`}
        >
          <input
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(Array.from(e.target.files ?? []));
              // Reset so re-picking the same file fires onChange again.
              e.target.value = "";
            }}
          />
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-500">
            <Upload className="h-[18px] w-[18px]" />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-[13px] font-semibold text-zinc-700">Drag files here or browse</span>
            <span className="text-[11.5px] text-zinc-400">PDF, ZIP, MP4, images — this is what buyers download</span>
          </span>
        </label>
      </div>

      {/* External links */}
      <div>
        <label className="block text-[12.5px] font-medium text-zinc-500 mb-1.5">External links</label>
        <div className="space-y-1.5">
          {links.map((l, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <LinkIcon className="h-4 w-4 text-zinc-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <StepInput type="url" value={l} placeholder="https://…"
                  onChange={(e) => patchLinks(links.map((x, xi) => (xi === i ? e.target.value : x)))} />
              </div>
              <button type="button" aria-label="Remove link"
                onClick={() => patchLinks(links.filter((_, xi) => xi !== i))}
                className="p-1 text-zinc-400 hover:text-red-500 cursor-pointer shrink-0">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <AddButton label="Add link" onClick={() => patchLinks([...links, ""])} />
        <p className="text-[11.5px] text-zinc-400 mt-1.5 leading-relaxed">
          Anything hosted elsewhere the buyer should reach, like a Notion doc, a video, or a Drive folder. Handed over as-is
          after purchase; accesses aren't tracked or limited.
        </p>
      </div>

      {/* Licence → licenseTerms */}
      <div>
        <label className="block text-[12.5px] font-medium text-zinc-500 mb-1.5">Licence</label>
        <StepInput type="text" value={t.licenseTerms} maxLength={TIER_LICENSE_TERMS_MAX}
          onChange={(e) => onUpdate({ licenseTerms: e.target.value })}
          placeholder="e.g. Personal use" />
      </div>

      {/* Downloads per file → maxDownloads — only when >=1 file exists. */}
      {files.length > 0 && (
        <div>
          <label className="block text-[12.5px] font-medium text-zinc-500 mb-1.5">Downloads per file, per buyer</label>
          <Stepper
            value={t.maxDownloads}
            onChange={(v) => onUpdate({ maxDownloads: v })}
            placeholder="Unlimited"
            min={0}
            ariaLabel="Downloads per file, per buyer"
          />
          <p className="text-[11.5px] text-zinc-400 mt-2 leading-relaxed">
            Counted separately for each file. How many times a buyer can re-download a given file after purchase. Leave empty
            for unlimited. (External links can't be limited.)
          </p>
        </div>
      )}

    </div>
  );
}

/* ── Advanced drill-in row ─────────────────────────────────────────────
   A tappable row (icon + label + current-value summary + chevron) that opens
   its section as a sub-screen inside the modal, rather than expanding inline.
   Same card styling as the other tappable rows in this view. */
function AdvancedRow({
  icon, label, value, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-left border border-zinc-200 bg-white rounded-xl transition-colors hover:border-zinc-300 cursor-pointer"
    >
      <span className="text-zinc-500 shrink-0">{icon}</span>
      <span className="flex-1 text-[14px] font-medium text-zinc-900">{label}</span>
      <span className="text-[13px] text-zinc-500">{value}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300" />
    </button>
  );
}

/* ── Dashed "+ Add …" button ──────────────────────────────────────────── */
function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-200 px-3 py-2.5 text-[13px] font-medium text-zinc-500 transition-colors hover:border-zinc-300 hover:text-zinc-700 cursor-pointer"
    >
      <Plus className="h-4 w-4" /> {label}
    </button>
  );
}
