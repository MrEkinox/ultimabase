# ADR-0018: Default value boundaries

- Status: accepted
- Date: 2026-07-30

## Decision

Field defaults have three explicit forms:

- a static value is provided directly;
- an arrow function represents a runtime factory;
- `DatabaseDefault` carries a named, adapter-owned database expression.

Runtime factories are zero-argument functions. Schema stores but never executes
them. Runtime later invokes one factory per created object, while database
adapters compile or apply database defaults.

Every function supplied as `default` is always a runtime factory. Function-valued
static defaults are not supported. Composite-field typing checks callable
defaults by their return value before considering structured static values.

## Consequences

Static and runtime defaults both retain the shortest syntax. Runtime behavior
and database expressions remain distinguishable without PostgreSQL or Drizzle
entering Schema.

Adapter plugins compose `DatabaseDefault` instances rather than subclassing
Schema types. Unsupported database-default names fail during adapter setup.
