# @cobuntu/product-management-ui

Shared marketplace-product management UI consumed by [`cobuntu-admin`](https://github.com/cobuntuHello/cobuntu-community-backoffice) (community-leader-facing) and `cobuntu-community-app` (seller-facing, via `/marketplace/[sku]/manage`).

**Sibling to** [`@cobuntu/event-management-ui`](https://github.com/cobuntuHello/cobuntu-event-management-ui). Same pattern, separate package — products and events are different bounded domains.

## How it's consumed

Both apps add this as a **git dependency** in their `package.json`:

```json
{
  "dependencies": {
    "@cobuntu/product-management-ui": "git+https://github.com/cobuntuHello/cobuntu-product-management-ui.git#<sha-or-tag>"
  }
}
```

And tell Next.js to transpile it (the package ships TypeScript source directly). As of v0.0.2 this package depends on `@cobuntu/management-ui-shared` for cross-package primitives, so consumers must transpile both:

```js
// next.config.js
module.exports = {
  transpilePackages: [
    '@cobuntu/product-management-ui',
    '@cobuntu/management-ui-shared',
  ],
  // ...
};
```

Then import normally:

```tsx
import { PriceEditModal } from '@cobuntu/product-management-ui';
```

## Pinning

- **Production**: pin to a specific commit SHA or version tag. `#main` is convenient in dev but lets `npm install` pick up arbitrary changes — don't ship that.
- **Development**: `#main` is fine; bump the lockfile by re-running `npm install` when you want the latest.

## Development

```bash
npm install
npm run typecheck
npm test
```

Peer dependencies:
- React >=19
- React DOM >=19
- Next >=16

The package ships TypeScript source directly. Consumers' Next.js build (via `transpilePackages`) compiles it — no build step in this repo.

## Shared primitives with event-management-ui

As of v0.0.2, modal/form primitives that previously lived in both this package and `@cobuntu/event-management-ui` have been extracted into [`@cobuntu/management-ui-shared`](https://github.com/cobuntuHello/cobuntu-management-ui-shared) — the cross-cutting bits like `ModalShell`, `TextField`, `WizardProgress`, `BillingRadio`. Both packages depend on it.

Domain-specific primitives (e.g. `BannerCropModal`, `StockPhotoPicker`, `FileUploadZone` in this package) stay local — they're product-specific and don't belong in the shared package.

## Migration progress

- [x] `PriceEditModal`
- [ ] `EditProductDrawer` + small modals (Name / Delete / Share)
