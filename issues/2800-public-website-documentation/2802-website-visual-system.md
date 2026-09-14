# 2802: Establish the provisional visual system

- Status: planned
- Milestone: 28
- Packages: `apps/website`
- Depends on: 2801
- ADR: none

## Goal

Give the website a coherent, replaceable visual identity that feels specific to
the product without requiring a final name, logo, or brand deliverable.

## Acceptance criteria

- [ ] Typography, spacing, radii, borders, semantic colors, light mode, dark
      mode, and one restrained accent are expressed through shared tokens.
- [ ] A provisional text mark and small geometric symbol work at navigation and
      favicon sizes and can be replaced from one component boundary.
- [ ] Shared header, mobile navigation, footer, buttons, links, code surfaces,
      callouts, and section primitives cover marketing and documentation.
- [ ] The design favors editorial hierarchy, code, and meaningful diagrams over
      gradients, glass cards, synthetic imagery, or generic AI motifs.
- [ ] Motion is limited, purposeful, and disabled when reduced motion is
      requested.
- [ ] The visual system remains readable on narrow screens and at 200% zoom.

## Tests

- [ ] Representative components have focused browser coverage for light, dark,
      mobile, and reduced-motion states.
- [ ] Automated accessibility checks find no contrast or focus regressions in
      the shared shell.

## Out of scope

- A final product name, trademark work, a full illustration library, generated
  artwork, video, or multiple interchangeable themes.
