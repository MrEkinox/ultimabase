// What `defineModel`, the field builders and schema resolution refuse at
// startup, and the stored names they keep (D-37, D-63).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineApp, defineModel, master, memory, Refused } from './index.ts'
import { resolve } from './schema.ts'
import { uuidv7 } from './uuid.ts'

/** Calls `defineModel` with a definition its types would refuse. */
const untyped = (definition: object): void => {
	Reflect.apply(defineModel, undefined, [definition])
}

/** Builds an enum field from values its types would refuse. */
const enumOf = (values: readonly unknown[] | undefined): void => {
	untyped({
		name: 'Note',
		fields: (f: {
			enumOf: (list: readonly unknown[] | undefined) => object
		}) => ({
			level: f.enumOf(values),
		}),
	})
}

const Writer = defineModel({
	name: 'Writer',
	fields: (f) => ({ essays: f.many(() => Essay, { inverse: 'writer' }) }),
})
const Essay = defineModel({
	name: 'Essay',
	fields: (f) => ({ writer: f.one(() => Writer) }),
})

const fieldsOf = (values: readonly unknown[], model: string) =>
	resolve(values).schema.models.find((each) => each.name === model)

/** Resolves a self-relation with an index on `field`. */
const index = (field: string) => () => {
	const Shelf: unknown = Reflect.apply(defineModel, undefined, [
		{
			name: 'Shelf',
			fields: (f: {
				one: (target: () => unknown, options: object) => object
				many: (target: () => unknown, options: object) => object
			}) => ({
				parent: f.one(() => Shelf, { optional: true }),
				children: f.many(() => Shelf, { inverse: 'parent' }),
			}),
			indexes: [{ fields: [field] }],
		},
	])
	resolve([Shelf])
}

/** Resolves a model with `indexes`, which its types refuse (D-141). */
const containsIndexes = (indexes: readonly object[]) => () => {
	const Bad = defineModel({
		name: 'Bad',
		fields: (f) => ({
			title: f.string(),
			pages: f.number(),
			tags: f.string({ list: true }),
		}),
		// @ts-expect-error: refused by its types too.
		indexes,
	})
	resolve([Bad])
}

const nameless = (): void => {
	untyped({ name: '', fields: () => ({}) })
}

describe('defineModel', () => {
	it('needs a name, a string dbName and an object of fields', () => {
		expect(() => untyped({ name: '', fields: () => ({}) })).toThrow(
			'defineModel takes a name.',
		)
		expect(() =>
			untyped({ name: 'Note', dbName: 3, fields: () => ({}) }),
		).toThrow('Note: dbName must be a string.')
		expect(() => untyped({ name: 'Note', fields: () => null })).toThrow(
			'Note: fields must return an object of fields.',
		)
		expect(() =>
			untyped({ name: 'Note', fields: () => ({ text: 'string' }) }),
		).toThrow('Note.text is not a field a builder returned.')
	})

	it('refuses a definition that names its fault, and errs otherwise (D-119)', () => {
		expect(() =>
			untyped({ name: 'Note', dbName: 3, fields: () => ({}) }),
		).toThrow(Refused)
		const Loop = defineModel({
			name: 'Loop',
			fields: (f) => ({ parent: f.one(() => Loop, { inverse: 'parent' }) }),
		})
		expect(() => resolve([Loop])).toThrow(Refused)
		expect(nameless).toThrow(Error)
		expect(nameless).not.toThrow(Refused)
	})

	it('takes an object as rules, not a list', () => {
		const Note = defineModel({ name: 'Note', fields: () => ({}) })
		const withRules: unknown = Reflect.get(Note, 'with')
		for (const rules of [null, []]) {
			expect(() => {
				if (typeof withRules === 'function')
					Reflect.apply(withRules, Note, [rules])
			}).toThrow('Note.with takes an object.')
		}
	})
})

