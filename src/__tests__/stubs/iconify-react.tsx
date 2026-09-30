import React from "react";

/*
 * A stand-in for @iconify/react under test.
 *
 * The package IMPORTS @iconify/react (CategoryEditModal) but does not depend on
 * it: every host app provides it, which is why the components work in the apps
 * and why the three test files that reach that import could not load here.
 * vitest.config.ts aliases the module to this file so they run; the real Icon
 * is never under test in this package anyway.
 */
export function Icon({ icon, ...rest }: { icon?: string } & Record<string, unknown>) {
  return React.createElement("span", { "data-icon": icon, ...rest });
}

export default Icon;
