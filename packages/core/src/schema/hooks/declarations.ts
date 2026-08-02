import type { SchemaDefinition } from '../schema/definition.js'
import type { SchemaHooks } from './contracts.js'
import {
	normalizeHookDeclarations,
	type NormalizedHookDeclarations,
} from './normalization.js'

/** Lists accepted phases once so runtime validation and public diagnostics cannot drift. */
export const schemaHookPhases = [
	'resolveInput',
	'validate',
	'beforeOperation',
	'afterOperation',
	'beforeCreate',
	'afterCreate',
	'beforeUpdate',
	'afterUpdate',
	'beforeUpsert',
	'afterUpsert',
	'beforeDelete',
	'afterDelete',
	'beforeSave',
	'afterSave',
	'beforeFind',
	'afterFind',
	'beforeCommit',
	'afterCommit',
	'afterRollback',
	'onError',
] as const

/** Identifies every schema phase accepted at the declaration boundary. */
export type SchemaHookPhase = (typeof schemaHookPhases)[number]

/** Retains only validated handlers for later internal Runtime composition. */
export type SchemaHookDeclarations = NormalizedHookDeclarations<SchemaHookPhase>

const schemaHookDeclarations = new WeakMap<object, SchemaHookDeclarations>()

/** Attaches one normalized declaration to the exact Schema identity. */
export const declareSchemaHooks = <TSchema extends SchemaDefinition>(
	schema: TSchema,
	hooks: SchemaHooks<TSchema> | undefined,
): void => {
	const declarations = normalizeHookDeclarations({
		hooks,
		phases: schemaHookPhases,
		scope: 'schema',
	})

	if (declarations !== undefined) {
		schemaHookDeclarations.set(schema, declarations)
	}
}

/** Resolves private declarations for Core's Runtime domain only. */
export const getSchemaHookDeclarations = (
	schema: SchemaDefinition,
): SchemaHookDeclarations | undefined => schemaHookDeclarations.get(schema)