describe('field builders', () => {
	it('take a field rules once', () => {
		expect(() =>
			defineModel({
				name: 'Note',
				fields: (f) => ({ text: f.string().with({}).with({}) }),
			}),
		).toThrow('A field takes its rules in one `.with`.')
	})

	it('take a list of distinct strings for an enum', () => {
		expect(() => enumOf([])).toThrow('enumOf takes a list of strings.')
		expect(() => enumOf(['a', 1])).toThrow('enumOf takes a list of strings.')
		expect(() => enumOf(['a', 'a'])).toThrow(
			'enumOf lists a value twice: a, a.',
		)
		expect(() => enumOf(['a', 'b'])).not.toThrow()
	})

	// Regression (#226): two model files importing each other read the
	// other's values before its module ran.
	it('names the cause of an enum read before it is defined', () => {
		expect(() => enumOf(undefined)).toThrow(
			'enumOf received undefined: a model file that imports another may read its values before they are defined. Move them to a file that imports no model.',
		)
	})
})

describe('schema resolution (D-37)', () => {
	it('follows a named inverse', () => {
		const Pair = defineModel({
			name: 'Pair',
			fields: (f) => ({
				left: f.one(() => Side),
				right: f.one(() => Side),
			}),
		})
		const Side = defineModel({
			name: 'Side',
			fields: (f) => ({
				lefts: f.many(() => Pair, { inverse: 'left' }),
				rights: f.many(() => Pair, { inverse: 'right' }),
			}),
		})
		const pair = fieldsOf([Pair, Side], 'Pair')
		expect(
			pair?.fields.map((field) => field.kind === 'one' && field.inverse),
		).toEqual(['lefts', 'rights'])
	})

	it('refuses an inverse that is missing, itself or not mutual', () => {
		const Lost = defineModel({
			name: 'Lost',
			fields: (f) => ({ writer: f.one(() => Writer, { inverse: 'ghost' }) }),
		})
		expect(() => resolve([Writer, Essay, Lost])).toThrow(
			"Lost.writer: inverse 'ghost' is not a relation of Writer to Lost.",
		)
		const Node = defineModel({
			name: 'Node',
			fields: (f) => ({ parent: f.one(() => Node, { inverse: 'parent' }) }),
		})
		expect(() => resolve([Node])).toThrow(
			'Node.parent cannot be its own inverse.',
		)
		const Draft = defineModel({
			name: 'Draft',
			fields: (f) => ({
				lead: f.one(() => Desk),
				desks: f.many(() => Desk, { inverse: 'drafts' }),
			}),
		})
		const Desk = defineModel({
			name: 'Desk',
			fields: (f) => ({
				// Names a `one`, while `Draft.desks` names it (D-237).
				drafts: f.many(() => Draft, { inverse: 'lead' }),
			}),
		})
		expect(() => resolve([Draft, Desk])).toThrow(
			'Draft.desks and Desk.drafts do not name each other.',
		)
		expect(() => resolve([Desk, Draft])).toThrow(
			'Desk.drafts and Draft.lead do not name each other.',
		)
		const Shelf = defineModel({
			name: 'Shelf',
			fields: (f) => ({
				first: f.many(() => Book, { inverse: 'shelf' }),
				second: f.many(() => Book, { inverse: 'shelf' }),
			}),
		})
		const Book = defineModel({
			name: 'Book',
			fields: (f) => ({ shelf: f.one(() => Shelf) }),
		})
		expect(() => resolve([Shelf, Book])).toThrow(
			'Shelf.first and Shelf.second both name Book.shelf.',
		)
	})

	it('takes onDelete only on the side that stores the key', () => {
		const Card = defineModel({
			name: 'Card',
			fields: (f) => ({
				holder: f.one(() => Holder, {
					inverse: 'card',
					optional: true,
					onDelete: 'cascade',
				}),
			}),
		})
		const Holder = defineModel({
			name: 'Holder',
			fields: (f) => ({ card: f.one(() => Card) }),
		})
		expect(() => resolve([Card, Holder])).toThrow(
			'Card.holder: onDelete belongs on Holder.card, which stores the key.',
		)
	})

	it('needs an optional relation for setNull (D-54)', () => {
		const Strict = defineModel({
			name: 'Strict',
			fields: (f) => ({
				// @ts-expect-error: the types refuse it too.
				writer: f.one(() => Owner, { onDelete: 'setNull' }),
			}),
		})
		const Owner = defineModel({
			name: 'Writer',
			fields: (f) => ({ essays: f.many(() => Strict, { inverse: 'writer' }) }),
		})
		expect(() => resolve([Owner, Strict])).toThrow(
			'Strict.writer: setNull needs an optional relation.',
		)
	})

	it('keeps an explicit onDelete and the stored names (D-63)', () => {
		const Note = defineModel({
			name: 'Note',
			dbName: 'notes',
			fields: (f) => ({
				text: f.string({ dbName: 'body' }),
				writer: f.one(() => Author, { onDelete: 'cascade', dbName: 'by' }),
			}),
		})
		const Author = defineModel({
			name: 'Author',
			fields: (f) => ({ notes: f.many(() => Note, { inverse: 'writer' }) }),
		})
		expect(fieldsOf([Note, Author], 'Note')).toMatchObject({
			dbName: 'notes',
			fields: [
				{ name: 'text', dbName: 'body' },
				{ name: 'writer', dbName: 'by', onDelete: 'cascade' },
			],
		})
	})

	it('keeps a default that is a value, which rows take when the field is added (D-105)', () => {
		const Note = defineModel({
			name: 'Note',
			fields: (f) => ({
				done: f.boolean({ default: false }),
				due: f.dateTime({ default: () => new Date() }),
				meta: f.json({ default: null }),
				text: f.string(),
			}),
		})
		const fields = fieldsOf([Note], 'Note')?.fields ?? []
		expect(
			fields.map((field) => [field.name, Object.hasOwn(field, 'default')]),
		).toStrictEqual([
			['done', true],
			['due', false],
			['meta', false],
			['text', false],
		])
		expect(fields[0]).toMatchObject({ default: false })
	})

	it('indexes only scalars and stored one relations', () => {
		expect(index('children')).toThrow(
			"Shelf: index field 'children' is not a scalar or a stored one relation.",
		)
		expect(index('ghost')).toThrow("index field 'ghost'")
		expect(index('parent')).not.toThrow()
	})

	it('refuses an index over no field', () => {
		const Post = defineModel({
			name: 'Post',
			fields: (f) => ({ title: f.string() }),
			indexes: [{ fields: [], unique: true }],
		})
		expect(() => resolve([Post])).toThrow(
			'Post: an index names at least one field.',
		)
	})

	it("indexes the kernel's fields, in a non-unique index only (D-174)", () => {
		const Message = defineModel({
			name: 'Message',
			fields: (f) => ({ text: f.string() }),
			indexes: [
				{ fields: ['text', 'createdAt', 'id'] },
				{ fields: ['updatedAt'] },
			],
		})
		expect(fieldsOf([Message], 'Message')?.indexes).toEqual([
			{ fields: ['text', 'createdAt', 'id'], unique: false, contains: false },
			{ fields: ['updatedAt'], unique: false, contains: false },
		])
		expect(
			containsIndexes([{ fields: ['title', 'createdAt'], unique: true }]),
		).toThrow(
			"Bad: a unique index cannot name 'createdAt', which the kernel sets.",
		)
		expect(
			containsIndexes([{ fields: ['createdAt'], contains: true }]),
		).toThrow(
			'Bad: a contains index covers one string field that is not a list, and is not unique.',
		)
	})

	it('keeps a contains index to one string field, not a list (D-141)', () => {
		const Book = defineModel({
			name: 'Book',
			fields: (f) => ({
				title: f.string(),
				pages: f.number(),
				tags: f.string({ list: true }),
			}),
			indexes: [{ fields: ['title'], contains: true }],
		})
		expect(fieldsOf([Book], 'Book')?.indexes).toEqual([
			{ fields: ['title'], unique: false, contains: true },
		])
		const message =
			'Bad: a contains index covers one string field that is not a list, and is not unique.'
		for (const fields of [['title', 'pages'], ['pages'], ['tags']]) {
			expect(containsIndexes([{ fields, contains: true }])).toThrow(message)
		}
		expect(
			containsIndexes([{ fields: ['title'], unique: true, contains: true }]),
		).toThrow(message)
		// Its types refuse the same indexes.
		defineModel({
			name: 'Pages',
			fields: (f) => ({ pages: f.number() }),
			// @ts-expect-error: a contains index covers a string field.
			indexes: [{ fields: ['pages'], contains: true }],
		})
		defineModel({
			name: 'Tags',
			fields: (f) => ({ tags: f.string({ list: true }) }),
			// @ts-expect-error: not a list.
			indexes: [{ fields: ['tags'], contains: true }],
		})
		defineModel({
			name: 'Pair',
			fields: (f) => ({ a: f.string(), b: f.string() }),
			// @ts-expect-error: one field.
			indexes: [{ fields: ['a', 'b'], contains: true }],
		})
		defineModel({
			name: 'Unique',
			fields: (f) => ({ a: f.string() }),
			// @ts-expect-error: not unique.
			indexes: [{ fields: ['a'], unique: true, contains: true }],
		})
	})

	it('keeps a case-insensitive key to string fields, unique without contains (D-170)', () => {
		const Member = defineModel({
			name: 'Member',
			fields: (f) => ({
				handle: f.string({ unique: 'insensitive' }),
				rank: f.number(),
			}),
			indexes: [
				{ fields: ['handle', 'rank'], unique: true, mode: 'insensitive' },
			],
		})
		const member = fieldsOf([Member], 'Member')
		expect(member?.fields[0]).toMatchObject({ name: 'handle', unique: false })
		expect(member?.indexes).toEqual([
			{
				fields: ['handle', 'rank'],
				unique: true,
				contains: false,
				mode: 'insensitive',
			},
			{
				fields: ['handle'],
				unique: true,
				contains: false,
				mode: 'insensitive',
			},
		])
		const message =
			'Bad: a case-insensitive index is unique, without contains, over a string field at least.'
		for (const refused of [
			{ fields: ['title'], mode: 'insensitive' },
			{ fields: ['title'], contains: true, mode: 'insensitive' },
			{ fields: ['pages'], unique: true, mode: 'insensitive' },
			{ fields: ['title'], unique: true, mode: 'lower' },
		]) {
			expect(containsIndexes([refused])).toThrow(message)
		}
		expect(() =>
			defineModel({
				name: 'Bad',
				// @ts-expect-error: a number has no case.
				fields: (f) => ({ pages: f.number({ unique: 'insensitive' }) }),
			}),
		).toThrow("unique: 'insensitive' takes a string field.")
		// Its types refuse the same indexes.
		defineModel({
			name: 'Pages',
			fields: (f) => ({ pages: f.number() }),
			// @ts-expect-error: a string field at least.
			indexes: [{ fields: ['pages'], unique: true, mode: 'insensitive' }],
		})
		defineModel({
			name: 'Loose',
			fields: (f) => ({ a: f.string() }),
			// @ts-expect-error: unique.
			indexes: [{ fields: ['a'], mode: 'insensitive' }],
		})
		defineModel({
			name: 'Both',
			fields: (f) => ({ a: f.string() }),
			indexes: [
				// @ts-expect-error: without contains.
				{ fields: ['a'], unique: true, contains: true, mode: 'insensitive' },
			],
		})
	})
})

