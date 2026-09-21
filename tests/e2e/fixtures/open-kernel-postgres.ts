import { definePlugin, type SchemaDefinition } from '@ultimabase/core'
import {
	postgresConstraintCompiler,
	postgresPhysicalColumn,
} from '@ultimabase/postgres-plugin'
import { isPlainRecord } from '@ultimabase/shared'

import { softDeleteVisibilityConstraintKind } from './open-kernel-soft-delete.js'

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

/** Compiles the plugin-owned tombstone visibility constraint for PostgreSQL. */
export const createSoftDeletePostgresPlugin = (
	options: SoftDeletePostgresOptions,
) => {
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
		core: '^0.0.0',
		instanceId: options.instanceId,
		pluginId: 'fixture.open-kernel-soft-delete-postgres',
		privileges: [
			{ name: 'adapter:consume', reason: 'Compiles tombstone visibility.' },
		] as const,
		setup: ({ constraintCompilers }) => {
			constraintCompilers.register(compiler)
		},
		version: '1.0.0',
	})
}

export interface ValuePostgresOptions {
	readonly instanceId: string
	readonly table: string
	readonly version: '1.0.0' | '2.0.0'
}

/** Contributes inspectable physical metadata with exact instance and version attribution. */
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
	return definePlugin({
		capabilities: {
			provides: [physical],
		},
		core: '^0.0.0',
		instanceId: options.instanceId,
		pluginId: 'fixture.open-kernel-value-postgres',
		privileges: [
			{ name: 'adapter:consume', reason: 'Adds decimal physical metadata.' },
		] as const,
		version: options.version,
	})
}
