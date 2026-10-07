# ADR-0269: Core-native declarative plugin authoring

- Status: accepted
- Date: 2026-09-25
- Refines: ADR-0190, ADR-0191, ADR-0192, ADR-0259, ADR-0267
- Approval: user authorized a complete authoring-form migration with no feature, option, or capability loss

## Context

Core already compiles one canonical private graph with exact plugin ownership,
privileges, static declarations, application resources, commands, transports,
and Typegen projections. Its public authoring API nevertheless asks a plugin
author to reproduce those internal phases. A configured operation may require a
token, a separate declaration, a capability-wrapped handler, capability-wrapped
transport bindings, manual Typegen-reference registration, synthetic
contribution IDs, and repeated lists.

Plugin Kit reduces parts of that ceremony through `definePluginModule`,
`PluginModuleInstance`, `providePluginOperation`, and `defineTypegenModule`.
Those helpers reveal that foundational Core authoring is not sufficiently
compact on its own. Plugin Kit should provide optional patterns, not repair the
minimum path required to create a well-typed plugin.

## Decision

Core owns the sole canonical plugin factory. The factory binds stable package
identity once, accepts typed configuration, and returns exact configured plugin
instances. Public plugin typing uses a property-based contract instead of the
current long positional `FrameworkPlugin` generic tuple. The factory supports
every existing manifest, relationship, capability, declaration, setup, export,
lifecycle, privilege, claim, and instance feature.

Capability authoring accepts one ordered tuple of nominal provider and
requirement declarations. Each declaration already carries its kind, token,
optionality, phase, contribution identity, and lifetime; Core derives its
normalized provider, required, and optional views. Composition, dependency
ordering, compatibility, materialization, cleanup, and inspection do not
change.

Application operations become first-class owned contributions. One contribution
correlates the operation token with its direct or resource-backed handler and
optional nominal transport bindings. Core derives the private handler and
binding providers, operation declaration, deterministic identities, and
reachable Typegen references. The exact operation owner may still contribute a
binding separately from its handler through a binding-only contribution.
Foreign binding owners remain invalid. Bindings never imply public exposure:
the application must continue to select the exact operation for each transport.

Core derives a contribution identifier when exact owner plus nominal identity
already makes the contribution unique. An explicit identifier remains required
for repeated providers of the same multiple or pipeline capability and for
schema artifacts whose stable semantic identity cannot be derived.

Privilege policy remains explicit and is evaluated before effects. This
migration does not infer authority, weaken reasons, merge privilege meanings,
or make one privilege imply another. Environmental claims remain separate.
Static schema/model declarations that genuinely express distinct authored
facts remain visible; duplicate command and Typegen registration does not.

The internal phase separation remains unchanged. Pure compilation still
precedes application materialization; callbacks, resources, wire codecs,
adapters, grants, and mutable stores never enter inert inspection or Typegen
graphs. The new public form compiles into those existing boundaries rather than
creating a second registry.

## Plugin Kit boundary

Plugin Kit retains higher-level optional composition: event patterns, Standard
Schema option parsing, immutable schema-patch builders, and contextual-field
helpers. Foundational plugin factories, operation provision, package type
references, and registration wrappers move to Core and are removed from Plugin
Kit after official migration. There is no compatibility alias or second
documented import path at milestone completion.

## Preserved behavior

The migration preserves all current plugin identities and instances;
dependencies, optional dependencies, peers and conflicts; privileges, reasons,
claims and diagnostics; capability lifetimes, cardinalities and composition;
declaration ordering and provenance; schemas, fields, options, patches, model
surfaces and private storage; operation and schema-mutation semantics; setup
exports and lifecycle phases; Runtime behavior, constraints and persistence
rewrites; transport planning, codecs and allowlists; Typegen declarations; and
deterministic disposal.

No plugin becomes implicit, no nested plugin composition returns, no generic
registry or service locator is introduced, and Core gains no dependency on a
concrete transport, database, authentication, policy, or server package.

## Migration and verification

Milestone 33 introduces the Core factory, flattens capability input, unifies
operation contributions, derives redundant static facts, migrates every
official plugin and open-kernel example, removes superseded public paths, and
finishes with repository-wide behavior and coverage validation. Temporary
bridges are allowed only between consecutive milestone commits and are not a
compatibility promise.

The final audit compares plugin options and setup exports, privilege reports,
capability inventories, compiled graphs, Typegen output, transport surfaces,
Runtime/E2E behavior, public exports, source lines, and the number of authored
registration steps for representative plugins.
