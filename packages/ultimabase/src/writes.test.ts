import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { master } from './index.ts'
import { query } from './engine.ts'
import { Author, Book, Profile, Tag, library } from './test/library.ts'

const as = { as: master }
let app: ReturnType<typeof library>

beforeEach(async () => {
	app = library()
	await app.start()
})
afterEach(async () => {
	await app.stop()
})

const ada = async () => Author.create({ data: { name: 'Ada' } }, as)

describe('create', () => {
	it('returns the row with its id, timestamps, defaults and nulls', async () => {
		const author = await ada()
		const book = await Book.create(
			{ data: { title: 'Notes', author: { connect: { id: author.id } } } },
			as,
		)
		const { id, createdAt, ...values } = book
		expect(typeof id).toBe('string')
		expect(createdAt).toBeInstanceOf(Date)
		expect(values).toEqual({
			updatedAt: createdAt,
			title: 'Notes',
			pages: null,
			published: false,
			meta: null,
			releasedAt: null,
		})
		expect(author.level).toBe('junior')
	})

	it('gives time-ordered UUIDv7 ids', async () => {
		const first = await ada()
		const second = await Author.create({ data: { name: 'Grace' } }, as)
		expect(first.id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
		)
		expect(first.id < second.id).toBe(true)
	})

	it('reports every invalid value as VALIDATION_FAILED', async () => {
		const created = query(
			'Book',
			'create',
			{ data: { title: 3, pages: Number.NaN, published: 'yes' } },
			as,
		)
		await expect(created).rejects.toMatchObject({
			code: 'VALIDATION_FAILED',
			details: {
				issues: [
					{ path: ['title'], message: 'Expected a string.' },
					{ path: ['pages'], message: 'Expected a finite number.' },
					{ path: ['published'], message: 'Expected a boolean.' },
				],
			},
		})
	})

	it('checks required fields after the hooks, which may fill them (D-88)', async () => {
		const created = query('Book', 'create', { data: { title: null } }, as)
		await expect(created).rejects.toMatchObject({
			code: 'VALIDATION_FAILED',
			details: {
				issues: [
					{ path: ['title'], message: 'Required.' },
					{ path: ['author'], message: 'Required.' },
				],
			},
		})
	})

	it('checks enum, date and json values', async () => {
		const created = query(
			'Author',
			'create',
			{ data: { name: 'Ada', level: 'expert' } },
			as,
		)
		await expect(created).rejects.toMatchObject({
			details: { issues: [{ message: 'Expected one of junior, senior.' }] },
		})
		const author = await ada()
		const book = query(
			'Book',
			'create',
			{
				data: {
					title: 'T',
					author: { connect: { id: author.id } },
					releasedAt: new Date(Number.NaN),
					meta: { at: new Date() },
				},
			},
			as,
		)
		await expect(book).rejects.toMatchObject({
			details: {
				issues: [
					{ path: ['releasedAt'], message: 'Expected a valid Date.' },
					{ path: ['meta'], message: 'Expected JSON data.' },
				],
			},
		})
	})

	it('stores a json value as a copy', async () => {
		const author = await ada()
		const meta = { tags: ['a'] }
		const book = await Book.create(
			{ data: { title: 'T', meta, author: { connect: { id: author.id } } } },
			as,
		)
		meta.tags.push('b')
		const found = await Book.findUnique({ where: { id: book.id } }, as)
		expect(found?.meta).toEqual({ tags: ['a'] })
	})

	it('fails on an unknown key with its path', async () => {
		const created = query('Author', 'create', { data: { nme: 'Ada' } }, as)
		await expect(created).rejects.toMatchObject({
			code: 'INVALID_QUERY',
			path: 'data.nme',
		})
	})

	it('ignores undefined values (D-84)', async () => {
		const author = await Author.create(
			{ data: { name: 'Ada', level: undefined } },
			as,
		)
		expect(author.level).toBe('junior')
	})

	it('fails with UNIQUE_VIOLATION on a unique field and a unique index', async () => {
		const author = await ada()
		await expect(ada()).rejects.toMatchObject({
			code: 'UNIQUE_VIOLATION',
			details: { model: 'Author', fields: ['name'] },
		})
		const data = { title: 'T', author: { connect: { id: author.id } } }
		await Book.create({ data }, as)
		await expect(Book.create({ data }, as)).rejects.toMatchObject({
			code: 'UNIQUE_VIOLATION',
			details: { model: 'Book', fields: ['title', 'author'] },
		})
	})

	it('fails with NOT_FOUND when a connected row does not exist', async () => {
		const created = Book.create(
			{ data: { title: 'T', author: { connect: { id: 'missing' } } } },
			as,
		)
		await expect(created).rejects.toMatchObject({ code: 'NOT_FOUND' })
		expect(await Book.count({}, as)).toBe(0)
	})
})

