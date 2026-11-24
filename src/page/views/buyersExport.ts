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
    }>;
    grants: Array<{ createdAt: string; openedAt?: string | null; kind?: "GIFT" | "ADD"; saleId?: string | null; users?: Person }>;
    pending: Array<{ email: string; name?: string | null; createdAt: string; kind?: "GIFT" | "ADD"; saleId?: string | null }>;
    /** Tier id to name, for grants that name a tier. */
    tierNameById?: Map<string, string>;
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
            ...blanks,
        ]),
    ];

    return { sheetName: input.productName || "Buyers", columns, rows };
}
