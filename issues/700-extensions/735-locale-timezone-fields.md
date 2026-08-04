# 735: Add locale and timezone fields

- Status: planned
- Milestone: 7+
- Packages: future `@ultimabase/standard-fields-plugin`
- Depends on: 730
- ADR: none

## Goal

Add `localeField` for BCP 47 language tags and `timezoneField` for IANA time-zone
identifiers, both backed by native string storage.

## Acceptance criteria

- [ ] Locale validation follows BCP 47 semantics instead of accepting arbitrary language strings.
- [ ] Time-zone validation uses the Node internationalization data available to the application.
- [ ] Canonicalization is explicit and deterministic across supported Node versions.
- [ ] Validation results do not depend on the host's current locale or time zone.
- [ ] GraphQL and database fallbacks remain native strings.

## Tests

- [ ] Runtime tests cover canonical, aliased, malformed, and unsupported identifiers.
- [ ] Compile-time tests cover normalization options and inherited string metadata.

## Out of scope

- Time-zone conversion, localized labels, and daylight-saving calculations.
