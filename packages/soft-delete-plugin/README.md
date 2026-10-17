# @ultimabase/soft-delete-plugin

Official soft delete: `softDelete` in `define` turns deletes into tombstones or
adds soft-delete commands, with restore, purge and `readDeleted` reads.

## Installation

```sh
npm install @ultimabase/soft-delete-plugin @ultimabase/core
```

`@ultimabase/core` is a peer dependency. The application also needs a database
plugin; Access, REST, GraphQL and Hooks are optional integrations.

## Example

Soft-delete, restore and purge a post, from the tested
[`examples/soft-delete`](../../examples/soft-delete/README.md) application:

<!-- region ../../examples/soft-delete/tests/lifecycle.test.ts#soft-delete,restore,purge -->

```ts
const post = await Post.createOne({ data: { title: 'Draft announcement' } })

// In the default mode, the native delete writes a tombstone.
const deleted = await Post.deleteOne({
	where: { id: post.id },
	select: { title: true, isDeleted: true, deletedAt: true },
})

const visible = await Post.findOne({ where: { id: { eq: post.id } } })

const restored = await Post.restoreOne({
	id: post.id,
	select: { title: true, isDeleted: true, deletedAt: true },
})

await Post.deleteOne({ where: { id: post.id } })

const purged = await Post.purgeOne(
	{ id: post.id, select: { title: true, isDeleted: true } },
	{ useMasterKey: true },
)
```

<!-- endregion -->

## Documentation

- [Soft Delete](../../apps/website/content/docs/1.0.0/plugins/official/soft-delete.mdx)
- [Delete Records](../../apps/website/content/docs/1.0.0/core/writing-data/delete.mdx)
