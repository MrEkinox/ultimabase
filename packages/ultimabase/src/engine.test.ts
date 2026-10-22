import { afterEach, describe, expect, it } from 'vitest'
import { asUser } from '@ultimabase/testing'
import { defineModel, master } from './index.ts'
import { query } from './engine.ts'
import { resolve } from './schema.ts'
import { Author, Book, Profile, Tag, library } from './test/library.ts'

const as = { as: master }
let app: ReturnType<typeof library> | undefined

afterEach(async () => {
	await app?.stop()
	app = undefined
})

const start = async (): Promise<void> => {
	app = library()
	await app.start()
}

describe('start and stop', () => {
	it('runs queries only while started', async () => {
		await expect(Author.count({}, as)).rejects.toThrow(
			'Author is not a model of a started application.',
		)
		await start()
		expect(await Author.count({}, as)).toBe(0)
		await app?.stop()
		await expect(Author.count({}, as)).rejects.toThrow('not a model')
	})

	it('runs one application per realm (D-18)', async () => {
		await start()
		const other = library()
		await expect(other.start()).rejects.toThrow('already running')
		await expect(app?.start()).rejects.toThrow('The application is running.')
	})

	it('starts each time on an empty memory()', async () => {
		await start()
		await Author.create({ data: { name: 'Ada' } }, as)
		await app?.stop()
		await start()
		expect(await Author.count({}, as)).toBe(0)
	})
})

describe('callers (D-19)', () => {
	const callers = [
		{ name: 'anonymous', options: undefined },
		{ name: 'an explicit anonymous', options: { as: { kind: 'anonymous' } } },
		{ name: 'a user', options: { as: asUser({ id: 'u1' }) } },
	]

	it.each(callers)(
		'$name reads and writes nothing yet (D-04)',
		async ({ options }) => {
			await start()
			const ada = await Author.create({ data: { name: 'Ada' } }, as)
			const where = { where: { id: ada.id } }
			expect(await query('Author', 'findMany', {}, options)).toEqual([])
			expect(await query('Author', 'findFirst', {}, options)).toBeNull()
			expect(await query('Author', 'findUnique', where, options)).toBeNull()
			expect(await query('Author', 'count', {}, options)).toBe(0)
			await expect(
				query('Author', 'create', { data: { name: 'Grace' } }, options),
			).rejects.toMatchObject({
				code: 'ACCESS_DENIED',
				details: { model: 'Author', operation: 'create' },
			})
			await expect(
				query('Author', 'update', { ...where, data: { name: 'A' } }, options),
			).rejects.toMatchObject({ code: 'NOT_FOUND' })
			await expect(
				query('Author', 'delete', where, options),
			).rejects.toMatchObject({ code: 'NOT_FOUND' })
			expect(await Author.count({}, as)).toBe(1)
		},
	)

	it('still checks the query of a closed caller', async () => {
		await start()
		await expect(
			query('Author', 'findMany', { where: { nme: 'A' } }, undefined),
		).rejects.toMatchObject({ code: 'INVALID_QUERY', path: 'where.nme' })
	})

	it('refuses a Master the kernel did not create', async () => {
		await start()
		const forged = { kind: 'master', master: { source: 'code' } }
		await expect(query('Author', 'count', {}, { as: forged })).rejects.toThrow(
			'options.as is a Master the kernel did not create.',
		)
		await expect(
			query('Author', 'count', {}, { as: { ...master } }),
		).rejects.toThrow('did not create')
	})

	it('checks the options', async () => {
		await start()
		await expect(
			query('Author', 'count', {}, { as: master, tx: {} }),
		).rejects.toMatchObject({ path: 'options.tx' })
		await expect(
			query('Author', 'count', {}, { as: { kind: 'user', user: {} } }),
		).rejects.toMatchObject({ path: 'options.as' })
		await expect(
			query('Author', 'count', {}, { as: 'master' }),
		).rejects.toMatchObject({ path: 'options.as' })
	})
})

describe('models', () => {
	it('freezes a model and takes its rules once', () => {
		const Note = defineModel({
			name: 'Note',
			fields: (f) => ({ text: f.string() }),
		})
		const withRules = Note.with({})
		expect(Object.isFrozen(withRules)).toBe(true)
		expect(() => withRules.with({})).toThrow(
			'Note takes its rules in one `.with`.',
		)
	})

	it('keeps the kernel names', () => {
		expect(() =>
			defineModel({
				name: 'Note',
				fields: (f) => ({ id: f.string() }),
			}),
		).toThrow('Note.id: the kernel owns this name.')
	})
})

describe('schema resolution (D-37)', () => {
	const Writer = defineModel({
		name: 'Writer',
		fields: (f) => ({ name: f.string() }),
	})

	it('needs the other side of a relation', () => {
		const Essay = defineModel({
			name: 'Essay',
			fields: (f) => ({ writer: f.one(() => Writer) }),
		})
		expect(() => resolve([Writer, Essay])).toThrow(
			'Essay.writer: Writer has no relation to Essay; add its side.',
		)
	})

	it('needs a named inverse between several relations', () => {
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
				lefts: f.many(() => Pair),
				rights: f.many(() => Pair),
			}),
		})
		expect(() => resolve([Pair, Side])).toThrow('name one with `inverse`')
	})

	it('needs one optional side of a one-to-one', () => {
		const Card = defineModel({
			name: 'Card',
			fields: (f) => ({ holder: f.one(() => Holder) }),
		})
		const Holder = defineModel({
			name: 'Holder',
			fields: (f) => ({ card: f.one(() => Card) }),
		})
		expect(() => resolve([Card, Holder])).toThrow(
			'make one side of a one-to-one relation optional',
		)
	})

	it('needs every target and distinct names in models', () => {
		const Essay = defineModel({
			name: 'Essay',
			fields: (f) => ({ writer: f.one(() => Writer) }),
		})
		expect(() => resolve([Essay])).toThrow(
			'Essay.writer: its target is not in models.',
		)
		expect(() => resolve([Writer, Writer])).toThrow(
			'models lists two models named Writer.',
		)
		expect(() => resolve([{ name: 'Writer' }])).toThrow(
			'models lists a value that defineModel did not return.',
		)
	})

	it('puts the key on the many side and the required one side', () => {
		const { schema } = resolve([Author, Profile, Book, Tag])
		const fields = (model: string) =>
			schema.models.find((each) => each.name === model)?.fields ?? []
		expect(fields('Book').find((field) => field.name === 'author')).toEqual({
			kind: 'one',
			name: 'author',
			target: 'Author',
			inverse: 'books',
			stored: true,
			unique: false,
			optional: false,
			onDelete: 'restrict',
		})
		expect(
			fields('Profile').find((field) => field.name === 'author'),
		).toMatchObject({ stored: true, unique: true })
		expect(
			fields('Author').find((field) => field.name === 'profile'),
		).toMatchObject({ stored: false, onDelete: 'setNull' })
		expect(fields('Tag').find((field) => field.name === 'books')).toMatchObject(
			{ kind: 'many', join: true },
		)
	})
})
