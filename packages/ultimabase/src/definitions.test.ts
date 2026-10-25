// What `defineModel`, the field builders and schema resolution refuse at
// startup, and the stored names they keep (D-37, D-63).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineModel, Refused } from './index.ts'
import { resolve } from './schema.ts'
import { uuidv7 } from './uuid.ts'

/** Calls `defineModel` with a definition its types would refuse. */
const untyped = (definition: object): void => {
	Reflect.apply(defineModel, undefined, [definition])
}

/** Builds an enum field from values its types would refuse. */
const enumOf = (values: readonly unknown[]): void => {
	untyped({
		name: 'Note',
		fields: (f: { enumOf: (list: readonly unknown[]) => object }) => ({
			level: f.enumOf(values),
		}),
	})
}

const Writer = defineModel({
	name: 'Writer',
	fields: (f) => ({ essays: f.many(() => Essay) }),
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
				many: (target: () => unknown) => object
			}) => ({
				parent: f.one(() => Shelf, { optional: true }),
				children: f.many(() => Shelf),
			}),
			indexes: [{ fields: [field] }],
		},
	])
	resolve([Shelf])
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

	it('takes an object as rules', () => {
		const Note = defineModel({ name: 'Note', fields: () => ({}) })
		const withRules: unknown = Reflect.get(Note, 'with')
		expect(() => {
			if (typeof withRules === 'function')
				Reflect.apply(withRules, Note, [null])
		}).toThrow('Note.with takes an object.')
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
})

describe('schema resolution (D-37)', () => {
	it('follows a named inverse', () => {
		const Pair = defineModel({
			name: 'Pair',
			fields: (f) => ({
				left: f.one(() => Side, { inverse: 'lefts' }),
				right: f.one(() => Side, { inverse: 'rights' }),
			}),
		})
		const Side = defineModel({
			name: 'Side',
			fields: (f) => ({
				lefts: f.many(() => Pair, { inverse: 'left' }),
				rights: f.many(() => Pair),
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
				first: f.one(() => Desk, { inverse: 'drafts' }),
				second: f.one(() => Desk, { inverse: 'drafts' }),
			}),
		})
		const Desk = defineModel({
			name: 'Desk',
			fields: (f) => ({ drafts: f.many(() => Draft, { inverse: 'first' }) }),
		})
		expect(() => resolve([Draft, Desk])).toThrow(
			'Draft.second and Desk.drafts do not name each other.',
		)
	})

	it('takes onDelete only on the side that stores the key', () => {
		const Card = defineModel({
			name: 'Card',
			fields: (f) => ({
				holder: f.one(() => Holder, { optional: true, onDelete: 'cascade' }),
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
			fields: (f) => ({ essays: f.many(() => Strict) }),
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
			fields: (f) => ({ notes: f.many(() => Note) }),
		})
		expect(fieldsOf([Note, Author], 'Note')).toMatchObject({
			dbName: 'notes',
			fields: [
				{ name: 'text', dbName: 'body' },
				{ name: 'writer', dbName: 'by', onDelete: 'cascade' },
			],
		})
	})

	it('indexes only scalars and stored one relations', () => {
		expect(index('children')).toThrow(
			"Shelf: index field 'children' is not a scalar or a stored one relation.",
		)
		expect(index('ghost')).toThrow("index field 'ghost'")
		expect(index('parent')).not.toThrow()
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
})