describe('update', () => {
	it('changes the values and moves updatedAt', async () => {
		const author = await ada()
		const updated = await Author.update(
			{ where: { id: author.id }, data: { level: 'senior' } },
			as,
		)
		expect(updated.level).toBe('senior')
		expect(updated.createdAt).toEqual(author.createdAt)
		expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
			author.updatedAt.getTime(),
		)
	})

	it('targets a unique field', async () => {
		await ada()
		const updated = await Author.update(
			{ where: { name: 'Ada' }, data: { name: 'Ada L.' } },
			as,
		)
		expect(updated.name).toBe('Ada L.')
	})

	it('fails with NOT_FOUND on a missing row, after checking the data', async () => {
		const missing = query(
			'Author',
			'update',
			{ where: { id: 'missing' }, data: { name: 1 } },
			as,
		)
		await expect(missing).rejects.toMatchObject({ code: 'NOT_FOUND' })
		const unknown = query(
			'Author',
			'update',
			{ where: { id: 'missing' }, data: { nme: 1 } },
			as,
		)
		await expect(unknown).rejects.toMatchObject({ code: 'INVALID_QUERY' })
	})

	it('needs exactly a unique target', async () => {
		const updated = query(
			'Author',
			'update',
			{ where: { level: 'junior' }, data: {} },
			as,
		)
		await expect(updated).rejects.toMatchObject({
			code: 'INVALID_QUERY',
			path: 'where',
		})
	})

	it('cannot set a required field to null', async () => {
		const author = await ada()
		const updated = query(
			'Author',
			'update',
			{ where: { id: author.id }, data: { name: null } },
			as,
		)
		await expect(updated).rejects.toMatchObject({
			code: 'VALIDATION_FAILED',
			details: { issues: [{ path: ['name'], message: 'Required.' }] },
		})
	})
})

describe('delete', () => {
	it('returns the deleted row and removes it', async () => {
		const author = await ada()
		const deleted = await Author.delete({ where: { id: author.id } }, as)
		expect(deleted).toEqual(author)
		expect(await Author.count({}, as)).toBe(0)
		await expect(
			Author.delete({ where: { id: author.id } }, as),
		).rejects.toMatchObject({ code: 'NOT_FOUND' })
	})
})

describe('relation writes', () => {
	it('connects a one-to-many from either side', async () => {
		const author = await ada()
		const book = await Book.create(
			{ data: { title: 'T', author: { connect: { id: author.id } } } },
			as,
		)
		const grace = await Author.create({ data: { name: 'Grace' } }, as)
		await Author.update(
			{
				where: { id: grace.id },
				data: { books: { connect: [{ id: book.id }] } },
			},
			as,
		)
		const found = await Book.findUnique(
			{ where: { id: book.id }, include: { author: true } },
			as,
		)
		expect(found?.author.name).toBe('Grace')
	})

	it('cannot disconnect a required inverse', async () => {
		const author = await ada()
		const book = await Book.create(
			{ data: { title: 'T', author: { connect: { id: author.id } } } },
			as,
		)
		const updated = query(
			'Author',
			'update',
			{
				where: { id: author.id },
				data: { books: { disconnect: [{ id: book.id }] } },
			},
			as,
		)
		await expect(updated).rejects.toMatchObject({
			code: 'VALIDATION_FAILED',
			details: { issues: [{ path: ['books', 'disconnect'] }] },
		})
	})

	it('writes a one-to-one from the side that does not store the key', async () => {
		const author = await ada()
		const profile = await Profile.create(
			{ data: { author: { connect: { id: author.id } } } },
			as,
		)
		const found = await Author.findUnique(
			{ where: { id: author.id }, include: { profile: true } },
			as,
		)
		expect(found?.profile?.id).toBe(profile.id)
		const other = await Author.create({ data: { name: 'Grace' } }, as)
		// The profile would be left without an author (D-37).
		const moved = Author.update(
			{
				where: { id: other.id },
				data: { profile: { connect: { id: profile.id } } },
			},
			as,
		)
		await expect(moved).resolves.toMatchObject({ id: other.id })
		const left = Author.update(
			{ where: { id: other.id }, data: { profile: { disconnect: true } } },
			as,
		)
		await expect(left).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
	})

	it('links and unlinks a many-to-many', async () => {
		const author = await ada()
		const tag = await Tag.create({ data: { label: 'math' } }, as)
		const book = await Book.create(
			{
				data: {
					title: 'T',
					author: { connect: { id: author.id } },
					tags: { connect: [{ id: tag.id }] },
				},
			},
			as,
		)
		const linked = await Tag.findUnique(
			{ where: { id: tag.id }, include: { books: true } },
			as,
		)
		expect(linked?.books.map((each) => each.id)).toEqual([book.id])
		await Book.update(
			{
				where: { id: book.id },
				data: { tags: { disconnect: [{ id: tag.id }] } },
			},
			as,
		)
		expect(
			await Tag.count({ where: { books: { some: { id: book.id } } } }, as),
		).toBe(0)
	})

	it('takes only connect when creating', async () => {
		const created = query(
			'Book',
			'create',
			{ data: { title: 'T', author: { disconnect: true } } },
			as,
		)
		await expect(created).rejects.toMatchObject({
			code: 'INVALID_QUERY',
			path: 'data.author.disconnect',
		})
	})
})
