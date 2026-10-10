import { isPlainRecord } from '@ultimabase/shared'
import { describe, expect, it, vi } from 'vitest'
import {
	createMasterDeleteFixture,
	createUpdateFixture,
	row,
} from '../../../tests/fixtures/schema-mutation-runtime.js'
import { applicationFixture } from '../../../tests/application-fixture.js'

import { provideTestDatabaseAdapter } from '../../../tests/runtime/fixtures/database-adapter-capability.js'
import { RecordingDatabaseAdapter } from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import { plugin } from '../../foundation.js'
import type { SchemaDefinition } from '../../schema/index.js'
import { UltimaBase } from '../application/ultima-base.js'
import { RequestContext, requestSources } from '../context/request-context.js'

describe('plugin schema mutation Runtime', () => {
	it('executes schema methods through owner-only update plans', async () => {
		const id = '0199325a-0c00-7000-8000-000000000101'
		const previous = row(id, 'published')
		const current = row(id, 'archived')
		const handler = vi.fn()
		const fixture = await createUpdateFixture({
			handler: (input) => {
				handler(input)
				return { data: { workflowState: 'archived' } }
			},
			results: [
				{
					materializations: [{ current, kind: 'update', previous }],
					status: 'fulfilled',
					target: previous,
					value: {
						id,
						title: current.title,
						workflowState: current.workflowState,
					},
				},
				{
					materializations: [{ current, kind: 'update', previous: current }],
					status: 'fulfilled',
					target: current,
					value: {
						id,
						title: current.title,
						workflowState: current.workflowState,
					},
				},
			],
		})
		const archive = Reflect.get(fixture.Post, 'archive') as (
			input: unknown,
		) => Promise<unknown>
		expect(Object.isFrozen(fixture.Post)).toBe(true)
		const selection = { title: true, workflowState: true }
		const result = await archive({
			id,
			input: { reason: 'superseded' },
			select: selection,
		})

		expect(result).toStrictEqual({
			id,
			title: 'Release notes',
			workflowState: 'archived',
		})
		// Results have no model methods: the schema runs the command (ADR-0310).
		expect(result).not.toHaveProperty('archive')
		await expect(
			archive({
				id,
				input: { reason: 'repeat' },
				select: { title: true, workflowState: true },
			}),
		).resolves.toMatchObject({ id })
		expect(handler).toHaveBeenCalledWith(
			expect.objectContaining({
				input: { reason: 'superseded' },
				originalItem: { id, title: 'Release notes' },
			}),
		)
		const handlerInput: unknown = handler.mock.calls[0]?.[0]
		expect(isPlainRecord(handlerInput)).toBe(true)
		if (!isPlainRecord(handlerInput))
			throw new TypeError('Expected handler input')
		expect(isPlainRecord(handlerInput.originalItem)).toBe(true)
		expect(Object.isFrozen(handlerInput.originalItem)).toBe(true)
		expect(Object.keys(handlerInput).sort()).toStrictEqual([
			'context',
			'input',
			'originalItem',
			'target',
		])
		expect(fixture.adapter.transactions).toHaveLength(2)
		expect(
			fixture.adapter.transactions[0]?.executions[0]?.operation,
		).toMatchObject({
			kind: 'update-one',
			update: {
				kind: 'update-expression',
				operations: [
					{ field: 'workflowState', kind: 'set', value: 'archived' },
				],
			},
		})
		expect(fixture.trace).toEqual([
			'adapter:begin',
			'prepare:delete-one',
			'handler',
			'execute:delete-one',
			'adapter:commit',
			'adapter:begin',
			'prepare:delete-one',
			'handler',
			'execute:delete-one',
			'adapter:commit',
		])

		await fixture.ultimabase.dispose()
	})

	it('hides missing targets and rolls back before invoking the handler', async () => {
		const handler = vi.fn()
		const fixture = await createUpdateFixture({
			handler,
			results: [{ status: 'fulfilled', target: null, value: null }],
		})
		const archive = Reflect.get(
			fixture.ultimabase.schema(fixture.Post),
			'archive',
		) as (input: unknown) => Promise<unknown>

		await expect(
			archive({
				id: '0199325a-0c00-7000-8000-000000000102',
				input: { reason: 'missing' },
			}),
		).rejects.toMatchObject({ code: 'NOT_FOUND' })
		expect(handler).not.toHaveBeenCalled()
		expect(fixture.trace.at(-1)).toBe('adapter:rollback')
	})

	it('rejects fields outside the exact mutation owner before persistence', async () => {
		const id = '0199325a-0c00-7000-8000-000000000103'
		const previous = row(id, 'published')
		const fixture = await createUpdateFixture({
			handler: () => ({ data: { title: 'forbidden' } }),
			results: [{ status: 'fulfilled', target: previous, value: previous }],
		})
		const archive = Reflect.get(
			fixture.ultimabase.schema(fixture.Post),
			'archive',
		) as (input: unknown) => Promise<unknown>

		await expect(
			archive({ id, input: { reason: 'invalid owner' } }),
		).rejects.toMatchObject({
			code: 'PLUGIN_OPERATION_INVALID',
			internalDetails: { field: 'title' },
		})
		expect(fixture.adapter.transactions[0]?.executions).toHaveLength(0)
		expect(fixture.trace.at(-1)).toBe('adapter:rollback')
	})

	it('exposes only the custom logical identity to Runtime behavior', async () => {
		const id = '0199325a-0c00-7000-8000-000000000104'
		const previous = row(id, 'published')
		const current = row(id, 'archived')
		const observed: string[] = []
		const observedResults: string[] = []
		const rewrites: string[] = []
		const fixture = await createUpdateFixture({
			observeOperation: (kind) => observed.push(kind),
			observeResult: (kind) => observedResults.push(kind),
			observeRewrite: (logical, physical) =>
				rewrites.push(`${logical}:${physical}`),
			results: [
				{
					materializations: [{ current, kind: 'update', previous }],
					status: 'fulfilled',
					target: previous,
					value: { id, title: current.title, workflowState: 'archived' },
				},
			],
		})
		const archive = Reflect.get(
			fixture.ultimabase.schema(fixture.Post),
			'archive',
		) as (input: unknown) => Promise<unknown>

		await archive({
			id,
			input: { reason: 'logical identity' },
			select: { title: true, workflowState: true },
		})

		expect(observed).toStrictEqual(['plugin-schema-mutation'])
		expect(observed).not.toContain('update-one')
		expect(observed).not.toContain('delete-one')
		expect(observedResults).toStrictEqual(['plugin-schema-mutation'])
		expect(rewrites).toStrictEqual(['plugin-schema-mutation:update-one'])
	})

	it('retains the protected row filter on the target lock', async () => {
		const id = '0199325a-0c00-7000-8000-000000000108'
		const previous = row(id, 'published')
		const current = row(id, 'archived')
		const fixture = await createUpdateFixture({
			protectedRowFilter: true,
			results: [
				{
					materializations: [{ current, kind: 'update', previous }],
					status: 'fulfilled',
					target: previous,
					value: current,
				},
			],
		})
		const archive = Reflect.get(
			fixture.ultimabase.schema(fixture.Post),
			'archive',
		) as (input: unknown) => Promise<unknown>

		await archive({ id, input: { reason: 'constrained' } })

		expect(fixture.adapter.transactions[0]?.requests[0]?.rowFilter).toEqual({
			field: 'title',
			kind: 'equal',
			value: 'visible',
		})
	})

	it('rolls back cancellation after the owner handler and before persistence', async () => {
		const controller = new AbortController()
		const handler = vi.fn()
		const id = '0199325a-0c00-7000-8000-000000000105'
		const fixture = await createUpdateFixture({
			handler: (input) => {
				handler(input)
				controller.abort()
				return { data: { workflowState: 'archived' } }
			},
			results: [
				{ status: 'fulfilled', target: row(id, 'published'), value: null },
			],
		})
		const archive = Reflect.get(
			fixture.ultimabase.schema(fixture.Post),
			'archive',
		) as (input: unknown, options: unknown) => Promise<unknown>
		const context = RequestContext.anonymous({
			requestId: 'cancelled-schema-mutation',
			signal: controller.signal,
			source: requestSources.internal,
		})

		await expect(
			archive(
				{
					id,
					input: { reason: 'cancelled' },
				},
				{ context },
			),
		).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' })
		expect(handler).toHaveBeenCalledOnce()
		expect(fixture.trace).toEqual([
			'adapter:begin',
			'prepare:delete-one',
			'handler',
			'adapter:rollback',
		])
	})

	it('keeps handler-started schema work inside the root transaction', async () => {
		const id = '0199325a-0c00-7000-8000-000000000109'
		const previous = row(id, 'published')
		const current = row(id, 'archived')
		const fixture = await createUpdateFixture({
			handler: async ({ target }) => {
				const schema = target.schema as SchemaDefinition &
					Readonly<{ findMany: () => Promise<unknown> }>
				await schema.findMany()
				return { data: { workflowState: 'archived' } }
			},
			results: [
				{
					materializations: [{ current, kind: 'update', previous }],
					status: 'fulfilled',
					target: previous,
					value: current,
				},
				{ status: 'fulfilled', value: [] },
			],
		})
		const archive = Reflect.get(
			fixture.ultimabase.schema(fixture.Post),
			'archive',
		) as (input: unknown) => Promise<unknown>

		await archive({ id, input: { reason: 'nested query' } })

		expect(fixture.adapter.rootRequests).toStrictEqual([])
		expect(
			fixture.adapter.transactions[0]?.requests.map(
				({ operation }) => operation.kind,
			),
		).toStrictEqual(['delete-one', 'find-many'])
		expect(fixture.trace.at(-1)).toBe('adapter:commit')
	})

	it('rejects missing handlers and unsupported persistence before request effects', async () => {
		const missingHandler = await createUpdateFixture({
			omitHandler: true,
			results: [],
			start: false,
		})
		await expect(missingHandler.ultimabase.start()).rejects.toMatchObject({
			code: 'PLUGIN_OPERATION_INVALID',
			internalDetails: { kind: 'schema-mutation-handler-missing' },
		})
		expect(missingHandler.trace).toStrictEqual([])

		const unsupportedAdapter = await createUpdateFixture({
			persistenceCapabilities: { persistencePlans: false },
			results: [],
			start: false,
		})
		await expect(unsupportedAdapter.ultimabase.start()).rejects.toThrow(
			'schema mutation persistence plan protocol version 2',
		)
		expect(unsupportedAdapter.trace).toStrictEqual([])
	})

	it('rejects Master-only deletes before lookup and compiles an audited delete plan', async () => {
		const id = '0199325a-0c00-7000-8000-000000000106'
		const previous = {
			createdAt: '2026-09-10T00:00:00.000Z',
			id,
			title: 'Release notes',
			updatedAt: '2026-09-10T00:00:00.000Z',
		}
		const fixture = await createMasterDeleteFixture({
			materializations: [{ kind: 'delete', previous }],
			status: 'fulfilled',
			target: previous,
			value: { id, title: previous.title },
		})
		const purge = Reflect.get(fixture.Post, 'purge') as (
			input: unknown,
			options?: unknown,
		) => Promise<unknown>

		await expect(purge({ id })).rejects.toMatchObject({
			code: 'MASTER_ACCESS_DENIED',
		})
		expect(fixture.trace).toStrictEqual([])
		expect(fixture.handler).not.toHaveBeenCalled()

		await expect(
			purge({ id, select: { title: true } }, { useMasterKey: true }),
		).resolves.toMatchObject({ id, title: 'Release notes' })
		expect(fixture.audit).toHaveBeenCalledOnce()
		expect(fixture.handler).toHaveBeenCalledOnce()
		expect(fixture.adapter.transactions[0]?.executions[0]?.operation.kind).toBe(
			'delete-one',
		)
		await fixture.ultimabase.dispose()
		expect(Reflect.has(fixture.Post, 'purge')).toBe(false)
		const otherAdapter = new RecordingDatabaseAdapter([], [])
		const other = applicationFixture(
			new (UltimaBase.use(
				plugin({
					contributions: [provideTestDatabaseAdapter(otherAdapter)],
					core: '^0.0.0',
					id: 'fixture.schema-mutation-without-purge',
					version: '1.0.0',
				}),
			))({ pluginPrivileges: { logger: false }, schemas: [fixture.Post] }),
		)
		try {
			await other.start()
			await expect(purge({ id }, { useMasterKey: true })).rejects.toThrow(
				`Schema mutation ${fixture.Post.className}.purge is not installed in this application`,
			)
			expect(otherAdapter.rootRequests).toStrictEqual([])
		} finally {
			await Promise.all([other.dispose(), fixture.ultimabase.dispose()])
		}
	})

	it('rejects a stale application handle before transaction effects', async () => {
		const firstHandler = vi.fn()
		const first = await createUpdateFixture({
			handler: firstHandler,
			results: [],
		})
		const archive = Reflect.get(
			first.ultimabase.schema(first.Post),
			'archive',
		) as (input: unknown) => Promise<unknown>
		await first.ultimabase.dispose()
		const second = await createUpdateFixture({ results: [] })
		try {
			await expect(
				archive({
					id: '0199325a-0c00-7000-8000-000000000107',
					input: { reason: 'stale owner' },
				}),
			).rejects.toThrow('Application handle cannot be used after disposal')
			expect(firstHandler).not.toHaveBeenCalled()
			expect(first.trace).toStrictEqual([])
			expect(second.trace).toStrictEqual([])
		} finally {
			await second.ultimabase.dispose()
		}
	})
})
