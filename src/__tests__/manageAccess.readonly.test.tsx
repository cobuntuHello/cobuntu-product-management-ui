/**
 * Read-only product manage: the editing surfaces stop opening.
 *
 * Mirrors the event package's guard, for the same reason and after the same
 * mistake. There, the first pass gated the modal openers in two views and
 * missed two others that opened their editors directly — so a leader of a
 * community that merely CARRIED an event could still rewrite its schedule and
 * mail its attendees.
 *
 * The gate is at the OPENER: a modal that cannot be opened cannot save, so a
 * control that slips through leads nowhere instead of leading to a 403. That
 * only holds if the openers have been enumerated, which is what the second
 * test here does — from source, so a new view cannot skip it quietly.
 */

import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { useState } from "react";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { ManageAccessProvider, useCanEdit } from "../lib/manageAccess";

function Editable() {
  const [open, setOpenState] = useState(false);
  const canEdit = useCanEdit();
  const setOpen = (v: boolean) => {
    if (!canEdit && v !== false) return;
    setOpenState(v);
  };
  return (
    <div>
      <button onClick={() => setOpen(true)}>Edit price</button>
      <button onClick={() => setOpen(false)}>Close</button>
      {open && <div data-testid="modal">price editor</div>}
    </div>
  );
}

describe("read-only manage access", () => {
  it("opens the editor when the viewer may edit", () => {
    render(<ManageAccessProvider canEdit><Editable /></ManageAccessProvider>);
    act(() => { screen.getByText("Edit price").click(); });
    expect(screen.getByTestId("modal")).toBeInTheDocument();
  });

  it("refuses to open it when the viewer may not", () => {
    render(<ManageAccessProvider canEdit={false}><Editable /></ManageAccessProvider>);
    act(() => { screen.getByText("Edit price").click(); });
    expect(screen.queryByTestId("modal")).toBeNull();
  });

  it("still lets a read-only viewer close what is already open", () => {
    // Read-only is about writing. A dialog nobody can dismiss is worse than
    // the bug this fixes.
    function AlreadyOpen() {
      const [open, setOpenState] = useState(true);
      const canEdit = useCanEdit();
      const setOpen = (v: boolean) => { if (!canEdit && v !== false) return; setOpenState(v); };
      return (
        <div>
          <button onClick={() => setOpen(false)}>Close</button>
          {open && <div data-testid="modal">open</div>}
        </div>
      );
    }
    render(<ManageAccessProvider canEdit={false}><AlreadyOpen /></ManageAccessProvider>);
    act(() => { screen.getByText("Close").click(); });
    expect(screen.queryByTestId("modal")).toBeNull();
  });

  it("defaults to editable with no provider, so existing consumers are unchanged", () => {
    render(<Editable />);
    act(() => { screen.getByText("Edit price").click(); });
    expect(screen.getByTestId("modal")).toBeInTheDocument();
  });
});

const VIEWS_DIR = join(__dirname, "..", "page", "views");

/** Views that cannot write, and why. Checked, not assumed. */
const READ_ONLY_BY_NATURE: Record<string, string> = {};

/*
 * Comments are stripped before ANY of these run.
 *
 * The first version of this guard did not strip them, and it silently passed
 * when the gate was deleted from CollaboratorsView -- because the explanatory
 * comment left behind still contained the words "useCanEdit". A guard that
 * matches its own prose is worse than no guard: it reports success for a file
 * that does nothing.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}
function writesToServer(src: string): boolean {
  return /method:\s*["'](POST|PATCH|PUT|DELETE)["']/.test(src);
}
function opensAnEditor(src: string): boolean {
  return /set(Modal|ShowEditDrawer|SettingsOpen|AddOpen|ConfirmRemove)\b/.test(src);
}

describe("read-only coverage across the manage views", () => {
  const files = readdirSync(VIEWS_DIR).filter((f) => f.endsWith(".tsx"));

  it("finds the views (a sweep that enumerates nothing passes for the wrong reason)", () => {
    expect(files.length).toBeGreaterThan(1);
  });

  it.each(readdirSync(VIEWS_DIR).filter((f) => f.endsWith(".tsx")))(
    "%s consults the gate if it can write",
    (file) => {
      const src = stripComments(readFileSync(join(VIEWS_DIR, file), "utf8"));
      const canWrite = writesToServer(src) || opensAnEditor(src);
      if (!canWrite) return;

      if (file in READ_ONLY_BY_NATURE) {
        throw new Error(
          `${file} is exempted ("${READ_ONLY_BY_NATURE[file]}") but now writes. `
          + `Remove the exemption and gate it.`,
        );
      }

      expect(
        /useCanEdit\s*\(/.test(src),
        `${file} can write but never calls useCanEdit(). A leader of a community that `
        + `merely CARRIES this product would be able to change it. Gate the opener, or `
        + `add the file to READ_ONLY_BY_NATURE with the reason.`,
      ).toBe(true);
    },
  );
});
