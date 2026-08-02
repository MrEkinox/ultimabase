import {
	immutableRecord,
	isPlainRecord,
	type MaybePromise,
} from '@ultimabase/shared'

import type { SchemaDefinition } from '../schema/definition.js'
import type { SchemaHooks } from './contracts.js'

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

type ErasedSchemaHookHandler = (input: never) => MaybePromise<unknown>

/** Retains only validated handlers for later internal Runtime composition. */
export type SchemaHookDeclarations = Readonly<
	Partial<Record<SchemaHookPhase, ErasedSchemaHookHandler>>
>

const schemaHookPhaseSet = new Set<string>(schemaHookPhases)
const schemaHookDeclarations = new WeakMap<object, SchemaHookDeclarations>()

/** Copies a developer declaration without executing or exposing its handlers. */
const normalizeSchemaHookDeclarations = (
	hooks: unknown,
): SchemaHookDeclarations | undefined => {
	if (hooks === undefined) {
		return undefined
	}

	if (!isPlainRecord(hooks)) {
		throw new TypeError('hooks must be a plain object')
	}

	const entries: [SchemaHookPhase, ErasedSchemaHookHandler][] = []

	for (const key of Reflect.ownKeys(hooks)) {
		if (typeof key !== 'string') {
			throw new TypeError('hooks contains an unsupported symbol key')
		}

		if (!schemaHookPhaseSet.has(key)) {
			throw new TypeError(`Unknown schema hook: hooks.${key}`)
		}

		const handler: unknown = hooks[key]

		if (typeof handler !== 'function') {
			throw new TypeError(`hooks.${key} must be a function`)
		}

		// Runtime narrows the phase before invoking this identity-retained handler.
		entries.push([key as SchemaHookPhase, handler as ErasedSchemaHookHandler])
	}

	return entries.length === 0
		? undefined
		: immutableRecord(Object.fromEntries(entries))
}

/** Attaches one normalized declaration to the exact Schema identity. */
export const declareSchemaHooks = <TSchema extends SchemaDefinition>(
	schema: TSchema,
	hooks: SchemaHooks<TSchema> | undefined,
): void => {
	const declarations = normalizeSchemaHookDeclarations(hooks)

	if (declarations !== undefined) {
		schemaHookDeclarations.set(schema, declarations)
	}
}

/** Resolves private declarations for Core's Runtime domain only. */
export const getSchemaHookDeclarations = (
	schema: SchemaDefinition,
): SchemaHookDeclarations | undefined => schemaHookDeclarations.get(schema)
