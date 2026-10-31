// Defaults that read the caller (D-53) and unique indexes as `findUnique`
// targets (D-52). `tsc` fails if one does not hold.
import { defineModel } from '../index.ts'
import { User } from './user.ts'

export const Article = defineModel({
	name: 'Article',
	fields: (f) => ({
		// The author is whoever creates the article, or none.
		author: f.one(() => User, {
			default: ({ caller }) =>
				caller.kind === 'user' ? caller.user : undefined,
		}),
		slug: f.string(),
		title: f.string(),
		lang: f.string({ default: 'en' }),
		publishedAt: f.dateTime({ default: () => new Date() }),
		draftedBy: f.string({
			default: ({ caller }) => (caller.kind === 'user' ? caller.user.id : ''),
		}),
		meta: f.json({ default: ({ caller }) => ({ by: caller.kind }) }),
	}),
	indexes: [
		{ fields: ['author', 'slug'], unique: true },
		{ fields: ['lang', 'title'] },
	],
})

// A field with a default, a relation included, is optional in `create`.
await Article.create({ data: { slug: 'hello', title: 'Hello' } })
// @ts-expect-error -- a field without a default is needed
await Article.create({ data: { slug: 'hello' } })

// The unique index is targeted flat, a relation by its target's id.
await Article.findUnique({ where: { author: 'u1', slug: 'hello' } })
await Article.update({
	where: { author: 'u1', slug: 'hello' },
	data: { title: 'Hello' },
})
await Article.delete({ where: { author: 'u1', slug: 'hello' } })
await Article.findUnique({ where: { id: 'a1' } })

// @ts-expect-error -- every field of the index is needed
await Article.findUnique({ where: { author: 'u1' } })
await Article.findUnique({
	// @ts-expect-error -- no field beyond the index's
	where: { author: 'u1', slug: 'hello', title: 'Hello' },
})
// @ts-expect-error -- a non-unique index is not a target
await Article.findUnique({ where: { lang: 'en', title: 'Hello' } })
// @ts-expect-error -- a relation is targeted by its id
await Article.findUnique({ where: { author: { id: 'u1' }, slug: 'hello' } })

export const Refused = defineModel({
	name: 'Refused',
	fields: (f) => ({
		slug: f.string(),
		tags: f.many(() => Article),
		// @ts-expect-error -- a default returns the field's type
		views: f.number({ default: ({ caller }) => caller.kind }),
		// @ts-expect-error -- a relation's default is the target's `{ id }`
		owner: f.one(() => User, { default: () => 'u1' }),
	}),
	indexes: [
		// @ts-expect-error -- 'sluug' is not a field
		{ fields: ['slug', 'sluug'], unique: true },
		// @ts-expect-error -- a many relation has no column
		{ fields: ['tags'] },
		// The kernel's fields, in a non-unique index (D-174).
		{ fields: ['slug', 'createdAt', 'id'] },
		{ fields: ['updatedAt'] },
		// @ts-expect-error -- a unique index cannot name them
		{ fields: ['slug', 'createdAt'], unique: true },
	],
})
