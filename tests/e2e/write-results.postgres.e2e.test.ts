import { accessPlugin } from '@ultimabase/access-plugin'
import { MasterAuthority, UltimaBase } from '@ultimabase/core'
import {
	httpApplicationCapability,
	httpApplicationIdHeader,
	httpPlugin,
	type HttpApplication,
	type HttpOriginalHeader,
} from '@ultimabase/http-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { restPlugin } from '@ultimabase/rest-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	createPostgresWorkerFixture,
	type PostgresWorkerFixture,
} from '../fixtures/postgres-worker-fixture.js'
import {
	contributeApplication,
	plugin,
	requireCapability,
} from '@ultimabase/core/plugin'

// ADR-0341, decision 1: a write without `select` returns `{ id }`, so a caller
// that may write a row but not read it still succeeds. An explicit selection
// beyond `id` keeps the ADR-0306 check.
const App = UltimaBase.use(
	softDeletePlugin(),
	accessPlugin({ allowWithoutRule: { all: true } }),
	restPlugin(),
)

const Entry = App.Schema.define({
	className: 'WriteResultEntry',
	fields: (field) => ({
		title: field.string({ indexed: 'unique', required: true }),
		visible: field.boolean({ default: true }),
	}),
}).with({
	access: { read: ({ where }) => where.eq('visible', true) },
	rest: {
		createMany: true,
		deleteMany: true,
		updateMany: true,
		upsertMany: true,
		upsertOne: true,
	},
})

const Draft = App.Schema.define({
	className: 'WriteResultDraft',
	fields: (field) => ({ title: field.string({ required: true }) }),
	softDelete: { mode: 'command' },
}).with({
	access: { read: false },
	rest: { softDeleteOne: true },
})

const httpRequirement = requireCapability(httpApplicationCapability, '^1.0.0', {
	phase: 'setup',
})
const capture: { current?: HttpApplication } = {}
const capturePlugin = plugin({
	core: '^0.0.0',
	id: 'fixture.write-results-capture',
	version: '1.0.0',
	contributions: [
		httpRequirement,
		contributeApplication(({ capabilities }) => {
			capture.current = capabilities.get(httpRequirement)
			return { exports: undefined }
		}),
	],
})

const appId = 'write-results'
const createApplication = (fixture: PostgresWorkerFixture) =>
	new (App.use(
		httpPlugin({ appId }),
		capturePlugin,
		postgresPlugin({ pool: fixture.pool, schemaPolicy: 'override' }),
	))({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'write-results', value: 'write-results-master-secret' }],
			onUse: () => undefined,
		}),
		logger: false,
		schemas: [Entry, Draft],
	})

let fixture: PostgresWorkerFixture | undefined
let ultimabase: ReturnType<typeof createApplication> | undefined
const master = { useMasterKey: true } as const
const unreadable = {
	code: 'PERMISSION_DENIED',
	publicMessage:
		'The WriteResultEntry result is not readable by the caller: request select: { id: true } or review the WriteResultEntry read rule.',
}
const anyId = { id: expect.any(String) as unknown }

const hidden = (title: string) => ({ title, visible: false })

const storedTitles = async (prefix: string): Promise<readonly string[]> =>
	(
		await Entry.findMany(
			{ where: { title: { startsWith: prefix } }, select: { title: true } },
			master,
		)
	)
		.map(({ title }) => title)
		.toSorted()

const fetchApplication = async (
	path: string,
	method: string,
	body?: unknown,
): Promise<Readonly<{ body: unknown; status: number }>> => {
	if (capture.current === undefined) throw new TypeError('HTTP unavailable')
	const headers = new Headers({ [httpApplicationIdHeader]: appId })
	if (body !== undefined) headers.set('content-type', 'application/json')
	const originalHeaders: HttpOriginalHeader[] = [...headers.entries()]
	const response = await capture.current.fetch({
		originalHeaders,
		request: new Request(`https://example.test/api/classes/${path}`, {
			method,
			headers,
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		}),
	})
	return { body: await response.json(), status: response.status }
}

beforeAll(async () => {
	fixture = await createPostgresWorkerFixture({ prefix: 'write_results' })
	ultimabase = createApplication(fixture)
	await ultimabase.start()
}, 30_000)

afterAll(async () => {
	await ultimabase?.dispose()
	await fixture?.dispose()
})

