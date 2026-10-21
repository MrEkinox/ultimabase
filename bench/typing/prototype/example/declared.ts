// Field rules that declare the record fields they read (D-44).
import { anyOf, defineModel } from '../index.ts'
import { hasRole } from './post.ts'

export const Declared = defineModel({
	name: 'Declared',
	fields: (f) => ({
		status: f.enumOf(['draft', 'published']),
		views: f.number(),
		bio: f.string({ optional: true }),
		// The fields the rules read, with the model's types; system fields too.
		a: f.string().with<{
			status: 'draft' | 'published'
			bio: string | null
			createdAt: Date
		}>({
			access: {
				read: ({ record }) => record.status === 'published',
				update: anyOf(
					({ record }) => record.bio !== null,
					({ record }) => record.createdAt.getTime() > 0,
					hasRole('editor'),
				),
			},
		}),
		b: f.string().with<{ status: 'draft' | 'published'; views: number }>({
			access: {
				// @ts-expect-error: `status` is 'draft' | 'published'.
				read: ({ record }) => record.status === 'archived',
				// @ts-expect-error: `views` is a number.
				update: ({ record }) => record.views === 'x',
			},
		}),
		c: f.string().with<{ status: 'draft' | 'published' }>({
			// @ts-expect-error: `views` is not declared.
			access: { read: ({ record }) => record.views > 0 },
		}),
		d: f.string().with<{ views: number }>({
			access: {
				write: anyOf(
					(facts) =>
						// @ts-expect-error: `views` is a number.
						facts.operation === 'update' && facts.record.views === 'x',
				),
			},
		}),
		e: f.string().with<{ views: number }>({
			// @ts-expect-error: a rule returns a boolean.
			access: { read: () => 'yes' },
		}),
		// @ts-expect-error: 'statuss' is not a scalar field of the model.
		f: f.string().with<{ statuss: string }>({
			access: { read: ({ record }) => record.statuss === 'x' },
		}),
		// @ts-expect-error: 'views' does not have the model's exact type.
		g: f.string().with<{ views: string }>({
			access: { read: ({ record }) => record.views === 'x' },
		}),
		// @ts-expect-error: a wider type would let `'publshed'` through.
		i: f.string().with<{ status: string }>({
			access: { read: ({ record }) => record.status === 'publshed' },
		}),
		// @ts-expect-error: a narrower type is not the model's either.
		j: f.string().with<{ status: 'draft' }>({
			access: { read: ({ record }) => record.status === 'draft' },
		}),
		// @ts-expect-error: an optional key is not the model's type.
		k: f.string().with<{ views?: number }>({
			access: { read: ({ record }) => (record.views ?? 0) > 0 },
		}),
		// @ts-expect-error: 'bio' is optional, so its type is `string | null`.
		h: f.string().with<{ bio: string }>({
			access: { read: ({ record }) => record.bio.length > 0 },
		}),
	}),
})
