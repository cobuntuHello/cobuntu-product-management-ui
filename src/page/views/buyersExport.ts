/**
 * The Buyers tab as a table, for its Export (T-397).
 *
 * Products and courses had no people export at all. One row per person who
 * has the item: everyone who checked out (free or paid), everyone a host gave
 * it to (a gift or a plain add), and gifts still waiting for their address to
 * join. Per row: who, which tier, HOW they got it, what it cost (0 for a gift
 * or an add), when they got it, then one column per question of the tier's
 * form (checkout answers, from the customers endpoint since T-397).
 *
 * Written through the shared writer, so it comes out as Excel or as a CSV
 * Excel reads with accents intact.
 */
import type { ExportCell, ExportColumn, ExportTable } from "@cobuntu/management-ui-shared";

type Person = { id?: string; name?: string | null; usertag?: string | null; email?: string | null } | null | undefined;
type FormField = { id: string; type?: string; label?: string; options?: Array<{ id: string; label: string }> };

export interface BuyersExportInput {
    productName: string;
    customers: Array<{
        grossAmount: number; currency: string; createdAt: string; guestEmail: string | null; user: Person;
        tier?: { name: string } | null;
        formAnswers?: { fields: FormField[]; answer: Record<string, unknown> } | null;
        /** Where the money went, in cents; present only for a viewer the item's Ledger shows the sale to. */
        split?: SaleSplit | null;
    }>;
    grants: Array<{ createdAt: string; openedAt?: string | null; kind?: "GIFT" | "ADD"; saleId?: string | null; users?: Person }>;
    pending: Array<{ email: string; name?: string | null; createdAt: string; kind?: "GIFT" | "ADD"; saleId?: string | null }>;
    /** Tier id to name, for grants that name a tier. */
    tierNameById?: Map<string, string>;
}

/** Where one sale's money went, in cents (backend shared/sales/saleSplit.ts). */
export interface SaleSplit {
    donation: number; shipping: number; vat: number;
    community: number; communityName: string | null;
    cobuntu: number; stripe: number; seller: number; sellerExVat: number;
}

/** One form answer as text: option ids become what was picked. */
export function answerText(field: FormField | undefined, value: unknown): string {
    if (value == null || value === "") return "";
    const label = (v: unknown) => field?.options?.find((o) => o.id === v)?.label ?? String(v);
    if (Array.isArray(value)) return value.map(label).join(", ");
    return field?.options?.length ? label(value) : String(value);
}

function dateOf(iso: unknown): Date | null {
    if (!iso) return null;
    const d = new Date(String(iso));
    return Number.isNaN(d.getTime()) ? null : d;
}

export function buyersExportTable(input: BuyersExportInput): ExportTable {
    const fieldOrder: string[] = [];
    const fieldDefs = new Map<string, FormField>();
    for (const c of input.customers) {
        for (const f of c.formAnswers?.fields ?? []) {
            if (!f?.id || fieldDefs.has(f.id)) continue;
            fieldDefs.set(f.id, f);
            fieldOrder.push(f.id);
        }
    }

    // The split columns (T-397), only when the backend sent one: the viewer may
    // see this item's Ledger. Each row adds up to what was paid:
    // price + shipping + donation = community + Cobuntu + Stripe + seller.
    const hasSplit = input.customers.some((c) => "split" in c);
    const hasShipping = input.customers.some((c) => (c.split?.shipping ?? 0) > 0);
    const hasDonation = input.customers.some((c) => (c.split?.donation ?? 0) > 0);
    const splitColumns: ExportColumn[] = hasSplit ? [
        ...(hasShipping ? [{ header: "Shipping", kind: "money" } as ExportColumn] : []),
        ...(hasDonation ? [{ header: "Donation", kind: "money" } as ExportColumn] : []),
        { header: "Community" },
        { header: "Community gets", kind: "money" },
        { header: "Cobuntu gets", kind: "money" },
        { header: "Stripe gets", kind: "money" },
        { header: "Seller gets", kind: "money" },
        { header: "VAT", kind: "money" },
        { header: "Seller net (excl. VAT)", kind: "money" },
    ] : [];
    /** A row's split cells: a sale's own, zeros for a gift or an add, blanks when unknown. */
    const splitCells = (split: SaleSplit | null | undefined, nothingMoved: boolean): ExportCell[] => {
        if (!hasSplit) return [];
        const part = (cents: number | undefined) => (split ? (cents ?? 0) / 100 : nothingMoved ? 0 : null);
        return [
            ...(hasShipping ? [part(split?.shipping)] : []),
            ...(hasDonation ? [part(split?.donation)] : []),
            split?.communityName ?? "",
            part(split?.community), part(split?.cobuntu), part(split?.stripe),
            part(split?.seller), part(split?.vat), part(split?.sellerExVat),
        ];
    };

    const columns: ExportColumn[] = [
        { header: "Name" },
        { header: "Email" },
        { header: "Usertag" },
        { header: "Tier" },
        { header: "How" },
        { header: "Price", kind: "money" },
        { header: "Currency" },
        { header: "Got access", kind: "date" },
        { header: "Gift opened", kind: "date" },
        ...splitColumns,
        // "Form:" keeps a question called "Name" or "Email" apart from the columns above.
        ...fieldOrder.map((id) => ({ header: `Form: ${fieldDefs.get(id)?.label || id}` })),
    ];
    const blanks = fieldOrder.map(() => "");
    const tag = (p: Person) => (p?.usertag ? `@${p.usertag}` : "");
    const currency = input.customers[0]?.currency ?? "EUR";

    const rows: ExportCell[][] = [
        ...input.customers.map((c) => [
            c.user?.name || "",
            c.user?.email || c.guestEmail || "",
            tag(c.user),
            c.tier?.name || "",
            "Bought",
            c.grossAmount / 100,
            c.currency,
            dateOf(c.createdAt),
            null,
            ...splitCells(c.split, false),
            ...fieldOrder.map((id) => answerText(fieldDefs.get(id), c.formAnswers?.answer?.[id])),
        ]),
        // A bought gift's price is on its buyer's row above; the recipient's row says so.
        ...input.grants.map((g) => [
            g.users?.name || "",
            g.users?.email || "",
            tag(g.users),
            "",
            g.saleId ? "Gift, bought by someone" : g.kind === "ADD" ? "Added by a host" : "Gift from a host",
            g.saleId ? null : 0,
            currency,
            dateOf(g.createdAt),
            g.kind === "ADD" ? null : dateOf(g.openedAt),
            ...splitCells(null, !g.saleId),
            ...blanks,
        ]),
        ...input.pending.map((p) => [
            p.name || "",
            p.email,
            "",
            "",
            p.saleId ? "Gift, bought by someone (not joined yet)" : p.kind === "ADD" ? "Added by a host (not joined yet)" : "Gift from a host (not joined yet)",
            p.saleId ? null : 0,
            currency,
            dateOf(p.createdAt),
            null,
            ...splitCells(null, !p.saleId),
            ...blanks,
        ]),
    ];

    return { sheetName: input.productName || "Buyers", columns, rows };
}
