// The query subset of the first release beyond the basics (D-20): `findFirst`,
// `cursor`, and `connect` with `disconnect` on both kinds of relation. `tsc`
// fails if one does not hold.
import { Article } from './defaults-indexes.ts'
import { Post } from './post.ts'

type Equal<A, B> =
	// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- the test needs a free `T`
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false
type Expect<T extends true> = T

// `findFirst` takes `findMany`'s arguments and returns one row or `null`.
const first = await Post.findFirst({
	where: { status: 'published' },
	orderBy: { createdAt: 'desc' },
	select: { title: true },
})

// A cursor is a unique target: `id`, a unique field or a unique index.
await Post.findMany({ cursor: { id: 'p9' }, skip: 1, take: 20 })
await Article.findMany({ cursor: { author: 'u1', slug: 'hello' }, take: 20 })
// A nested list pages the same way, as a Relay connection does (D-41).
await Post.findMany({
	include: { tags: { cursor: { label: 'news' }, take: 10 } },
})

// @ts-expect-error -- a cursor is a unique target
await Post.findMany({ cursor: { title: 'Hello' } })
// @ts-expect-error -- a non-unique index is not a cursor
await Article.findMany({ cursor: { lang: 'en', title: 'Hello' } })

// An optional pointer is unset with `disconnect: true`.
await Post.update({
	where: { id: 'p1' },
	data: { reviewer: { disconnect: true } },
})
await Post.update({
	where: { id: 'p1' },
	data: { reviewer: { connect: { id: 'u2' } } },
})
await Post.update({
	where: { id: 'p1' },
	// @ts-expect-error -- a required pointer cannot be unset
	data: { author: { disconnect: true } },
})
// @ts-expect-error -- a pointer is unset with `disconnect`, not `null`
await Post.update({ where: { id: 'p1' }, data: { reviewer: null } })
// @ts-expect-error -- a new record has nothing to disconnect
await Post.create({ data: { title: 'x', reviewer: { disconnect: true } } })

// A list connects and disconnects records by id.
await Post.update({
	where: { id: 'p1' },
	data: { tags: { connect: [{ id: 't1' }], disconnect: [{ id: 't2' }] } },
})
await Post.create({
	// @ts-expect-error -- a new record has nothing to disconnect
	data: { title: 'x', tags: { disconnect: [{ id: 't2' }] } },
})
await Post.update({
	where: { id: 'p1' },
	// @ts-expect-error -- `disconect` is not a key here
	data: { tags: { disconect: [{ id: 't2' }] } },
})

export type QueryChecks = [
	Expect<Equal<typeof first, { readonly title: string } | null>>,
]
