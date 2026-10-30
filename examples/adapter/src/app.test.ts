// The application on its declared database, timed(memory()): its round
// trips, and what a developer sees when the adapter refuses a write.
import { testApplication } from '@ultimabase/testing'
import { master } from 'ultimabase'
import { expect, it } from 'vitest'
import { app, database } from './app.ts'
import { Author, Post } from './models.ts'

//#region test-application
// memory() starts empty, so each test starts on an empty database.
testApplication(app, { database: 'declared' })
//#endregion

const M = { as: master }
const missing = '00000000-0000-4000-8000-000000000000'

it('makes one round trip per query', async () => {
	//#region round-trips
	const before = database.roundTrips()
	const ada = await Author.create({ data: { name: 'Ada' } }, M)
	await Post.create(
		{ data: { slug: 'hello', author: { connect: { id: ada.id } } } },
		M,
	)
	// Each query is one round trip, a read and its relations at any depth
	// included: two writes and a read make three.
	await Author.findMany(
		{ include: { posts: { include: { author: true } } } },
		M,
	)
	expect(database.roundTrips() - before).toBe(3)
	//#endregion
})

it('reports a unique index refusal', async () => {
	//#region unique
	const ada = await Author.create({ data: { name: 'Ada' } }, M)
	const data = { slug: 'hello', author: { connect: { id: ada.id } } }
	await Post.create({ data }, M)
	await expect(Post.create({ data }, M)).rejects.toMatchObject({
		code: 'UNIQUE_VIOLATION',
		message: 'Unique constraint failed on Post (slug).',
		details: { model: 'Post', fields: ['slug'] },
	})
	//#endregion
})

it('reports a failed check', async () => {
	//#region check
	const connect = { id: missing }
	await expect(
		Post.create({ data: { slug: 'hello', author: { connect } } }, M),
	).rejects.toMatchObject({
		code: 'NOT_FOUND',
		message: 'A connected Author does not exist.',
	})
	expect(await Post.count({}, M)).toBe(0)
	//#endregion
})

it('reports a result out of range', async () => {
	//#region out-of-range
	const ada = await Author.create({ data: { name: 'Ada' } }, M)
	await Post.create(
		{
			data: {
				slug: 'hello',
				views: 2_147_483_647,
				author: { connect: { id: ada.id } },
			},
		},
		M,
	)
	await expect(
		Post.update(
			{ where: { slug: 'hello' }, data: { views: { increment: 1 } } },
			M,
		),
	).rejects.toMatchObject({
		code: 'VALIDATION_FAILED',
		details: {
			issues: [
				{
					path: ['views'],
					message:
						'Expected a whole number from -2,147,483,648 to 2,147,483,647.',
				},
			],
		},
	})
	//#endregion
})
