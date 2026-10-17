import { throwIfOperationCancelled } from '@ultimabase/core'
import { RequestContext, requestSources } from '@ultimabase/core/plugin'
import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { readPostsForJob } from '../src/jobs.ts'
import {
	authorityMode,
	currentTenant,
	scoped,
	tenantId,
} from '../src/request-identity.ts'
import { Announcement, Author, Post } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'
import { createAuthor, missingId } from './support.ts'

it('derives a typed request value without authority', () => {
	expect(currentTenant).toBe('tenant-42')
	expect(authorityMode).toBe('anonymous')
	// The same token twice fails instead of replacing identity.
	expect(() => scoped.withValue(tenantId, 'tenant-43')).toThrow()
	const fresh = RequestContext.anonymous({
		requestId: 'request-124',
		source: requestSources.internal,
	})
	expect(() => fresh.withValue(tenantId, '')).toThrow(
		'Tenant id must be a non-empty string',
	)
	expect(fresh.getValue(tenantId)).toBeUndefined()
})

it('reads with a job context and its cancellation signal', async () => {
	await testApplication(ultimabase)
	await Post.createOne({ data: { slug: 'report', title: 'Report' } })
	const controller = new AbortController()

	const posts = await readPostsForJob('job-1', controller.signal)
	controller.abort()

	expect(posts.map(({ title }) => title)).toStrictEqual(['Report'])
	await expect(
		readPostsForJob('job-2', controller.signal),
	).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' })
})

it('reports a cancelled signal at a safe boundary', () => {
	//#region cancellation
	const controller = new AbortController()
	// Returns while the signal is active.
	throwIfOperationCancelled(controller.signal, { phase: 'before-callback' })

	controller.abort(new Error('Private reason'))
	const check = () => {
		throwIfOperationCancelled(controller.signal, { phase: 'before-callback' })
	}
	//#endregion cancellation

	expect(check).toThrow(
		expect.objectContaining({ code: 'OPERATION_CANCELLED' }),
	)
	try {
		check()
	} catch (error) {
		expect(JSON.stringify(error)).not.toContain('Private reason')
	}
})

it('gives policies the current principal', async () => {
	await using t = await testApplication(ultimabase)
	const ada = await createAuthor()

	const signedIn = await t.as(Author.pointer(ada.id), () =>
		Announcement.createOne({
			data: { title: 'Signed in' },
			select: { title: true },
		}),
	)

	await expect(
		Announcement.createOne({ data: { title: 'Anonymous' } }),
	).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
	expect(signedIn).toMatchObject({ title: 'Signed in' })
	// Nested and transactional operations inherit the principal.
	expect(
		await t.as(Author.pointer(ada.id), () =>
			ultimabase.transaction(() =>
				Announcement.createOne({
					data: { title: 'In a transaction' },
					select: { title: true },
				}),
			),
		),
	).toMatchObject({ title: 'In a transaction' })
})

it('asks whether an operation would be permitted', async () => {
	await using t = await testApplication(ultimabase)
	const writer = await createAuthor()
	const editor = await createAuthor({ editor: true })
	const announcement = await t.as(Author.pointer(writer.id), () =>
		Announcement.createOne({ data: { title: 'Hello' } }),
	)

	//#region can
	const canEdit = await ultimabase.can({
		operation: 'update',
		schema: Announcement,
		item: { id: announcement.id },
		principal: Author.pointer(editor.id),
	})
	//#endregion can

	expect(canEdit).toBe(true)
	const ask = (principal: ReturnType<typeof Author.pointer> | undefined) =>
		ultimabase.can({
			operation: 'update',
			schema: Announcement,
			item: { id: announcement.id },
			principal,
		})
	expect(await ask(Author.pointer(writer.id))).toBe(false)
	expect(await ask(undefined)).toBe(false)
	// The principal defaults to the current request's.
	expect(
		await t.as(Author.pointer(writer.id), () =>
			ultimabase.can({ operation: 'create', schema: Announcement }),
		),
	).toBe(true)
	expect(
		await ultimabase.can({ operation: 'create', schema: Announcement }),
	).toBe(false)
	// A missing row answers false; nothing was changed.
	expect(
		await ultimabase.can({
			operation: 'update',
			schema: Announcement,
			item: { id: missingId },
			principal: Author.pointer(editor.id),
		}),
	).toBe(false)
	expect(
		await t.asMaster(() =>
			ultimabase.can({ operation: 'delete', schema: Announcement }),
		),
	).toBe(true)
	expect(
		await Announcement.findOneOrThrow({ where: { id: announcement.id } }),
	).toMatchObject({ title: 'Hello' })
	// The editor rule runs at execution time too.
	await expect(
		t.as(Author.pointer(writer.id), () =>
			Announcement.updateOne({
				where: { id: announcement.id },
				data: { title: 'Changed' },
			}),
		),
	).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
	expect(
		await t.as(Author.pointer(editor.id), () =>
			Announcement.updateOne({
				where: { id: announcement.id },
				data: { title: 'Changed' },
				select: { title: true },
			}),
		),
	).toStrictEqual({ id: announcement.id, title: 'Changed' })
})
