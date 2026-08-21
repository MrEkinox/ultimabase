# 2007: Remove planned validation-only field extensions

- Status: planned
- Milestone: 20
- Packages: repository planning and documentation
- Depends on: 2008
- ADR: decision from issue 2001

## Goal

Remove the planned official derived field package and validation-only field
factories now made redundant by Standard Schema field validation. Developers
compose native UltimaBase fields with their chosen validator instead of adopting
distinct logical kinds for email addresses, URLs, slugs, numeric bounds, or
other string and number formats.

## Acceptance criteria

- [ ] Issues 729 through 736 are marked `superseded`: their unimplemented
      derived-field abstraction, official package, and concrete factories have
      no remaining proven consumer once validation composes with native fields.
- [ ] The planned `@ultimabase/standard-fields-plugin` package and its derived
      field registration contract are removed from the active roadmap and
      issue 725's follow-up list; no empty or compatibility package is created.
- [ ] Email, phone, URL, hostname, IP, slug, color, country, currency,
      language, locale, timezone, port, percentage, positive-number, latitude,
      and longitude constraints are documented as native fields composed with
      a developer-selected Standard Schema validator.
- [ ] Phone parsing and canonicalization, slug rewriting, case conversion,
      locale canonicalization, and similar value changes are documented as
      explicit Hooks `resolveInput` transformations followed by validation,
      never as Standard Schema output adopted by Core.
- [ ] Reusable community packages may publish Standard Schema validators or
      authoring helpers without defining a logical field kind or requiring an
      UltimaBase Runtime plugin.
- [ ] The field-kind guidance states that a new logical kind remains justified
      only by a distinct canonical value, storage representation, Query
      semantics, Runtime snapshot, relationship behavior, or adapter contract.
- [ ] Genuine plugin-defined field kinds continue through the existing public
      field-kind, codec, Query, Runtime, and adapter contracts; this issue does
      not retain a speculative native-field derivation layer for them.
- [ ] Active roadmap, issue indexes, examples, and documentation no longer
      promise validation-only field kinds, derived lowering, or a concrete
      validation dependency owned by UltimaBase.
- [ ] Historical issue bodies remain available with terminal metadata so the
      superseded design is auditable.

## Tests

- [ ] `yarn check:issues` passes after every affected issue status and dependency
      is updated.
- [ ] Focused repository searches find no active promise of the removed package
      or validation-only field factories outside superseded historical issues.
- [ ] Documentation examples typecheck with native fields and Standard Schema
      validators without generated logical field kinds.

## Out of scope

- Removing plugin-defined field kinds whose canonical value, storage, Query,
  Runtime, relationship, or adapter semantics are genuinely distinct.
- Shipping an official validator library or choosing Zod, Valibot, ArkType, or
  another Standard Schema implementation for developers.
- Adding transformation support to the field `validation` contract.
