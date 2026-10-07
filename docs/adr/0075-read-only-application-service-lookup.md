# ADR-0075: Read-only application service lookup

- Status: accepted
- Date: 2026-08-01
- Refines: ADR-0044, ADR-0050

## Decision

`FrameworkApplication` exposes `getService(token)` and
`getOptionalService(token)` as the only public application-level paths for
framework packages to consume plugin-provided services. Both methods preserve
the service contract carried by the nominal `ServiceToken` and delegate lookup
to the application's private `ServiceRegistry`.

Lookup requires completed plugin setup. It remains available across the ready,
started, stopping, and stopped lifecycle states because stopped applications
retain their setup-owned resources. Lookup fails before setup completes and
after disposal begins.

The application does not expose its service registry, a writable facade, token
enumeration, provider ownership, or registry disposal. Plugins continue to
register services only through the owner-scoped setup context established by
ADR-0048.

## Consequences

Runtime and other framework packages can resolve shared infrastructure through
one typed, application-owned boundary without depending on plugin setup exports
or receiving mutation authority. A required missing dependency retains the
`SERVICE_NOT_FOUND` behavior from ADR-0044, while optional lookup represents
absence as `undefined`.

Using the same token with several applications resolves each application's own
provider, so concurrent applications remain isolated. Registry ownership,
duplicate-provider rules, disposal order, and service lifetime remain unchanged.