describe('a write returns { id } unless it selects more (ADR-0341)', () => {
	it('returns { id } for every single-row write on a row read hides', async () => {
		const created = await Entry.createOne({ data: hidden('one-create') })
		expect(created).toStrictEqual(anyId)

		await expect(
			Entry.updateOne({
				where: { id: { eq: created.id } },
				data: { title: 'one-updated' },
			}),
		).resolves.toStrictEqual({ id: created.id })
		await expect(
			Entry.upsertOne({
				where: { title: 'one-upserted' },
				create: hidden('one-upserted'),
				update: { visible: false },
			}),
		).resolves.toStrictEqual(anyId)
		await expect(storedTitles('one-')).resolves.toStrictEqual([
			'one-updated',
			'one-upserted',
		])

		await expect(
			Entry.deleteOne({ where: { id: { eq: created.id } } }),
		).resolves.toStrictEqual({ id: created.id })
		await expect(storedTitles('one-')).resolves.toStrictEqual(['one-upserted'])
	})

	it('returns [{ id }] for every collection write on rows read hides', async () => {
		const created = await Entry.createMany({
			data: [hidden('many-a'), { title: 'many-b' }],
		})
		expect(created).toStrictEqual([anyId, anyId])
		const ids = created.map(({ id }) => id)

		await expect(
			Entry.updateMany({
				data: ids.map((id) => ({
					where: { id: { eq: id } },
					data: { visible: false },
				})),
			}),
		).resolves.toStrictEqual(ids.map((id) => ({ id })))
		await expect(
			Entry.upsertMany({
				data: [
					{
						where: { title: 'many-c' },
						create: hidden('many-c'),
						update: { visible: false },
					},
				],
			}),
		).resolves.toStrictEqual([anyId])
		await expect(
			Entry.deleteMany({ where: ids.map((id) => ({ id: { eq: id } })) }),
		).resolves.toStrictEqual(ids.map((id) => ({ id })))
		await expect(storedTitles('many-')).resolves.toStrictEqual(['many-c'])
	})

	it('still refuses and rolls back an explicit selection beyond id', async () => {
		await expect(
			Entry.createOne({ data: hidden('explicit-a'), select: { title: true } }),
		).rejects.toMatchObject(unreadable)
		// An explicit empty selection asks for every field, like a read.
		await expect(
			Entry.createOne({ data: hidden('explicit-b'), select: {} }),
		).rejects.toMatchObject(unreadable)
		await expect(
			Entry.createMany({
				data: [hidden('explicit-c')],
				select: { visible: false },
			}),
		).rejects.toMatchObject(unreadable)
		const { id } = await Entry.createOne({ data: hidden('explicit-d') })
		await expect(
			Entry.updateOne({
				where: { id: { eq: id } },
				data: { title: 'explicit-e' },
				select: { title: true },
			}),
		).rejects.toMatchObject(unreadable)
		await expect(
			Entry.deleteOne({ where: { id: { eq: id } }, select: { title: true } }),
		).rejects.toMatchObject(unreadable)

		await expect(storedTitles('explicit-')).resolves.toStrictEqual([
			'explicit-d',
		])
	})

	it('gives Master the same default and its selections', async () => {
		await expect(
			Entry.createOne({ data: hidden('master-a') }, master),
		).resolves.toStrictEqual(anyId)
		await expect(
			Entry.createOne(
				{ data: hidden('master-b'), select: { title: true } },
				master,
			),
		).resolves.toStrictEqual({ ...anyId, title: 'master-b' })
	})

	it('applies the default to plugin commands and keeps their pre-image check', async () => {
		const { id } = await Draft.createOne({ data: { title: 'draft' } })

		await expect(
			Draft.softDeleteOne({ id, select: { title: true } }),
		).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		await expect(Draft.softDeleteOne({ id })).resolves.toStrictEqual({ id })
		await expect(
			Draft.count({ where: { isDeleted: { eq: true } } }, master),
		).resolves.toBe(1)
	})

	it('answers REST writes without select with { id }', async () => {
		const created = await fetchApplication('WriteResultEntry', 'POST', {
			...hidden('rest-a'),
		})
		expect(created).toStrictEqual({ body: { result: anyId }, status: 201 })
		const { id } = (created.body as { result: { id: string } }).result

		await expect(
			fetchApplication(`WriteResultEntry/${id}`, 'PATCH', {
				title: 'rest-b',
			}),
		).resolves.toStrictEqual({ body: { result: { id } }, status: 200 })
		await expect(
			fetchApplication(`WriteResultEntry/${id}?select=title`, 'PATCH', {
				title: 'rest-c',
			}),
		).resolves.toMatchObject({ status: 403 })
		await expect(
			fetchApplication('WriteResultEntry/upsert', 'POST', {
				where: { title: 'rest-d' },
				create: hidden('rest-d'),
				update: { visible: false },
			}),
		).resolves.toStrictEqual({ body: { result: anyId }, status: 200 })
		await expect(
			fetchApplication(`WriteResultEntry/${id}`, 'DELETE'),
		).resolves.toStrictEqual({ body: { result: { id } }, status: 200 })

		const bulk = await fetchApplication(
			'WriteResultEntry/bulk/create',
			'POST',
			{
				data: [hidden('rest-e'), hidden('rest-f')],
			},
		)
		expect(bulk).toStrictEqual({
			body: { results: [anyId, anyId] },
			status: 201,
		})
		const ids = (bulk.body as { results: { id: string }[] }).results.map(
			(result) => result.id,
		)
		await expect(
			fetchApplication('WriteResultEntry/bulk/update', 'POST', {
				data: ids.map((entry) => ({
					where: { id: { eq: entry } },
					data: { visible: false },
				})),
			}),
		).resolves.toStrictEqual({
			body: { results: ids.map((entry) => ({ id: entry })) },
			status: 200,
		})
		await expect(
			fetchApplication('WriteResultEntry/bulk/upsert', 'POST', {
				data: [
					{
						where: { title: 'rest-g' },
						create: hidden('rest-g'),
						update: { visible: false },
					},
				],
			}),
		).resolves.toStrictEqual({ body: { results: [anyId] }, status: 200 })
		await expect(
			fetchApplication('WriteResultEntry/bulk/delete', 'POST', {
				where: ids.map((entry) => ({ id: { eq: entry } })),
			}),
		).resolves.toStrictEqual({
			body: { results: ids.map((entry) => ({ id: entry })) },
			status: 200,
		})
		await expect(storedTitles('rest-')).resolves.toStrictEqual([
			'rest-d',
			'rest-g',
		])
	})

	it('answers a REST plugin command without select with { id }', async () => {
		const { id } = await Draft.createOne({ data: { title: 'rest-draft' } })

		await expect(
			fetchApplication(`WriteResultDraft/${id}/soft-delete-one`, 'POST', {}),
		).resolves.toStrictEqual({ body: { result: { id } }, status: 200 })
	})
})
