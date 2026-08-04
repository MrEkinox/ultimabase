# ADR-0079: PostgreSQL primitive schema compilation

- Status: accepted
- Date: 2026-08-01
- Extends: ADR-0007, ADR-0014, ADR-0021, ADR-0026, ADR-0028, ADR-0038

## Decision

`@ultimabase/postgres-plugin` compiles each static schema into an application-scoped,
private Drizzle table catalog during plugin setup. The package uses these
physical mappings:

| Schema field                           | PostgreSQL storage                                       |
| -------------------------------------- | -------------------------------------------------------- |
| `string`, `enum`                       | `text`                                                   |
| `int`                                  | `bigint` in JavaScript number mode                       |
| `bigint`                               | `bigint` in native bigint mode                           |
| `float`                                | `double precision`                                       |
| `decimal`                              | `numeric` with declared precision and scale              |
| `boolean`                              | `boolean`                                                |
| `binary`                               | `bytea`                                                  |
| `uuid`                                 | `uuid`                                                   |
| `date`                                 | `date`                                                   |
| `time`                                 | `time` or `timetz`, with millisecond precision           |
| `dateTime`                             | `timestamp` or `timestamptz`, with millisecond precision |
| `json`, `object`, and every list depth | `jsonb`                                                  |

Enum values remain explicit Drizzle column metadata while Runtime owns value
membership validation. This avoids PostgreSQL enum-type lifecycle coupling;
an adapter-specific extension may introduce native enum types later.

Runtime-generated defaults, temporal `autoNow`, UUID v7 identifiers, and
system timestamps do not become database clock or UUID expressions. The
compiler retains generation metadata for later adapter stages. It writes only
static defaults to Drizzle metadata and never executes a developer factory.
Integer `autoIncrement` uses a by-default identity column and cannot be mixed
with a declared default or list storage.

Required fields and fields guaranteed by a default or framework generation are
physically `NOT NULL`. An optional non-null logical field remains SQL-nullable
because SQL `NULL` represents property absence; the row decoder will omit that
property rather than expose `null`. Explicitly nullable logical fields also use
nullable columns.

JSONB values use a schema-guided adapter codec. Temporal ISO strings and exact
decimal strings remain unchanged, nested native bigints use decimal strings,
and nested bytes use Base64. Decoding restores the logical native values and
rejects undeclared object properties or malformed representations. Nested
indexes are rejected during setup until a PostgreSQL extension explicitly
claims them.

## Consequences

Schema remains storage-neutral and Drizzle stays private to the PostgreSQL
package. Query, introspection, synchronization, and CRUD stages can reuse one
compiled table identity instead of rebuilding columns independently.

Compilation performs no database mutation. PostgreSQL introspection and direct
schema policies own real DDL in issues 511 and 512, preventing a second
temporary DDL renderer from becoming maintenance surface.
