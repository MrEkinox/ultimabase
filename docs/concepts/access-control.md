# Access control

## Optional official Access

```text
schema operation decision
AND schema row filter
AND schema item decision
AND field decisions
AND optional provider policies
```

`@ultimabase/access-plugin` owns `schema.access`, the generalized class-level
permission API. With `accessPlugin()` configured, it protects singular and
collection reads, counts, existence checks, creates, updates, upserts, deletes,
row visibility, and prepared items.

`field.access.read` controls output, `where`, and `orderBy`. `field.access.write`
controls supplied create values and the update transitions `fill`, `replace`,
and `clear`; relation fields instead authorize their typed change. Forbidden
columns are not selected. Explicit forbidden field use returns a typed error.

Every independent declaration and provider contribution combines monotonically
through logical `AND`; no later policy can broaden an earlier restriction.
Without `accessPlugin()`, `access` is an unknown schema or field option and
ordinary direct CRUD has no official Access policy stage.

## ACL

ACL is an optional independent persisted per-object policy. It grants object
operations to anonymous or plugin-provided subjects and contributes protected
row, item, and field restrictions without depending on or overriding official
Access.

One immutable ACL may grant `read`, `update`, and `delete` to public access,
any authenticated principal, exact schema-qualified principal Pointers, and
schema-qualified roles within configured entry limits. Symmetric grant, revoke,
replace, and inspection methods never perform persistence or subject resolution.

ACL values expose a versioned detached `toJSON()` document and strict
`ACL.fromJSON(unknown)` reconstruction. PostgreSQL stores an adapter-owned JSONB
representation directly on each protected row and indexes it with GIN, so ACL
filtering adds no ACL-table join.

Subject-owning providers choose deletion policy. They discover ACL through
Core's neutral reference-cleanup contributions: `fail` inspects exact
references, `preserve` leaves inert entries untouched, and master-only
`cascade` removes only the deleted subject from matching ACL rows. Discovery,
singular cleanup updates, and subject deletion share one transaction, so a
failure in any protected schema rolls back the entire operation.

## Roles

Role schemas have UUIDs, unique normalized names, developer-defined fields,
exact member schemas, and role members. Nested membership cycles are rejected.
Authentication may provide one exact current-principal Pointer and roles may
provide membership through separate neutral Core capabilities. Installing either
provider grants no operation by itself, and ACL imports neither concrete
package. Principal resolution returns `undefined` when its optional provider or
request-local identity is absent, and rejects forged or foreign-application
Pointers before a policy consumes them.

ACL accepts role UUID or name references, but persistence resolves and stores the UUID.

Referenced-role deletion supports `fail`, `preserve`, and `cascade`; the default is `fail`.

The direct `acl` option is valid on a developer-defined RoleSchema. Normal RoleSchema Access
still controls creation, while per-role ACL rights may narrow reads, updates,
membership or hierarchy mutations, and deletion. Only master may inspect or
replace the role row's ACL value. Internal role membership resolution uses its
existing trusted provider boundary so evaluating a role grant never recurses
through the ACL protecting that RoleSchema row.

## ACL input

Create and update accept the same immutable `ACL` value. The direct `acl` schema
option accepts one static or asynchronous default and one shared
`resolveInput` callback for both operations. A default factory receives the
field-resolved create candidate, optional current principal, and operation
context, so it may derive object grants from the data being inserted. The
complete row is revalidated before protected policy evaluation. Only trusted
master execution may supply, inspect, or replace an ACL value. An ordinary
object `update` grant never grants control over its ACL.

Master is trusted execution authority rather than an ACL subject. It bypasses
ACL authorization but not validation, default generation, installed Runtime
behavior, transactions, database constraints, or audit events.

`aclPlugin()` defaults each ACL to at most 100 exact principals and 50 roles.
Applications may change those defaults through plugin options, while the
schema-local `acl: { limits }` option overrides either value and inherits
omitted values. Limits count canonical subject entries after duplicate grants are
merged. Public and authenticated rights consume no subject entry, and every
create or update path—including master execution—is checked before persistence.

## ACL change events

`onACLChange(handler)` creates a typed consumer for the committed
`ultimabase.acl.changed` event. Its immutable payload identifies the actor and
target and groups rights added or removed for every ACL subject kind. Default
generation, explicit master writes, updates, bulk creates, and cascade cleanup
all use the same contract. Equivalent ACL replacements are ignored, and an
outer transaction rollback discards every queued event.

The event is optional audit infrastructure rather than authorization. ACL
checks happen earlier through its generic protected policy, and no realtime or
transport integration exposes the event unless an application explicitly adds
a consumer.
