/**
 * The product surfaces' copy: the host's language first, this package's
 * English when the host has none.
 *
 * ProductForm, the tier/donation editors and the product manage modals used to
 * write their English straight into the JSX, so a Portuguese host (Impact Hub
 * Porto, Nov 2026) read "Let's start with the basics", "Add variant",
 * "Require approval" inside an otherwise Portuguese create wizard.
 *
 * Every string now has a key under `marketplaceUi.productUi.*`, with its
 * English in PRODUCT_WIZARD_MESSAGES_EN (which the community app merges into
 * its `en`, and translates in every locale). Components ask through
 * management-ui-shared's copy context, which the app's ManagementCopyProvider
 * feeds with next-intl. A host without that provider (or without the key)
 * gets the key path back from it; that is the signal to use the English
 * here, so no host ever renders a dotted key.
 */
import { useMemo } from "react";
import { useSharedT, getSharedT } from "@cobuntu/management-ui-shared";
import { createWizardTranslator, type WizardTranslationValues } from "../create-wizard/i18n";
import { PRODUCT_WIZARD_MESSAGES_EN } from "../create-wizard/messages.en";

export type ProductT = (key: string, values?: WizardTranslationValues) => string;

const builtIn = createWizardTranslator(PRODUCT_WIZARD_MESSAGES_EN);

type SharedLike = (key: string, values?: WizardTranslationValues) => string;

function withFallback(shared: SharedLike, namespace: string): ProductT {
  return (key, values) => {
    const full = `${namespace}.${key}`;
    let out: string | undefined;
    try {
      out = shared(key, values);
    } catch {
      out = undefined;
    }
    // Missing on the host: next-intl and the shared default both answer with
    // the key itself (fully qualified or not).
    if (!out || out === full || out === key || out.endsWith(`.${key}`) && out.startsWith("marketplaceUi.")) {
      return builtIn(full, values);
    }
    return out;
  };
}

/** `const tp = useProductT("marketplaceUi.productUi.productForm")`, then `tp("addVariant")`. */
export function useProductT(namespace: string): ProductT {
  const shared = useSharedT(namespace);
  return useMemo(() => withFallback(shared as SharedLike, namespace), [shared, namespace]);
}

/** Non-hook form for helpers called during render (reads the provider's current translator). */
export function getProductT(namespace: string): ProductT {
  return withFallback(getSharedT(namespace) as SharedLike, namespace);
}

/**
 * A currency's name in the host's language, from the browser's own data, so
 * "British Pound" reads "libra esterlina" in Portuguese without a key per
 * currency. Falls back to the English name it is given.
 */
export function currencyDisplayName(code: string, english: string): string {
  const locale = getProductT("marketplaceUi.productUi.common")("locale");
  try {
    const name = new Intl.DisplayNames([locale], { type: "currency" }).of(code);
    if (name && name !== code) return name.charAt(0).toUpperCase() + name.slice(1);
  } catch { /* unknown locale or no Intl.DisplayNames */ }
  return english;
}
