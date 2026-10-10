# ADR-0201: Application-bound results expose plugin model commands directly

- Status: superseded
- Superseded by: ADR-0310
- Date: 2026-08-19
- Refines: ADR-0153, ADR-0192, ADR-0197, ADR-0198
- Depends on: ADR-0192, ADR-0197, ADR-0198

## Context

ADR-0192 placed application-conditional model commands on an explicit model
handle so plugins never mutate an exported schema class or its prototype. The
resulting safe path is unnecessarily ceremonial for the ordinary case:

```ts
const Post = ultimabase.schema(PostSchema)
const post = await Post.findOne({ where: { id: postId } })

await Post.for(post).publish.execute({ reason: 'Approved' })
```

Most applications own one configured Runtime and expect a model returned by
that Runtime to expose the commands installed for that exact application. Rare
multi-application or repeated-plugin-instance configurations remain important
isolation tests, but they should not impose repeated binding syntax on the
common path.

## Decision

### Runtime results carry a transparent application view

When a schema operation executes through an explicit or active `UltimaBase`,
Core wraps every returned schema model in an immutable application-owned Proxy.
The Proxy targets the original model, preserves its trusted private identity,
and exposes the model commands compiled for the exact schema surface:

```ts
const post = await PostSchema.findOne({ where: { id: postId } }, { ultimabase })

await post.publish({ reason: 'Approved' })
```

The same behavior applies to the application schema handle, which already
supplies its owning facade:

```ts
const Post = ultimabase.schema(PostSchema)
const post = await Post.findOne({ where: { id: postId } })

await post.publish({ reason: 'Approved' })
```

Direct generated command properties are functions from the declared operation
input to its validated asynchronous result. The explicit dynamic API remains
available through `Post.for(post).command(name).execute(input)` and the
operation token remains available through `ultimabase.operation(token)`.

### Isolation remains application-local

Core does not mutate `PostSchema`, its prototype, or the underlying model. Each
application caches its own view for one model identity. Reusing the same schema
or model in another application produces a distinct view with that
application's commands. Two explicit instances still participate in the normal
surface conflict rules; commands never select an instance by last writer wins.

The Proxy remains an instance of the schema class, is immutable when the model
is immutable, preserves `get()`, `toJSON()`, relation fields, pointer and
protected identity behavior, and cannot execute after its owning application is
disposed. Root models returned by built-in schema and model commands retain the
same application binding. Core does not replace frozen relation-field values on
property access; independently queried related models receive their own view.

### Typegen describes the selected application's model result surface

The generated application registry already records every operation and model
command alias. Core derives callable result properties from those inert facts;
Typegen emits no wrapper or executable client. JavaScript receives the same
runtime Proxy without Typegen and may use the explicit dynamic handle when a
name is not statically known.

Model command names must not collide with visible fields, built-in model
commands, application-view controls, or another compiled contribution. Such a
collision fails during static application compilation before setup.

## Consequences

- The common plugin DX is `await post.publish(input)`.
- Application and plugin-instance isolation no longer leaks into ordinary call
  sites.
- `Post.for(post)` remains the explicit dynamic and inspection surface rather
  than the required execution path.
- Models remain immutable values and do not gain dirty tracking, a mutable
  Active Record connection, or process-global plugin methods.
- Generated declarations remain application-specific and replaceable while
  JavaScript executes the same Runtime graph.

## Non-goals

- Mutating exported schema classes or model prototypes.
- Selecting a process-global default application.
- Making detached `toJSON()` output executable.
- Hiding application ownership for models constructed outside Runtime.
- Preserving `.publish.execute(input)` on generated direct model properties;
  the canonical direct property is callable, while `.command(name).execute()`
  is the explicit handle API.
