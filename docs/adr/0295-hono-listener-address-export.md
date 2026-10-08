# ADR-0295: Export the Hono listener address

- Status: accepted
- Date: 2026-10-08
- Refines: the exports of `@ultimabase/server-hono-plugin`; applies ADR-0288
- Approval: user validated on 2026-10-08

## Context

`honoServerPlugin({ port: 0 })` lets the operating system choose a free port,
which tests and parallel workers need, but the plugin exported nothing, so the
chosen port was unreadable. The plugin's own tests read it through an internal
provider getter that applications cannot reach. Since the port may also come
from `PORT`, application code cannot reliably print where it listens.

## Decision

The plugin exports `HonoServerPluginExports` with one method,
`address(): AddressInfo | undefined`, read through
`ultimabase.plugin(server)`. It mirrors Node's `server.address()` and reuses
Node's `AddressInfo` type instead of a new shape. It returns `undefined` before
start, after stop, and for an existing Hono `app`, whose listener the plugin
does not own. It is a method rather than a value because setup exports exist
before the listener opens.

## Consequences

The public type surface gains `HonoServerPluginExports`, as every other
plugin with exports already does; the server package's export-completion test
lists it. No option, behavior or Core contract changes.
