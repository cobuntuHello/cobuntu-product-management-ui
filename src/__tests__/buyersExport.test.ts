/**
 * The Buyers tab export (T-397): products and courses had no people export.
 * Everyone who has the item, how they got it, what it cost, when, and the
 * answers to the tier's form, through the shared Excel/CSV writer.
 */
import { describe, expect, it } from "vitest";
import { toCsv } from "@cobuntu/management-ui-shared";
import { answerText, buyersExportTable } from "../page/views/buyersExport";

const fields = [
    { id: "f1", type: "SHORT_TEXT", label: "Company" },
    { id: "f2", type: "SINGLE_CHOICE", label: "Diet", options: [{ id: "o1", label: "Vegan" }, { id: "o2", label: "None" }] },
];

const input = {
    productName: "Workshop notes",
    customers: [{
        grossAmount: 2952, currency: "EUR", createdAt: "2026-11-19T10:00:00Z", guestEmail: null,
        user: { id: "u1", name: "João Cunha", usertag: "joao", email: "j@x.pt" }, tier: { name: "Early bird" },
        formAnswers: { fields, answer: { f1: "INESC TEC", f2: "o1" } },
    }, {
        grossAmount: 0, currency: "EUR", createdAt: "2026-11-20T10:00:00Z", guestEmail: "guest@x.pt", user: null, tier: null, formAnswers: null,
    }],
    grants: [
        { createdAt: "2026-11-18T09:00:00Z", openedAt: "2026-11-18T12:00:00Z", kind: "GIFT" as const, users: { name: "André Barros", email: "a@x.pt" } },
        { createdAt: "2026-11-18T09:00:00Z", kind: "ADD" as const, users: { name: "Rui Barros", email: "r@x.pt", usertag: "rui" } },
        { createdAt: "2026-11-18T09:00:00Z", kind: "GIFT" as const, saleId: "s9", users: { name: "Rita", email: "rita@x.pt" } },
    ],
    pending: [{ email: "new@x.pt", name: "Nova", createdAt: "2026-11-21T09:00:00Z", kind: "GIFT" as const }],
};

const t = buyersExportTable(input);
const col = (h: string) => t.columns.findIndex((c) => c.header === h);

describe("Buyers export", () => {
    it("has a row per person, with how they got it and what it cost", () => {
        expect(t.rows.map((r) => [r[col("Name")], r[col("How")], r[col("Price")]])).toEqual([
            ["João Cunha", "Bought", 29.52],
            ["", "Bought", 0],
            ["André Barros", "Gift from a host", 0],
            ["Rui Barros", "Added by a host", 0],
            ["Rita", "Gift, bought by someone", null],
            ["Nova", "Gift from a host (not joined yet)", 0],
        ]);
    });

    it("carries emails, including a guest's, the dates, and when a gift was opened", () => {
        expect(t.rows.map((r) => r[col("Email")])).toEqual(["j@x.pt", "guest@x.pt", "a@x.pt", "r@x.pt", "rita@x.pt", "new@x.pt"]);
        expect(t.rows[0][col("Got access")]).toEqual(new Date("2026-11-19T10:00:00Z"));
        expect(t.rows[2][col("Gift opened")]).toEqual(new Date("2026-11-18T12:00:00Z"));
        expect(t.rows[3][col("Gift opened")]).toBeNull();
    });

    it("puts each form question in its own column, with the option picked", () => {
        expect(t.columns.slice(-2).map((c) => c.header)).toEqual(["Form: Company", "Form: Diet"]);
        expect(t.rows[0].slice(-2)).toEqual(["INESC TEC", "Vegan"]);
        expect(t.rows[2].slice(-2)).toEqual(["", ""]);
        expect(answerText(fields[1], ["o1", "o2"])).toBe("Vegan, None");
    });

    it("writes a CSV Excel reads with accents intact", () => {
        const csv = toCsv(t);
        expect(csv.charCodeAt(0)).toBe(0xfeff);
        expect(csv).toContain("João Cunha");
        expect(csv).toContain("André Barros");
    });

    describe("where the money went (T-397)", () => {
        const split = { donation: 0, shipping: 0, vat: 0, community: 0, communityName: null, cobuntu: 150, stripe: 52, seller: 2750, sellerExVat: 2750 };
        const withSplit = { ...input, customers: [{ ...input.customers[0], split }, { ...input.customers[1], split: null }] };
        const ts = buyersExportTable(withSplit);
        const c = (h: string) => ts.columns.findIndex((x) => x.header === h);

        it("adds the split for a viewer the Ledger shows it to, zeros for gifts and adds", () => {
            const heads = ["Community gets", "Cobuntu gets", "Stripe gets", "Seller gets", "VAT", "Seller net (excl. VAT)"];
            expect(heads.map((h) => ts.rows[0][c(h)])).toEqual([0, 1.5, 0.52, 27.5, 0, 27.5]);
            expect(heads.map((h) => ts.rows[1][c(h)])).toEqual([null, null, null, null, null, null]);
            expect(heads.map((h) => ts.rows[2][c(h)])).toEqual([0, 0, 0, 0, 0, 0]);
            expect(heads.map((h) => ts.rows[4][c(h)])).toEqual([null, null, null, null, null, null]);
            expect(split.community + split.cobuntu + split.stripe + split.seller).toBe(2952);
        });

        it("leaves the split out when the backend sent none", () => {
            expect(col("Seller gets")).toBe(-1);
        });
    });
});
