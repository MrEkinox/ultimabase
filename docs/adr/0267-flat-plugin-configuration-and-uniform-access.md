# ADR-0267: Flat plugin configuration and uniform access

- Status: accepted
- Date: 2026-09-25
- Supersedes: ADR-0003's nested composition, ADR-0045's nested-definition contract, and ADR-0046's recursive normalization
- Refines: ADR-0190's application-local plugin graph, ADR-0203's plugin-owned schemas, and ADR-0255's explicit operation exposure
- Approval: user explicitly accepted points 1-6 and deferred any change to disabled development UI plugins

## Context

UltimaBase exposed several equivalent-looking ways to assemble and reach plugin
behavior. A plugin could be placed at the application root or nested below
another definition, public setup exports were normally recovered through a
string identity, and some official identities did not match their package
names. Custom Password Auth User schemas also appeared only through the
plugin-owned contribution even though developers authored the class themselves.

These choices were individually coherent, but together they made the common
composition path harder to explain than the underlying application graph.

## Decision

An application accepts one flat `plugins` list. Plugin definitions no longer
contain child definitions, normalization is non-recursive, and ordering remains
deterministic through root position plus explicit relationships.

Developers retain a configured definition and use `ultimabase.plugin(definition)`
to obtain its precisely typed setup export. String and structured-identity
lookup remains on the lower-level `FrameworkApplication` surface for dynamic or
diagnostic integrations. The definition overload uses exact object identity, so
a separately created definition with the same manifest identity is not a handle
for the installed plugin.

Official plugin IDs match their package names. In particular, ACL uses
`@ultimabase/acl-permissions-plugin` and Roles uses
`@ultimabase/roles-plugin`. Their event, option, field-kind, and capability
namespaces do not change.

Plugin relationships retain one distinct purpose each:

- `dependencies` requires a compatible plugin and establishes provider-first lifecycle order;
- `optionalDependencies` establishes that order only when the compatible plugin is installed;
- `peers` requires compatible identity without ordering or access;
- capabilities express the versioned behavior actually provided or consumed.

An authorized plugin may now claim an exact schema already present in the
application's root `schemas` list. Claiming assigns the plugin's provenance and
ownership rules without creating a second schema or implicit registration.
Password Auth adds its built-in default User, but claims a developer-defined
User; custom User classes therefore appear in the root schema list while
remaining protected from generated CRUD exposure.

Password Auth exports the immutable `passwordAuthOperationList` as the concise
way to select all four operations. The named `passwordAuthOperations` record
remains the way to select a subset. Transports still require explicit selection.

The current disabled/no-op behavior of GraphiQL and Apollo Sandbox is unchanged.

## Consequences

There is one visible installation path, one typed application-level lookup path,
and one package-aligned identity convention. Plugin authors must replace nested
composition with documented dependencies, peers, or capabilities and consumers
must list every installed definition at the application root.

Custom Password Auth applications must place their User class in `schemas`.
Core rejects a claim when that exact class is absent or when a plugin attempts
to claim its own added schema through both paths.

This decision does not add automatic dependency installation, implicit
transport exposure, a general plugin registry, or replacement behavior for
single-provider capability conflicts.
