# ADR-0131: Optional committed event delivery

- Status: accepted
- Date: 2026-08-04
- Refines: ADR-0107, ADR-0127

## Context

Named hook events originally required at least one registered consumer. That
default catches misspelled names and missing infrastructure, but feature
plugins also publish notifications whose observation is intentionally
optional. ACL and Roles had to register internal no-op consumers so ordinary
writes could commit without an audit plugin. Those synthetic contributions
obscured the real application graph and allocated useless post-commit work.

## Decision

Core exposes a trusted adapter-neutral event contract with explicit delivery:

```ts
interface PostCreatedEvent extends JsonObject {
	readonly postId: string
}

const postCreatedEvent = defineEvent<PostCreatedEvent>()('post.created', {
	delivery: 'optional',
})

context.emit(postCreatedEvent, { postId })
```

`delivery: "optional"` permits zero consumers. Runtime still requires an active
transaction and snapshots the portable payload, but when no consumer matches it
returns without creating an event envelope or deferred post-commit effect. One
or more consumers retain deterministic plugin and registration order, detached
payloads, rollback discard, after-commit delivery, independent failure
collection, and recursion protection.

`delivery: "required"` preserves the typed missing-consumer error. Emitting by
legacy string name also remains required, so existing declarations keep their
configuration and typo diagnostics.

Event contracts have trusted factory provenance. A structural object cannot
silence a required event by claiming optional delivery. Core understands only
the generic delivery mode and event name; it does not identify producers such
as ACL, Roles, audit, or realtime.

ACL and Roles keep their existing stable public event-name strings and typed
consumer helpers. Their internal emitters use private optional contracts, and
the plugins register no synthetic consumers.

## Consequences

- Optional feature notifications impose no event-registry or post-commit work
  when unused.
- Required workflows continue failing closed when their consumer is missing.
- Existing `onEvent()` definitions and contribution ordering do not change.
- Event payload typing is available directly at `context.emit()` when a typed
  contract is used.
