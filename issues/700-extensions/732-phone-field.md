# 732: Add phone fields

- Status: planned
- Milestone: 7+
- Packages: standard-fields
- Depends on: 730
- ADR: none

## Goal

Add a `phoneField` derived from `stringField` with international parsing,
validation, and explicit E.164 normalization.

## Acceptance criteria

- [ ] Validation and parsing use `libphonenumber-js` with its native TypeScript contracts.
- [ ] The developer can require international input or provide an explicit default country.
- [ ] E.164 normalization is configurable and never silently depends on process locale.
- [ ] Fixed-line and mobile numbers are distinguishable through deliberate options rather than a mobile-only validator.
- [ ] The stored and inferred value remains a string-compatible portable representation.

## Tests

- [ ] Runtime tests cover international, national, invalid, and non-geographic numbers.
- [ ] Compile-time tests cover country options and inherited string metadata.

## Out of scope

- SMS verification, carrier lookup, and user-interface formatting.
