# UltimaBase website

This private Next.js application hosts the public product site and Fumadocs
documentation. It is part of the Yarn workspace but is excluded from the root
publishable-package build graph.

The product name, release label, repository URL, canonical URL, and navigation
are provisional and centralized in `lib/site.ts`. Set `NEXT_PUBLIC_SITE_URL` to
an absolute preview URL when validating canonical metadata; local development
uses `http://localhost:3000` by default.

## Local development

From the repository root:

```bash
yarn install
yarn website:dev
```

Open `http://localhost:3000`. Marketing routes use the `(marketing)` route
group, while documentation is mounted at `/docs` through the `(docs)` group.
Public documentation source belongs in `content/docs`; root `docs/` remains the
engineering source for ADRs, specifications, and implementation plans.

## Validation

Run the focused checks before committing website changes:

```bash
yarn website:typecheck
yarn website:lint
yarn website:build
yarn website:test
```

The production build creates `.next`, and Fumadocs generates `.source` before
the focused checks. Both are ignored by Git, ESLint, and Prettier. The ordinary
root `yarn build` continues to build only non-private publishable workspaces.
Next.js also maintains the conventional tracked `next-env.d.ts`; repository
formatting and linting leave that generated declaration untouched.

## Visual system

`app/theme.css` is the replaceable source for typography, spacing, radii,
borders, semantic colors, the light and dark palettes, and the single coral
accent. `components/brand-mark.tsx` owns the provisional geometric mark used by
the navigation and generated favicon.

Shared marketing and documentation surfaces live under `components/`:

- `brand.tsx` provides the text mark and navigation identity;
- `site-shell.tsx` provides the common footer while Fumadocs renders responsive
  headers from the shared options in `lib/layout.tsx`;
- `primitives.tsx` provides buttons, links, sections, code surfaces, and
  callouts.

The browser test builds and starts the production application, then checks the
light and dark shells, mobile and 200%-zoom-equivalent reflow, reduced motion,
focus semantics, and WCAG A/AA findings with Playwright and Axe.
