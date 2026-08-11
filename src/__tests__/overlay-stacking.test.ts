import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * Every overlay must clear the HOST APP's chrome.
 *
 * The community app's sidebar and header sit at z-[52]. This package's modals
 * were z-50, so an open modal dimmed the page but left the sidebar bright and
 * fully clickable on top of it — the overlay was underneath the navigation.
 *
 * 120 is the floor the events package already settled on. 130 is reserved for
 * something that must beat another overlay (a confirmation raised from inside
 * a drawer), which is a real case: the events drawer's own confirmation sat at
 * 60 under its 120 drawer, so saving looked like it did nothing.
 *
 * Asserted across the whole source tree rather than a list of files, because
 * the failure mode is a NEW overlay written at the Tailwind default.
 */

const SRC = resolve(__dirname, "..");
const CHROME_Z = 52;

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return entry === "__tests__" ? [] : tsxFiles(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}

describe("overlay stacking", () => {
  it("no full-screen overlay sits at or below the host chrome", () => {
    const offenders: string[] = [];

    for (const file of tsxFiles(SRC)) {
      const src = readFileSync(file, "utf8");
      for (const line of src.split("\n")) {
        if (!line.includes("fixed inset-0")) continue;
        // An overlay with no z at all also loses to a positioned sidebar.
        const match = line.match(/z-\[(\d+)\]|z-(\d+)/);
        const z = match ? Number(match[1] ?? match[2]) : 0;
        if (z <= CHROME_Z) {
          offenders.push(`${file.replace(SRC, "src")}: z=${z || "none"}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
