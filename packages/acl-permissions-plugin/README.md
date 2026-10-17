# @ultimabase/acl-permissions-plugin

Official per-row access control lists: `acl: true` in `define` adds an ACL field
whose grants narrow reads and writes, shared atomically with `grant` and
`revoke`.

## Installation

```sh
npm install @ultimabase/acl-permissions-plugin @ultimabase/core
```

`@ultimabase/core` is a peer dependency. The application also needs a database
plugin that supports the ACL field, such as `@ultimabase/postgres-plugin`.

## Example

Sharing a row, from the tested [`examples/acl`](../../examples/acl/README.md)
application:

<!-- region ../../examples/acl/src/sharing.ts#share -->

```ts
/** Lets one member read the note, without reading its ACL first. */
export const shareNote = (noteId: string, memberId: string) =>
	Note.updateOne({
		where: { id: noteId },
		data: {
			acl: {
				grant: { principal: Member.pointer(memberId), permissions: ['read'] },
			},
		},
	})

/** Removes every right the member holds on the note. */
export const unshareNote = (noteId: string, memberId: string) =>
	Note.updateOne({
		where: { id: noteId },
		data: { acl: { revoke: { principal: Member.pointer(memberId) } } },
	})
```

<!-- endregion -->

## Documentation

- [ACL Permissions](../../apps/website/content/docs/1.0.0/plugins/official/acl-permissions.mdx)
- [Features and Rules](../../apps/website/content/docs/1.0.0/plugins/build-a-plugin/features-and-rules.mdx)
