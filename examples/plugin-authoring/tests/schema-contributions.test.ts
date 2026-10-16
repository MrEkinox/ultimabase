import { testApplication } from '@ultimabase/testing'
import { afterEach, expect, it, vi } from 'vitest'

import { Comment, Post } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'

afterEach(() => {
	vi.restoreAllMocks()
})

it('adds a server-written field and its commands with archivable: true', async () => {
	await using t = await testApplication(ultimabase)
	const post = await Post.createOne({ data: { title: 'Draft' } })
	expect(post.archivedAt).toBeNull()

	//#region archive-one
	const archived = await Post.archiveOne({ id: post.id })
	//#endregion archive-one

	expect(archived.archivedAt).toEqual(expect.any(String))
	await t.afterCommit()
})

it('archives every matching row with archiveMany', async () => {
	await using t = await testApplication(ultimabase)
	await Post.createMany({ data: [{ title: 'Old' }, { title: 'Older' }] })

	//#region archive-many
	const archivedPosts = await Post.archiveMany({
		where: { title: { in: ['Old'] } },
	})
	//#endregion archive-many

	expect(archivedPosts).toHaveLength(1)
	expect(await Post.count({ where: { archivedAt: { isNotNull: true } } })).toBe(
		1,
	)
	await t.afterCommit()
})

it('rejects the server-written field in create input', async () => {
	await using t = await testApplication(ultimabase)
	await expect(
		Post.createOne({
			// @ts-expect-error -- `archivedAt` is written by the plugin only.
			data: { title: 'Forged', archivedAt: new Date().toISOString() },
		}),
	).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
	await t.afterCommit()
})

it('runs afterCommit with the schema rules after each committed write', async () => {
	await using t = await testApplication(ultimabase)
	const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
	await Post.createOne({ data: { title: 'Audited' } })
	await Comment.createOne({ data: { body: 'Not audited' } })
	await t.afterCommit()
	// Post calls `.with({ audit: true })`; Comment has no `audit` rule.
	expect(info.mock.calls).toStrictEqual([['[audit] Post create-one']])
})

it('gives flaggable schemas a readable, server-written flagged field', async () => {
	await using t = await testApplication(ultimabase)
	const comment = await Comment.createOne({ data: { body: 'Hello' } })
	expect(comment.flagged).toBe(false)
	await expect(
		Comment.createOne({
			// @ts-expect-error -- `mutationInput: 'forbidden'` reserves the field.
			data: { body: 'Forged', flagged: true },
		}),
	).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
	// A schema without `flaggable: true` gains neither the field nor the rule.
	expect(Object.keys((await Post.findOne({})) ?? {})).not.toContain('flagged')
	await t.afterCommit()
})

it('adds the commands only to the schemas that set the feature', () => {
	const surfaces = ultimabase.compile().schemaSurfaces
	expect(
		surfaces.map(({ schema, schemaMutations }) => [
			schema.className,
			[...schemaMutations.keys()],
		]),
	).toStrictEqual([
		['Post', ['archiveOne', 'archiveMany']],
		['Comment', []],
	])
	// Mutation names come from the package name, the method and the command.
	expect(surfaces[0]?.schemaMutations.get('archiveOne')?.mutation.name).toBe(
		'example.archive-plugin.archivable.archive-one',
	)
})

it('exposes a one-row command where the schema names it', async () => {
	await using t = await testApplication(ultimabase)
	const [first, second] = await Post.createMany({
		data: [{ title: 'Over REST' }, { title: 'Over GraphQL' }],
	})
	if (first === undefined || second === undefined)
		throw new TypeError('Missing posts')

	//#region archive-over-http
	const rest = await t.fetch(`/api/classes/Post/${first.id}/archive-one`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: '{}',
	})
	const graphql = await t.fetch('/graphql', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			query: `mutation { archiveOnePost(input: { id: "${second.id}" }) { id } }`,
		}),
	})
	//#endregion archive-over-http

	expect(rest.status).toBe(200)
	expect(await rest.json()).toMatchObject({ result: { id: first.id } })
	expect(await graphql.json()).toStrictEqual({
		data: { archiveOnePost: { id: second.id } },
	})
	expect(await Post.count({ where: { archivedAt: { isNotNull: true } } })).toBe(
		2,
	)
	// `archiveMany` stays off both transports: the schema does not name it.
	const many = await t.fetch(`/api/classes/Post/${first.id}/archive-many`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: '{}',
	})
	expect(many.status).toBe(404)
	await t.afterCommit()
})
