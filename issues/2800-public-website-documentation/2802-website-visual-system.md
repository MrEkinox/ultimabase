# 2802: Establish the provisional visual system

- Status: completed
- Milestone: 28
- Packages: `apps/website`
- Depends on: 2801
- ADR: none

## Goal

Give the website a coherent, replaceable visual identity that feels specific to
the product without requiring a final name, logo, or brand deliverable.

## Acceptance criteria

- [x] Typography, spacing, radii, borders, semantic colors, light mode, dark
      mode, and one restrained accent are expressed through shared tokens.
- [x] A provisional text mark and small geometric symbol work at navigation and
      favicon sizes and can be replaced from one component boundary.
- [x] Shared header, mobile navigation, footer, buttons, links, code surfaces,
      callouts, and section primitives cover marketing and documentation.
- [x] The design favors editorial hierarchy, code, and meaningful diagrams over
      gradients, glass cards, synthetic imagery, or generic AI motifs.
- [x] Motion is limited, purposeful, and disabled when reduced motion is
      requested.
- [x] The visual system remains readable on narrow screens and at 200% zoom.

## Tests

- [x] Representative components have focused browser coverage for light, dark,
      mobile, and reduced-motion states.
- [x] Automated accessibility checks find no contrast or focus regressions in
      the shared shell.

## Completion evidence

- `app/theme.css` owns semantic light and dark palettes, typography, spacing,
  radii, borders, code colors, focus color, and one restrained coral accent.
  Fumadocs consumes the same semantic colors as the marketing primitives.
- The provisional relational-grid mark is centralized in
  `components/brand-mark.tsx` and reused at navigation and favicon sizes. The
  product text mark remains driven by provisional site configuration.
- Shared Fumadocs headers and mobile navigation use one layout configuration;
  the footer, buttons, text links, sections, code surfaces, callouts, and brand
  are reusable components rather than page-local styles.
- The visual language uses solid surfaces, crisp borders, code, and an offset
  accent shadow. It contains no generated image, decorative gradient field,
  glass card, or synthetic product motif.
- `yarn website:typecheck`, `yarn website:lint`, and `yarn website:build` pass.
  The focused Playwright suite passes four tests across light, dark, 375- and
  320-CSS-pixel layouts, reduced motion, shared shell visibility, and Axe WCAG
  A/AA analysis with no reported violations.

## Out of scope

- A final product name, trademark work, a full illustration library, generated
  artwork, video, or multiple interchangeable themes.