/** The fields of a model whose partial index its types refuse. */
const refusedFields = (
	f: Parameters<Parameters<typeof defineModel>[0]['fields']>[0],
) => ({
	title: f.string(),
	tags: f.string({ list: true }),
	data: f.json(),
})

/** Resolves a model with the partial unique index `shape`. */
const partialIndex = (shape: object) => () => {
	const Bad = defineModel({
		name: 'Bad',
		fields: (f) => ({
			title: f.string(),
			pages: f.number(),
			tags: f.string({ list: true }),
			data: f.json(),
		}),
		// @ts-expect-error: refused by its types too.
		indexes: [shape],
	})
	resolve([Bad])
}

describe('partial unique indexes (D-215)', () => {
	const Ticket = defineModel({
		name: 'Ticket',
		fields: (f) => ({
			code: f.string(),
			pages: f.number({ optional: true }),
			done: f.boolean(),
			at: f.dateTime(),
		}),
		indexes: [
			{
				fields: ['code'],
				unique: true,
				where: {
					done: true,
					code: { not: 'x' },
					pages: { equals: null },
					at: new Date(0),
				},
			},
		],
	})

	it('keeps a where of values, null, equals and not, as the adapter reads it', () => {
		expect(fieldsOf([Ticket], 'Ticket')?.indexes).toEqual([
			{
				fields: ['code'],
				unique: true,
				contains: false,
				where: {
					done: { equals: true },
					code: { not: 'x' },
					pages: { equals: null },
					at: { equals: new Date(0) },
				},
			},
		])
	})

	it('refuses a where off a unique index, empty, or on another field', () => {
		const unique = 'Bad: an index with a where is unique, without contains.'
		expect(partialIndex({ fields: ['title'], where: { pages: 1 } })).toThrow(
			unique,
		)
		for (const where of [{}, 'title']) {
			expect(partialIndex({ fields: ['title'], unique: true, where })).toThrow(
				"Bad: an index's where names a field at least.",
			)
		}
		for (const name of ['tags', 'data', 'createdAt', 'id', 'nope']) {
			expect(
				partialIndex({ fields: ['title'], unique: true, where: { [name]: 1 } }),
			).toThrow(
				`Bad: index where '${name}' is not a scalar field that is no list, json or plugin's field type.`,
			)
		}
		for (const condition of [
			{ in: ['a'] },
			{ equals: 'a', not: 'b' },
			{ contains: 'a' },
		]) {
			expect(
				partialIndex({
					fields: ['title'],
					unique: true,
					where: { title: condition },
				}),
			).toThrow(
				"Bad: index where 'title' takes a value, null, { equals } or { not }.",
			)
		}
		expect(
			partialIndex({ fields: ['title'], unique: true, where: { pages: 'x' } }),
		).toThrow("Bad: index where 'pages': ")
		// Its types refuse the same indexes.
		defineModel({
			name: 'Loose',
			fields: refusedFields,
			// @ts-expect-error: unique.
			indexes: [{ fields: ['title'], where: { title: 'a' } }],
		})
		defineModel({
			name: 'Bad',
			fields: refusedFields,
			// @ts-expect-error: a list.
			indexes: [{ fields: ['title'], unique: true, where: { tags: null } }],
		})
		defineModel({
			name: 'Bad',
			fields: refusedFields,
			// @ts-expect-error: json.
			indexes: [{ fields: ['title'], unique: true, where: { data: null } }],
		})
		defineModel({
			name: 'Bad',
			fields: refusedFields,
			indexes: [
				// @ts-expect-error: the kernel's.
				{ fields: ['title'], unique: true, where: { createdAt: null } },
			],
		})
		defineModel({
			name: 'Bad',
			fields: refusedFields,
			indexes: [
				// @ts-expect-error: no in.
				{ fields: ['title'], unique: true, where: { title: { in: ['a'] } } },
			],
		})
		defineModel({
			name: 'Bad',
			fields: refusedFields,
			// @ts-expect-error: a string.
			indexes: [{ fields: ['title'], unique: true, where: { title: 1 } }],
		})
	})

	it('is no target of findUnique', async () => {
		const app = defineApp({ database: memory(), models: [Ticket] })
		await app.start()
		try {
			await expect(
				// @ts-expect-error: rows outside the where share a code.
				Ticket.findUnique({ where: { code: 'a' } }, { as: master }),
			).rejects.toThrow(
				'where must name exactly id, a unique field or a unique index of Ticket.',
			)
		} finally {
			await app.stop()
		}
	})
})

describe('uuidv7 (D-22)', () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('keeps ids in order past 4096 in one millisecond', () => {
		vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2100, 0, 1))
		const ids = Array.from({ length: 4098 }, () => uuidv7())
		expect(ids.toSorted()).toEqual(ids)
		expect(new Set(ids).size).toBe(ids.length)
	})

	it('writes the time, the version, the counter and the variant', () => {
		const time = Date.UTC(2101, 0, 1)
		vi.spyOn(Date, 'now').mockReturnValue(time)
		const first = uuidv7()
		const second = uuidv7()
		const form =
			/^([0-9a-f]{8})-([0-9a-f]{4})-7([0-9a-f]{3})-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
		const [, high = '', low = '', counter] = form.exec(first) ?? []
		expect(Number.parseInt(high + low, 16)).toBe(time)
		expect(counter).toBe('000')
		expect(form.exec(second)?.[3]).toBe('001')
		expect(second.slice(19)).not.toBe(first.slice(19))
	})
})
