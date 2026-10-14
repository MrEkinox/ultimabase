import { FrameworkError } from '@ultimabase/core'
import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Author, Post } from '../src/schema.ts'
import { createPostAndRenameAuthor, runWithRetry } from '../src/transactions.ts'
import { ultimabase } from '../src/ultimabase.ts'
import { createAuthor, missingId } from './support.ts'

it('commits two commands together', async () => {
	await testApplication(ultimabase)
	const ada = await createAuthor()

	const post = await createPostAndRenameAuthor(ada.id, 'fresh', 'Fresh')

	expect(await Post.findOne({ where: { slug: 'fresh' } })).toMatchObject({
		id: post.id,
	})
	expect(await Author.findOneOrThrow({ where: { id: ada.id } })).toMatchObject({
		displayName: 'Published author',
	})
	await expect(
		createPostAndRenameAuthor(missingId, 'orphan', 'Orphan'),
	).rejects.toMatchObject({ code: 'NOT_FOUND' })
})

it('rolls every command back when the callback fails', async () => {
	await testApplication(ultimabase)

	//#region rollback
	const attempt = ultimabase.transaction(async () => {
		await Post.createOne({ data: { slug: 'first', title: 'First' } })
		await Post.createOne({ data: { slug: 'second', title: 'Second' } })
		throw new Error('Abandon both posts')
	})
	//#endregion rollback

	await expect(attempt).rejects.toThrow('Abandon both posts')
	expect(await Post.count()).toBe(0)
})

it('stays rollback-only after a caught failure', async () => {
	await testApplication(ultimabase)
	await Post.createOne({ data: { slug: 'taken', title: 'Taken' } })

	await expect(
		ultimabase.transaction(async () => {
			await Post.createOne({ data: { slug: 'new', title: 'New' } })
			try {
				await Post.createOne({ data: { slug: 'taken', title: 'Duplicate' } })
			} catch {
				// Catching the failure does not save the transaction.
			}
		}),
	).rejects.toThrow()
	expect(await Post.count()).toBe(1)
})

it('refuses a nested explicit transaction', async () => {
	await testApplication(ultimabase)

	await expect(
		ultimabase.transaction(() => ultimabase.transaction(() => Post.count())),
	).rejects.toMatchObject({ code: 'TRANSACTION_ERROR' })
})

it('runs a mutation in an automatic transaction', async () => {
	await testApplication(ultimabase)
	await Post.createOne({ data: { slug: 'taken', title: 'Taken' } })

	// The second item fails: the first item is not committed alone.
	await expect(
		Post.createMany({
			data: [
				{ slug: 'new', title: 'New' },
				{ slug: 'taken', title: 'Duplicate' },
			],
		}),
	).rejects.toMatchObject({ code: 'UNIQUE_VIOLATION' })
	expect(await Post.count()).toBe(1)
})

it('retries only a transaction conflict', async () => {
	await testApplication(ultimabase)
	let attempts = 0

	const count = await runWithRetry(async () => {
		attempts += 1
		if (attempts < 3) {
			throw new FrameworkError('TRANSACTION_CONFLICT', 'Simulated conflict')
		}
		return Post.count()
	})

	expect(count).toBe(0)
	expect(attempts).toBe(3)
	await expect(
		runWithRetry(() => Promise.reject(new Error('Not a conflict'))),
	).rejects.toThrow('Not a conflict')
})
