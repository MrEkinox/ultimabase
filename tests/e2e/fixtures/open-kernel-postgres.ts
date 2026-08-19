import {
	type AdapterAccess,
	defineOperation,
	defineOperationValue,
	definePlugin,
	type PluginOperationExecutionTarget,
	requireCapability,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	postgresConstraintCompiler,
	postgresPhysicalColumn,
	postgresRawAdapterCapability,
	postgresUpgrade,
} from '@ultimabase/postgres-plugin'
import { providePluginOperation } from '@ultimabase/plugin-kit'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import { softDeleteVisibilityConstraintKind } from './open-kernel-soft-delete.js'

const postgresRaw = requireCapability(postgresRawAdapterCapability, '^1.0.0')

const actionInput = defineOperationValue((value, path): Readonly<object> => {
	if (!isPlainRecord(value) || Reflect.ownKeys(value).length !== 0) {
		throw new TypeError(`${path} must be an empty object`)
	}
	return immutableRecord({})
})
const actionResult = defineOperationValue(
	(value, path): Readonly<{ readonly changed: boolean }> => {
		if (!isPlainRecord(value) || typeof value.changed !== 'boolean') {
			throw new TypeError(`${path}.changed must be a boolean`)
		}
		return immutableRecord({ changed: value.changed })
	},
)

const restoreSoftDeletedModel = defineOperation({
	input: actionInput,
	name: 'fixture.soft-delete-postgres.restore',
	result: actionResult,
	target: 'model',
	transaction: 'required',
	version: '1.0.0',
})
const purgeSoftDeletedModel = defineOperation({
	input: actionInput,
	name: 'fixture.soft-delete-postgres.purge',
	result: actionResult,
	target: 'model',
	transaction: 'required',
	version: '1.0.0',
})

const assertIdentifier = (value: string, path: string): string => {
	if (!/^[a-z][a-z0-9_]*$/u.test(value)) {
		throw new TypeError(`${path} must be a lowercase PostgreSQL identifier`)
	}
	return value
}

export interface SoftDeletePostgresOptions {
	readonly instanceId: string
	readonly schema: SchemaDefinition
	readonly table: string
}

const readModelIdentity = (
	target: PluginOperationExecutionTarget,
): Readonly<{ readonly id: string; readonly schema: string }> => {
	if (target.kind !== 'model') {
		throw new TypeError('Soft-delete commands require a model handle')
	}
	const id: unknown = 'id' in target.model ? target.model.id : undefined
	if (typeof id !== 'string') {
		throw new TypeError('Soft-delete commands require a persisted model')
	}
	return { id, schema: target.schema.className }
}

const changeSoftDeleteState = async (
	action: 'purge' | 'restore',
	adapters: AdapterAccess,
	options: SoftDeletePostgresOptions,
	table: string,
	target: PluginOperationExecutionTarget,
): Promise<Readonly<{ readonly changed: boolean }>> => {
	const identity = readModelIdentity(target)
	if (identity.schema !== options.schema.className) {
		throw new TypeError('Unknown soft-delete schema')
	}
	return adapters.withRaw(postgresRaw, async (raw) => {
		if (raw.scope !== 'transaction') {
			throw new TypeError(`Soft-delete ${action} requires a transaction`)
		}
		const query =
			action === 'purge'
				? `DELETE FROM "${table}" WHERE "id" = $1 AND "isDeleted" = TRUE RETURNING "id"`
				: `UPDATE "${table}" SET "isDeleted" = FALSE WHERE "id" = $1 AND "isDeleted" = TRUE RETURNING "id"`
		const result = await raw.query(query, [identity.id])
		return { changed: result.rows.length === 1 }
	})
}

