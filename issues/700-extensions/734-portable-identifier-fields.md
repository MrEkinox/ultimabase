# 734: Add portable identifier fields

- Status: superseded
- Milestone: 7+
- Packages: future `@ultimabase/standard-fields-plugin`
- Depends on: 730
- ADR: none
- Superseded by: 2007

Issue 2007 supersedes these unimplemented factories. Slugs, colors, and
country, currency, or language codes are native strings constrained by Standard
Schema. Rewriting, case conversion, and canonicalization remain explicit input
Hooks. The original proposal remains below as historical context.

## Goal

Add `slugField`, `hexColorField`, `countryCodeField`, `currencyCodeField`, and
`languageCodeField` as portable derived string fields.

## Acceptance criteria

- [ ] Slugs and colors have explicit accepted syntax without automatic rewriting by default.
- [ ] Country codes use ISO 3166-1 with a typed alpha-2 or alpha-3 choice.
- [ ] Currency codes use the officially assigned ISO 4217 set.
- [ ] Language codes use ISO 639-1 and remain distinct from full locale tags.
- [ ] Every factory exposes a namespaced logical kind and stable UltimaBase-owned options.

## Tests

- [ ] Runtime tests cover representative valid, invalid, case, and reserved-code inputs.
- [ ] Compile-time tests cover exact code-format options and inherited metadata.

## Out of scope

- Localized display names and automatic code-list updates outside dependency releases.
