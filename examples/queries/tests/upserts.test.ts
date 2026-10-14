import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Post, Translation } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'
import { savePost, saveTranslation } from '../src/writes.ts'
import { missingId } from './support.ts'

it('creates then updates through the unique slug', async () => {
	await testApplication(ultimabase)

	const created = await savePost('hello', 'Hello')
	const updated = await savePost('hello', 'Hello again')

	expect(created).toStrictEqual({
		id: created.id,
		slug: 'hello',
		title: 'Hello',
	})
	expect(updated).toStrictEqual({
		id: created.id,
		slug: 'hello',
		title: 'Hello again',
	})
	expect(await Post.count()).toBe(1)
})

it('upserts through a composite unique index', async () => {
	await testApplication(ultimabase)
	const post = await Post.createOne({ data: { slug: 'hello', title: 'Hello' } })

	const french = await saveTranslation(post.id, 'fr', 'Bonjour')
	const again = await saveTranslation(post.id, 'fr', 'Salut')
	await saveTranslation(post.id, 'de', 'Hallo')

	expect(french).toStrictEqual({
		id: french.id,
		locale: 'fr',
		title: 'Bonjour',
	})
	expect(again).toStrictEqual({ id: french.id, locale: 'fr', title: 'Salut' })
	expect(await Translation.count()).toBe(2)
})

it('keeps the target as the identity of the create branch', async () => {
	await testApplication(ultimabase)
	await Post.createOne({ data: { slug: 'taken', title: 'Taken' } })

	// The create values must match the target.
	await expect(
		Post.upsertOne({
			where: { slug: 'one' },
			create: { slug: 'other', title: 'Mismatch' },
			update: { title: 'Mismatch' },
		}),
	).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
	// Another unique key never redirects the update: the create collides.
	await expect(
		Post.upsertOne({
			where: { id: missingId },
			create: { slug: 'taken', title: 'Collision' },
			update: { title: 'Collision' },
		}),
	).rejects.toMatchObject({
		code: 'VALIDATION_ERROR',
		publicMessage: 'The operation violates a data constraint.',
	})
	expect(await Post.findMany({ select: { title: true } })).toStrictEqual([
		expect.objectContaining({ title: 'Taken' }),
	])
})
