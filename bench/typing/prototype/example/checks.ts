// Type assertions for the prototype: `tsc` fails if one does not hold.
import type { Caller } from '../index.ts'
import {
	aclPlugin,
	defineApp,
	defineModel,
	graphqlPlugin,
	many,
	memory,
	softDeletePlugin,
	string,
} from '../index.ts'
import { Book } from './book.ts'
import { Post } from './post.ts'
import { Tag } from './tag.ts'
import { User } from './user.ts'

// The usual exact-equality test.
type Equal<A, B> =
	// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- the test needs a free `T`
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false
type Expect<T extends true> = T
declare const caller: Caller

// Queries: scalars without `select`, relations through `select`/`include`.
const posts = await Post.findMany({ where: { title: { startsWith: 'a' } } })
const selected = await Post.findMany({
	where: { author: { is: { email: { equals: 'a@b.c' } } } },
	select: { title: true, author: { select: { email: true } }, tags: true },
})
const included = await User.findMany(
	{
		include: {
			posts: { where: { views: { gt: 10 } }, select: { views: true } },
		},
	},
	{ as: caller },
)
const unique = await Tag.findUnique({ where: { label: 'news' } })

export type Checks = [
	Expect<
		Equal<
			(typeof posts)[number],
			{
				readonly id: string
				readonly createdAt: Date
				readonly updatedAt: Date
			} & {
				readonly title: string
				readonly status: 'draft' | 'published'
				readonly views: number
				readonly pinned: boolean | null
				readonly publishedAt: Date | null
				readonly meta: unknown
			}
		>
	>,
	Expect<
		Equal<
			(typeof selected)[number],
			{
				readonly title: string
				readonly author: { readonly email: string }
				readonly tags: ({
					readonly id: string
					readonly createdAt: Date
					readonly updatedAt: Date
				} & { readonly label: string })[]
			}
		>
	>,
	Expect<
		Equal<(typeof included)[number]['posts'], { readonly views: number }[]>
	>,
	Expect<Equal<NonNullable<typeof unique>['label'], string>>,
]

// @ts-expect-error: a filter value has the field's type.
await Post.findMany({ where: { title: { equals: 42 } } })
// @ts-expect-error: `findUnique` takes `id` or a unique field only.
await Post.findUnique({ where: { title: 'x' } })
// @ts-expect-error: a required field without default is required on create.
await Tag.create({ data: {} })
await Tag.create({ data: { label: 'news' } })

// Field rules without the model's name: `value` and `record.id` typed.
export const Loose = defineModel({
	name: 'Loose',
	fields: {
		a: string().with({
			access: {
				update: ({ record, value }) => {
					const id: string = record.id
					const other: unknown = record.status
					return value.length > id.length && other !== undefined
				},
			},
		}),
		// @ts-expect-error: a rule returns a boolean.
		b: string().with({ access: { update: () => 'yes' } }),
		// @ts-expect-error: `value` is a string.
		c: string().with({ access: { create: ({ value }) => value > 1 } }),
		d: string().with({
			access: { update: anyOfLoose },
		}),
		e: string({ optional: true }).with({
			// @ts-expect-error: an optional field may be written `null`.
			access: { update: ({ value }) => value.length > 0 },
		}),
	},
})
function anyOfLoose(facts: {
	readonly record: { readonly id: string }
}): boolean {
	return facts.record.id !== ''
}

// Model rules: typed from the fields, no annotation needed.
Post.with({
	// @ts-expect-error: `status` is 'draft' | 'published'.
	access: { update: ({ record }) => record.status === 'archived' },
})
// A read rule builds its filter with `where` (D-10): a misspelled key next to
// a valid one is refused on its line, at any depth and through a cycle.
Post.with({
	access: {
		read: ({ where }) =>
			where({
				status: 'published',
				// @ts-expect-error: `titel` is not a field of Post.
				titel: 'x',
			}),
	},
})
Book.with({
	access: {
		read: ({ where }) =>
			where({
				author: {
					is: {
						books: {
							some: {
								pages: { gt: 1 },
								// @ts-expect-error: `titel` is not a field of Book, through Author.
								titel: 'x',
							},
						},
					},
				},
			}),
	},
})
Post.with({
	// @ts-expect-error: a filter written as an object is never checked; it is refused.
	access: { read: () => ({ where: { status: 'published' } }) },
})
// @ts-expect-error: a delete rule returns a boolean.
Post.with({ access: { delete: () => 42 } })
// @ts-expect-error: no plugin the model uses owns this key.
Post.with({ cache: true })
// @ts-expect-error: `ownerField` names a scalar field.
Post.with({ acl: { ownerField: 'author' } })

// An inverse names a field of the target, checked by `defineApp`.
const Broken = defineModel({
	name: 'Broken',
	fields: { posts: many(() => Post, { inverse: 'autor' }) },
})
defineApp({
	database: memory(),
	plugins: [softDeletePlugin(), aclPlugin(), graphqlPlugin()],
	// @ts-expect-error: Broken.posts: inverse 'autor' is not a field of Post.
	models: [Broken, Post, User, Tag],
})
