# 731: Add email fields

- Status: planned
- Milestone: 7+
- Packages: future `@ultimabase/standard-fields-plugin`
- Depends on: 730
- ADR: none

## Goal

Add an `emailField` derived from `stringField` with robust, configurable email
validation and no implicit destructive normalization.

## Acceptance criteria

- [ ] The logical kind is namespaced and lowers to the native string representation.
- [ ] Validation uses `validator` rather than a custom email regular expression.
- [ ] Public options cover deliberate behavior such as display names and domain requirements without leaking library types.
- [ ] Case conversion or canonicalization occurs only through an explicit option.
- [ ] Lists, defaults, indexes, descriptions, and native field Access remain composable.

## Tests

- [ ] Runtime tests cover accepted addresses, malformed input, Unicode, and configured restrictions.
- [ ] Compile-time tests cover exact options and inherited string value shapes.

## Out of scope

- Deliverability checks, DNS queries, and email verification workflows.
