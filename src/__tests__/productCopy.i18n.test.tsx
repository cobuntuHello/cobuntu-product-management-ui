import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ManagementCopyProvider } from "@cobuntu/management-ui-shared";
import { DeleteModal } from "../components/DeleteModal";
import { PRODUCT_WIZARD_MESSAGES_EN } from "../create-wizard/messages.en";

/**
 * The product surfaces speak the host's language, and English without one.
 *
 * ProductForm, the tier/variant editors and the product modals wrote English
 * straight into the JSX, so a Portuguese host (Impact Hub Porto, Nov 2026)
 * read "Let's start with the basics" and "Add variant" in a Portuguese wizard.
 * They now ask `marketplaceUi.productUi.*` through management-ui-shared's copy
 * context (the community app's ManagementCopyProvider, next-intl), and fall
 * back to this package's English when the host has no answer.
 */

const PT: Record<string, string> = {
  "marketplaceUi.productUi.common.cancel": "Cancelar",
  "marketplaceUi.productUi.deleteModal.permanentlyDelete": "Isto elimina “{name}” para sempre.",
};
// A next-intl-like host: known keys translated (with {name}), unknown keys returned as their path.
const hostT = (key: string, values?: Record<string, unknown>) =>
  key in PT ? PT[key].replace("{name}", String(values?.name ?? "")) : key;

describe("product copy", () => {
  it("uses the host's translation when it has one", () => {
    render(
      <ManagementCopyProvider t={hostT as never}>
        <DeleteModal productName="Mentoria" onDelete={vi.fn()} onClose={vi.fn()} />
      </ManagementCopyProvider>,
    );
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
    expect(screen.getByText("Isto elimina “Mentoria” para sempre.")).toBeInTheDocument();
  });

  it("falls back to this package's English for a key the host does not have", () => {
    render(
      <ManagementCopyProvider t={hostT as never}>
        <DeleteModal productName="Mentoria" onDelete={vi.fn()} onClose={vi.fn()} />
      </ManagementCopyProvider>,
    );
    // The host returned the key path for these; the English shows, never the path.
    expect(screen.getByText("Delete product?")).toBeInTheDocument();
    expect(screen.queryByText(/marketplaceUi\.productUi/)).not.toBeInTheDocument();
  });

  it("renders English with no host provider at all", () => {
    render(<DeleteModal productName="Mentoria" onDelete={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByText("This will permanently delete “Mentoria” and remove it from all community listings. This cannot be undone.")).toBeInTheDocument();
  });
});

describe("every product-UI key the code asks for has English", () => {
  const root = join(__dirname, "..");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (name === "__tests__" || name === "node_modules") continue;
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(name)) files.push(p);
    }
  };
  walk(root);
  const en = (PRODUCT_WIZARD_MESSAGES_EN as any).marketplaceUi.productUi;
  const has = (key: string) => key.split(".").reduce<any>((n, part) => (n == null ? undefined : n[part]), en) !== undefined;

  it("finds the calls (canary)", () => {
    const n = files.reduce((acc, f) => acc + (readFileSync(f, "utf8").match(/\btp\("/g)?.length ?? 0), 0);
    expect(n).toBeGreaterThan(300);
  });

  it("resolves every literal key", () => {
    const missing: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/\b(?:tp|getProductT\("marketplaceUi\.productUi"\))\("([A-Za-z0-9_.]+)"/g)) {
        if (!has(m[1])) missing.push(`${f.replace(root, "src")}: ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
