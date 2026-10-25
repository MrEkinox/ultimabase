// Field validation with a Standard Schema or a function (D-23), and `json`
// typed by its schema (D-53). `tsc` fails if one does not hold.
import { z } from 'zod'
import { defineModel } from '../index.ts'

type Equal<A, B> =
	// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- the test needs a free `T`
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false
type Expect<T extends true> = T

const Settings = z.object({
	theme: z.enum(['light', 'dark']),
	size: z.number().default(12),
})
declare function parseTags(value: unknown): readonly string[]

export const Profile = defineModel({
	name: 'Profile',
	fields: (f) => ({
		// A schema may transform: its output is stored (D-23).
		name: f.string({ validate: z.string().trim().min(1) }),
		// A function returns the value to store and throws to refuse it.
		slug: f.string({ validate: (value) => value.toLowerCase() }),
		age: f.number({ optional: true, validate: z.number().int() }),
		// The schema's output is read, its input is written: `size` has a
		// default, so it is optional in `create` and present in a record.
		settings: f.json({ validate: Settings, default: { theme: 'light' } }).with({
			access: {
				update: ({ value }) => value.size === undefined || value.size > 8,
			},
		}),
		tags: f.json({ validate: parseTags }),
		extra: f.json({ optional: true }),
	}),
})

const profile = await Profile.findUnique({ where: { id: 'p1' } })
type Stored = NonNullable<typeof profile>
type Data = Parameters<typeof Profile.create>[0]['data']

export type ValidationChecks = [
	Expect<Equal<Stored['name'], string>>,
	Expect<Equal<Stored['age'], number | null>>,
	Expect<Equal<Stored['settings'], { theme: 'light' | 'dark'; size: number }>>,
	Expect<Equal<Stored['tags'], readonly string[]>>,
	Expect<Equal<Stored['extra'], unknown>>,
	Expect<
		Equal<
			Data['settings'],
			{ theme: 'light' | 'dark'; size?: number | undefined } | undefined
		>
	>,
]

await Profile.create({
	data: { name: 'Ada', slug: 'ada', tags: ['a'], settings: { theme: 'dark' } },
})
// A json field is not sorted, with or without `.with` (D-94).
await Profile.findMany({ orderBy: { name: 'asc', age: 'desc' } })
// @ts-expect-error: a json field cannot be sorted.
await Profile.findMany({ orderBy: { settings: 'asc' } })
// @ts-expect-error: nor one without a schema.
await Profile.findMany({ orderBy: [{ name: 'asc' }, { extra: 'desc' }] })
await Profile.create({
	data: {
		name: 'Ada',
		slug: 'ada',
		tags: ['a'],
		// @ts-expect-error: `theme` is 'light' or 'dark'.
		settings: { theme: 'blue' },
	},
})

defineModel({
	name: 'Wrong',
	fields: (f) => ({
		// @ts-expect-error: a string field takes a schema of strings.
		count: f.string({ validate: z.number() }),
		// @ts-expect-error: the schema must accept every string.
		kind: f.string({ validate: z.enum(['a', 'b']) }),
		// @ts-expect-error: a schema typed `any` would hide the field's type.
		loose: f.string({ validate: z.any() }),
		// @ts-expect-error: the function takes the field's value.
		size: f.number({ validate: (value: string) => value.length }),
		// @ts-expect-error: the default is the schema's input.
		mode: f.json({ validate: Settings, default: { theme: 'blue' } }),
		// @ts-expect-error: a json schema typed `any` is refused too.
		blob: f.json({ validate: z.any() }),
	}),
})
