# ADR-0230: Plugin-field wire protocols have canonical identities

- Status: accepted
- Date: 2026-09-05
- Refines: ADR-0193, ADR-0229
- Depends on: ADR-0190, ADR-0229

## Context

ADR-0229 binds each plugin-field wire codec to an exact nominal protocol
object. That works when a field owner may import the transport package, but the
official ACL field proves that import is not always legal: ACL must remain
independent of REST while a REST-exposed ACL schema must still have an exact
codec for its implicit `acl` field.

Comparing newly allocated protocol objects would make two independent packages
miss each other. Moving REST into Core, making ACL depend on REST, teaching REST
about ACL, or falling back to the ACL storage codec would each violate an
accepted dependency or representation boundary.

## Decision

Core exposes `definePluginFieldWireProtocol({ name, version })`. It validates a
namespaced name and exact semantic version, then returns the one immutable
process-canonical object for that pair. Plugin-field codecs accept only an
identity produced by this factory.

A transport and a field owner can therefore declare the same protocol
compatibility without importing one another. Lookup remains an object-identity
comparison after construction; codec callbacks remain attached privately to
the exact field definition. There is no application registry, dynamic
contribution, provider lookup, or Runtime behavior.

REST v1 and the ACL field both declare `ultimabase.rest@1.0.0`. ACL reuses its
strict public JSON representation for that explicit wire codec, while its
storage codec remains a separate declaration.

## Consequences

- Field packages keep their dependency direction toward Core and shared
  foundations.
- Independently loaded field and transport packages agree on one nominal
  protocol identity by exact name and version.
- A field owner must still opt in explicitly and provide both codec functions;
  canonical identity never creates or guesses a codec.
- Protocol names and versions become public compatibility identifiers.

## Non-goals

- A mutable or application-scoped codec registry.
- Automatic conversion from a storage codec.
- Making Core aware of REST, ACL, or another concrete transport.
- Allowing structural protocol objects that bypass the canonical factory.
