import {
	MasterAuthority,
	UltimaBase,
	databaseAdapterCapability,
} from '@ultimabase/core'
import {
	contributeSchemaMutation,
	defineOperationValue,
	plugin,
	contributeDeclarations,
	defineSchemaMutation,
	provideCapability,
} from '@ultimabase/core/plugin'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import { expect, it, vi } from 'vitest'

import { hooksPlugin } from '../src/index.js'
import type { HookContext } from '../src/index.js'
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
	const HookSchemaApplication = UltimaBase.use(hooksPlugin())
	const Document = HookSchemaApplication.Schema.define({
		className: 'SchemaMutationPurgeHookDocument',
		fields: (field) => ({
			title: field.string(),
			workflowState: field.string(),
		}),
	}).with({ hooks: inlineHooks as never })
	const owner = plugin({
		core: '^0.0.0',
		id: 'fixture.schema-mutation-purge-owner',
		permissions: {
			'model:extend': 'Adds purge.',
			'operation:declare': 'Declares purge.',
			'persistence:rewrite': 'Persists purge.',
		},
		version: '1.0.0',
		contributions: [
			contributeSchemaMutation({
				mutation: purge,
				resolve: (): undefined => {
					trace.push('handler')
					return undefined
				},
			}),
			contributeDeclarations({
				models: ({ models }) => {
					models.extend(Document, {
						contributionId: 'purge-surface',
						schemaMutations: {
							purgeOne: { mutation: purge, surfaces: ['schema'] },
						},
					})

					return undefined
				},
			}),
		],
	})
	const adapter = new SchemaMutationHookAdapter(trace)
	const database = plugin({
		core: '^0.0.0',
		id: 'fixture.schema-mutation-purge-database',
		version: '1.0.0',
		contributions: [
			provideCapability(databaseAdapterCapability, {
				contributionId: 'database-adapter',
				create: () => ({ value: adapter }),
			}),
		],
	})
	const audit = vi.fn()
	const ultimabase = new (HookSchemaApplication.use(owner, database))({
		masterAuthority: new MasterAuthority({
			keys: [{ id: 'schema-mutation-purge-master', value: 'unused' }],
			onUse: audit,
		}),
		logger: false,
		schemas: [Document],
	})

	try {
		await ultimabase.start()
		const execute = Reflect.get(ultimabase.schema(Document), 'purgeOne') as (
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