/** Owns PostgreSQL restore/purge commands and compiles tombstone visibility. */
export const createSoftDeletePostgresPlugin = (
	options: SoftDeletePostgresOptions,
) => {
	const table = assertIdentifier(options.table, 'soft-delete table')
	const compiler = postgresConstraintCompiler({
		compile: ({ field, sql }) => sql`${field('isDeleted')} = ${false}`,
		decode: (payload) => {
			if (!isPlainRecord(payload) || payload.field !== 'isDeleted') {
				throw new TypeError('Invalid soft-delete visibility payload')
			}
			return { field: 'isDeleted' as const }
		},
		kind: softDeleteVisibilityConstraintKind,
		version: 1,
	})
	return definePlugin({
		capabilities: {
			provides: [
				providePluginOperation({
					contributionId: 'postgres-restore',
					create: () => ({
						execute: ({ adapters, target }) =>
							changeSoftDeleteState(
								'restore',
								adapters,
								options,
								table,
								target,
							),
					}),
					operation: restoreSoftDeletedModel,
				}),
				providePluginOperation({
					contributionId: 'postgres-purge',
					create: () => ({
						execute: ({ adapters, target }) =>
							changeSoftDeleteState('purge', adapters, options, table, target),
					}),
					operation: purgeSoftDeletedModel,
				}),
			],
			requires: [postgresRaw],
		},
		core: '^0.0.0',
		declare: ({ models, operations }) => {
			operations.declare(restoreSoftDeletedModel)
			operations.declare(purgeSoftDeletedModel)
			models.extend(options.schema, {
				contributionId: 'postgres-soft-delete-commands',
				modelCommands: {
					purge: purgeSoftDeletedModel,
					restore: restoreSoftDeletedModel,
				},
			})
		},
		instanceId: options.instanceId,
		pluginId: 'fixture.open-kernel-soft-delete-postgres',
		privileges: [
			{ name: 'adapter:consume', reason: 'Compiles tombstone visibility.' },
			{
				name: 'adapter:raw',
				reason: 'Restores and purges inside Runtime transactions.',
			},
			{
				name: 'model:extend',
				reason: 'Adds PostgreSQL restore and purge commands.',
			},
			{
				name: 'operation:declare',
				reason: 'Declares PostgreSQL restore and purge.',
			},
		] as const,
		setup: ({ constraintCompilers }) => {
			constraintCompilers.register(compiler)
		},
		version: '1.0.0',
	})
}

export interface ValuePostgresOptions {
	readonly includeUpgrade?: boolean
	readonly instanceId: string
	readonly table: string
	readonly version: '1.0.0' | '2.0.0'
}

/** Contributes inspectable physical metadata and optional explicit upgrade intent. */
export const createValuePostgresPlugin = (options: ValuePostgresOptions) => {
	const table = assertIdentifier(options.table, 'value metadata table')
	const physical = postgresPhysicalColumn({
		column: { name: 'amount_sort_key', nullable: true, type: 'numeric' },
		contributionId: 'decimal-sort-key',
		normalizedStaticOptions: {
			format: options.version === '1.0.0' ? 'numeric-v1' : 'numeric-v2',
		},
		table,
	})
	const upgrade = postgresUpgrade({
		contributionId: 'decimal-sort-key-v2',
		from: '^1.0.0',
		intent: { strategy: 'recompute-decimal-sort-key' },
		target: {
			contributionId: 'decimal-sort-key',
			instanceId: options.instanceId,
			pluginId: 'fixture.open-kernel-value-postgres',
		},
		to: '2.0.0',
	})
	return definePlugin({
		capabilities: {
			provides: [
				physical,
				...(options.includeUpgrade === true ? [upgrade] : []),
			],
		},
		core: '^0.0.0',
		instanceId: options.instanceId,
		pluginId: 'fixture.open-kernel-value-postgres',
		privileges: [
			{ name: 'adapter:consume', reason: 'Adds decimal physical metadata.' },
			...(options.includeUpgrade === true
				? ([
						{
							name: 'migration:contribute',
							reason: 'Declares the decimal metadata upgrade.',
						},
					] as const)
				: []),
		] as const,
		version: options.version,
	})
}
