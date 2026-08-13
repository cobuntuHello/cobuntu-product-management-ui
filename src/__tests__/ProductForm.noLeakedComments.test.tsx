import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * No bare block comments in JSX child position.
 *
 * `/* ... *\/` is a comment in JS but plain TEXT between JSX tags - it only
 * works inside an expression container, `{/* ... *\/}`. Moving a block of JSX
 * during the card split carried its comment from expression position (valid)
 * into children position (rendered), and a line of source code appeared on the
 * live create-product page above the Require approval row.
 *
 * tsc cannot catch it: the JSX is perfectly valid, it just says something.
 */

const FILES = ["../components/ProductForm.tsx", "../page/ProductSettingsDrawer.tsx"];

describe("comments stay comments", () => {
  for (const f of FILES) {
    it(`${f.split("/").pop()} has no bare block comment in JSX`, () => {
      const src = readFileSync(resolve(__dirname, f), "utf8");
      const offenders: string[] = [];
      const lines = src.split("\n");
      lines.forEach((line, i) => {
        const t = line.trim();
        if (!t.startsWith("/*")) return;
        /*
         * A block comment is safe at statement level. It leaks only when the
         * PREVIOUS meaningful line opened JSX - a tag, or an expression
         * container that JSX children follow.
         */
        let j = i - 1;
        while (j >= 0 && !lines[j].trim()) j--;
        const prev = j >= 0 ? lines[j].trim() : "";
        if (/(<[A-Za-z][^>]*>|&& \(|\? \(|: \()$/.test(prev)) {
          offenders.push(`line ${i + 1}: ${t.slice(0, 60)}`);
        }
      });
      expect(offenders).toEqual([]);
    });
  }
});
