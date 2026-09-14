# 2816: Publish the curated API reference

- Status: completed
- Milestone: 28
- Packages: `apps/website`, publishable packages
- Depends on: 2807, 2808, 2809, 2810, 2811, 2812, 2813
- ADR: none

## Goal

Provide a navigable first public reference for stable entry points and options
without presenting internal or incomplete generated output as product truth.

## Acceptance criteria

- [x] Reference covers application configuration, Schema, field builders,
      immutable models, Query, request context, transactions, framework errors,
      plugin manifests, official plugin options, and public package entry points.
- [x] Each page records package import, signature or option shape, defaults,
      return or error behavior, release status, and links to relevant concepts
      and guides.
- [x] The public package inventory classifies Core, authoring, tooling,
      transport, database, security, explorer, and testing packages without
      documenting deep imports.
- [x] Experimental and pre-release surfaces are visibly distinguished from
      general framework contracts.
- [x] Any extraction from declarations is deterministic and supplemental;
      developer declarations and compiled application behavior remain Runtime
      truth.
- [x] A separate proposal is required before adopting exhaustive TypeDoc-style
      generation or widening public exports for documentation convenience.

## Tests

- [x] Representative signatures and option defaults are checked against source
      and built public package exports.
- [x] Package inventory validation finds undocumented additions, stale package
      names, and deep-import examples.

## Out of scope

- Private symbols, exhaustive generated prose, source-browser replacement,
  compatibility promises beyond the current release channel, or API redesign.
