import {
	contributeApplication,
	plugin,
	withPluginPrivileges,
	type SchemaDefinition,
} from '@ultimabase/core'
import { postgresConstraintCompiler } from '@ultimabase/postgres-plugin'
import { isPlainRecord } from '@ultimabase/shared'

import { softDeleteVisibilityConstraintKind } from './open-kernel-soft-delete.js'

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
	return plugin({
		core: '^0.0.0',
		instanceId: options.instanceId,
		id: 'fixture.open-kernel-soft-delete-postgres',
		permissions: {
			'adapter:consume': 'Compiles tombstone visibility.',
		},
		contributions: [
			withPluginPrivileges(
				contributeApplication(({ constraintCompilers }) => {
					constraintCompilers.register(compiler)
					return { exports: undefined }
				}),
				['adapter:consume'],
			),
		],
		version: '1.0.0',
	})
}
