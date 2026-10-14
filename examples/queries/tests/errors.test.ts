import {
	FrameworkError,
	PublicError,
	frameworkErrorCodes,
} from '@ultimabase/core'
import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { findPostOrNull } from '../src/errors.ts'
import { Announcement, Author, Post } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'
import { createAuthor, missingId } from './support.ts'

it('separates diagnostics from the public payload', () => {
	//#region framework-error
	const error = new FrameworkError('NOT_FOUND', 'Trusted diagnostic', {
		publicMessage: 'The requested post was not found.',
		publicDetails: { resource: 'Post' },
	})

	const safePayload = error.toJSON()
	//#endregion framework-error

	expect(safePayload).toStrictEqual({
		code: 'NOT_FOUND',
		retryable: false,
		message: 'The requested post was not found.',
		details: { resource: 'Post' },
	})
	expect(JSON.stringify(error)).not.toContain('Trusted diagnostic')
	expect(frameworkErrorCodes).toContain('VALIDATION_ERROR')
})

it('returns null for an absent post and rethrows anything else', async () => {
	await testApplication(ultimabase)
	const post = await Post.createOne({ data: { slug: 'here', title: 'Here' } })

	expect(await findPostOrNull(post.id)).toMatchObject({ title: 'Here' })
	expect(await findPostOrNull(missingId)).toBeNull()
	await expect(findPostOrNull('not-a-uuid')).rejects.toThrow(TypeError)
})

it('lists every structural issue of the input', async () => {
	await testApplication(ultimabase)

	//#region validation-issues
	const failure = await Post.createMany({
		data: [
			{ slug: 'valid', title: 'Valid' },
			{ slug: 'invalid', title: 'Invalid', views: 1.5 },
		],
	}).catch((error: unknown) => error)

	// What a client receives: code, message and the public issues.
	const payload = failure instanceof FrameworkError ? failure.toJSON() : null
	//#endregion validation-issues

	expect(payload).toMatchObject({
		code: 'VALIDATION_ERROR',
		message: 'The operation input is invalid.',
		details: {
			issues: [
				{
					code: 'int.type',
					path: [1, 'input', 'views'],
					message: 'input.views must be a safe integer',
				},
			],
		},
	})
	expect(await Post.count()).toBe(0)
})

it('refuses an operation with a PublicError', async () => {
	await using t = await testApplication(ultimabase)
	const ada = await createAuthor()

	const failure = await t
		.as(Author.pointer(ada.id), () =>
			Announcement.createOne({ data: { title: 'See https://example.com' } }),
		)
		.catch((error: unknown) => error)

	expect(failure).toBeInstanceOf(PublicError)
	expect(
		failure instanceof PublicError ? failure.toJSON() : undefined,
	).toStrictEqual({
		code: 'announcement.title-link',
		retryable: false,
		message: 'An announcement cannot contain a link.',
		details: { field: 'title' },
	})
	expect(await Announcement.count()).toBe(0)
	expect(
		() => new PublicError('Impersonation', { code: 'PERMISSION_DENIED' }),
	).toThrow(TypeError)
	expect(new PublicError('Refused').code).toBe('APPLICATION_ERROR')
})
