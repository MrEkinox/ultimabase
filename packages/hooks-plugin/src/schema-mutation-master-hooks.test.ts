import {
	MasterAuthority,
	Schema,
	UltimaBase,
	contributeSchemaMutation,
	databaseAdapterCapability,
	defineOperationValue,
	definePlugin,
	defineSchemaMutation,
	provideCapability,
} from '@ultimabase/core'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import { expect, it, vi } from 'vitest'

import { hooksPlugin } from './index.js'
import type { HookContext } from './index.js'
import {
	SchemaMutationHookAdapter,
	schemaMutationHookId,
} from './schema-mutation-hooks.test-support.js'

interface MasterMutationHookInput {
	readonly context: HookContext
	readonly item: Readonly<Record<string, unknown>> | null
}

it('runs Master-only delete mutations through their custom branch', async () => {
	const trace: string[] = []
	const customInputs: MasterMutationHookInput[] = []
	const nativeDelete = vi.fn()
	const purge = defineSchemaMutation({
		authority: 'master',
		effect: 'delete',
		input: defineOperationValue((value, path) => {
			if (!isPlainRecord(value) || typeof value.reason !== 'string') {
				throw new TypeError(`${path}.reason must be a string`)
			}
			return immutableRecord({ reason: value.reason })
		}),
		name: 'fixture.schema-mutation-hook.purge',
		returning: 'before',
		version: '1.0.0',
	})
	const inlineHooks: unknown = {
		afterOperation: {
			delete: nativeDelete,
			purge: (input: MasterMutationHookInput) => {
				trace.push('purge:after')
				customInputs.push(input)
			},
		},
		beforeOperation: {
			delete: nativeDelete,
			purge: (input: MasterMutationHookInput) => {
				trace.push('purge:before')
				customInputs.push(input)
			},
		},
	}
	const Document = Schema.define({
		className: 'SchemaMutationPurgeHookDocument',
		fields: (field) => ({
			title: field.string(),
			workflowState: field.string(),
		}),
		...(inlineHooks === undefined ? {} : { hooks: inlineHooks as never }),
	})
	const owner = definePlugin({
		operations: [
			contributeSchemaMutation({
				mutation: purge,
				resolve: (): undefined => {
					trace.push('handler')
					return undefined
				},
			}),
		],
		core: '^0.0.0',
		declare: ({ models }) => {
			models.extend(Document, {
				contributionId: 'purge-surface',
				schemaMutations: {
					purge: { mutation: purge, surfaces: ['schema'] },
				},
			})
		},
		pluginId: 'fixture.schema-mutation-purge-owner',
		privileges: [
			{ name: 'model:extend', reason: 'Adds purge.' },
			{ name: 'operation:declare', reason: 'Declares purge.' },
			{ name: 'persistence:rewrite', reason: 'Persists purge.' },
		] as const,
		version: '1.0.0',
	})
	const adapter = new SchemaMutationHookAdapter(trace)
	const database = definePlugin({
		capabilities: [
			provideCapability(databaseAdapterCapability, {
				contributionId: 'database-adapter',
				create: () => ({ value: adapter }),
			}),
		],
		core: '^0.0.0',
		pluginId: 'fixture.schema-mutation-purge-database',
		version: '1.0.0',
	})
	const audit = vi.fn()
	const ultimabase = new UltimaBase({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'schema-mutation-purge-master', value: 'unused' }],
			onUse: audit,
		}),
		pluginPrivileges: { logger: false },
		plugins: [hooksPlugin(), owner, database],
		schemas: [Document],
	})

	try {
		await ultimabase.start()
		const execute = Reflect.get(ultimabase.schema(Document), 'purge') as (
			input: unknown,
			options: unknown,
		) => Promise<unknown>
		await expect(
			execute(
				{
					id: schemaMutationHookId,
					input: { reason: 'expired' },
					select: { title: true, workflowState: true },
				},
				{ useMasterKey: true },
			),
		).resolves.toMatchObject({ title: 'Release notes' })
		expect(trace).toStrictEqual([
			'begin',
			'prepare:delete-one',
			'handler',
			'purge:before',
			'execute:delete-one',
			'purge:after',
			'commit',
		])
		expect(customInputs).toHaveLength(2)
		expect(customInputs.every(({ item }) => item === null)).toBe(true)
		expect(nativeDelete).not.toHaveBeenCalled()
		expect(audit).toHaveBeenCalledOnce()
	} finally {
		await ultimabase.dispose()
	}
})
