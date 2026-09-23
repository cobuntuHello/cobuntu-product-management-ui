import { describe, it, expect } from "vitest";
import { tierFileUploads } from "../components/PriceEditModal/helpers";
import type { DraftTier } from "../components/PriceEditModal/types";

/**
 * Per-variant file uploads for the create request.
 *
 * The backend routes each variant's deliverables by `tierFiles:<i>`, where `i`
 * indexes the `tiers` JSON array it received. `draftTiersToCreatePayload`
 * builds that array and DROPS soft-deleted and blank-name drafts, so the index
 * has to be counted over the same filtered list.
 *
 * Get that wrong and the save still succeeds — the files simply land on the
 * wrong variant's product, and a buyer receives someone else's download.
 */
const tier = (over: Partial<DraftTier> = {}): DraftTier => ({
  key: Math.random().toString(36).slice(2),
  name: "Tier",
  description: "",
  price: "10",
  currency: "EUR",
  capacity: "",
  priceMode: "fixed",
  pwywMin: "",
  licenseTerms: "",
  maxDownloads: "",
  isRecurring: false,
  recurringInterval: "month",
  installmentEnabled: false,
  installmentTotal: "",
  installmentCount: "",
  installmentInterval: "",
  installmentAccessMonths: "",
  publishedAt: null,
  autoScheduleEnabled: false,
  salesStartAt: "",
  salesEndAt: "",
  ...over,
} as DraftTier);

const f = (name: string) => new File(["x"], name, { type: "text/plain" });

describe("tierFileUploads", () => {
  it("keys each file by its variant's index", () => {
    const out = tierFileUploads([
      tier({ name: "Small", files: [{ name: "a.pdf", file: f("a.pdf") }] }),
      tier({ name: "Large", files: [{ name: "b.pdf", file: f("b.pdf") }] }),
    ]);
    expect(out.map((u) => u.field)).toEqual(["tierFiles:0", "tierFiles:1"]);
  });

  it("counts over the FILTERED list, so a deleted draft does not shift files", () => {
    /*
     * The bug this exists to prevent. Three variants, the middle one deleted:
     * the payload the backend receives has two entries, so the survivor must
     * be index 1 — not 2, which would attach it to the wrong product.
     */
    const out = tierFileUploads([
      tier({ name: "Small", files: [{ name: "a.pdf", file: f("a.pdf") }] }),
      tier({ name: "Medium", deleted: true, files: [{ name: "gone.pdf", file: f("gone.pdf") }] }),
      tier({ name: "Large", files: [{ name: "c.pdf", file: f("c.pdf") }] }),
    ]);
    expect(out.map((u) => [u.field, u.file.name])).toEqual([
      ["tierFiles:0", "a.pdf"],
      ["tierFiles:1", "c.pdf"],
    ]);
  });

  it("drops a blank-name draft the same way the payload builder does", () => {
    const out = tierFileUploads([
      tier({ name: "   ", files: [{ name: "x.pdf", file: f("x.pdf") }] }),
      tier({ name: "Real", files: [{ name: "y.pdf", file: f("y.pdf") }] }),
    ]);
    expect(out).toEqual([{ field: "tierFiles:0", file: expect.objectContaining({ name: "y.pdf" }) }]);
  });

  it("ignores files that are already attached server-side", () => {
    // An existing file carries an id and a url, no File — re-uploading it
    // would duplicate the attachment.
    const out = tierFileUploads([
      tier({ name: "Small", files: [{ id: "att-1", name: "old.pdf", url: "https://x/old.pdf" }] }),
    ]);
    expect(out).toEqual([]);
  });

  it("carries several files for one variant under the same field", () => {
    const out = tierFileUploads([
      tier({ name: "Bundle", files: [
        { name: "a.pdf", file: f("a.pdf") },
        { name: "b.pdf", file: f("b.pdf") },
      ] }),
    ]);
    expect(out.map((u) => u.field)).toEqual(["tierFiles:0", "tierFiles:0"]);
  });
});
