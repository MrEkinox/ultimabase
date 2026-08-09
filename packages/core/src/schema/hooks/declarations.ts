import { isPlainRecord } from '@ultimabase/shared'

import type { SchemaDefinition } from '../schema/definition.js'
import type { SchemaHooks } from './contracts.js'
import { saveHookFamilies } from './family-keys.js'
import {
	normalizeHookDeclarations,
	type HookPhaseDescriptor,
	type NormalizedHookDeclarations,
} from './normalization.js'

/** Lists accepted phases once so runtime validation and public diagnostics cannot drift. */
export const schemaHookPhases = [
	'resolveInput',
	'beforeCreate',
	'afterCreate',
	'beforeUpdate',
	'afterUpdate',
	'afterUpsert',
	'beforeDelete',
	'afterDelete',
] as const

/** Identifies every schema phase accepted at the declaration boundary. */
export type SchemaHookPhase = (typeof schemaHookPhases)[number]

// Only broad phases accept family maps; exact CRUD and find phases use direct lists.
const schemaHookPhaseDescriptors = {
	resolveInput: { order: 'broad-first', variants: saveHookFamilies },
} as const satisfies Readonly<
	Partial<Record<SchemaHookPhase, HookPhaseDescriptor>>
>

const schemaHookGroups = {
	afterOperation: {
		create: 'afterCreate',
		delete: 'afterDelete',
		update: 'afterUpdate',
		upsert: 'afterUpsert',
	},
	beforeOperation: {
		create: 'beforeCreate',
		delete: 'beforeDelete',
		update: 'beforeUpdate',
	},
} as const

type SchemaHookGroup = keyof typeof schemaHookGroups

const schemaHookRootKeys = new Set<string>([
	'resolveInput',
	...Object.keys(schemaHookGroups),
])

/** Flattens the concise public groups while retaining their paths for diagnostics. */
const flattenSchemaHookGroups = (
	hooks: unknown,
):
	| Readonly<{
			readonly hooks: Readonly<Record<string, unknown>>
			readonly paths: Readonly<Partial<Record<SchemaHookPhase, string>>>
	  }>
	| undefined => {
	if (hooks === undefined) {
		return undefined
	}

	if (!isPlainRecord(hooks)) {
		throw new TypeError('hooks must be a plain object')
	}

	const flattened: Partial<Record<SchemaHookPhase, unknown>> = {}
	const paths: Partial<Record<SchemaHookPhase, string>> = {}

	for (const key of Reflect.ownKeys(hooks)) {
		if (typeof key !== 'string') {
			throw new TypeError('hooks contains an unsupported symbol key')
		}

		if (!schemaHookRootKeys.has(key)) {
			throw new TypeError(`Unknown schema hook: hooks.${key}`)
		}

		if (key === 'resolveInput') {
			flattened.resolveInput = hooks.resolveInput
			paths.resolveInput = 'hooks.resolveInput'
			continue
		}

		const groupName = key as SchemaHookGroup
		const groupValue = hooks[groupName]

		if (!isPlainRecord(groupValue)) {
			throw new TypeError(`hooks.${groupName} must be a plain object`)
		}

		const group = schemaHookGroups[groupName]
		const branches = Reflect.ownKeys(groupValue)

		if (branches.length === 0) {
			throw new TypeError(`hooks.${groupName} must not be empty`)
		}

		for (const branch of branches) {
			if (typeof branch !== 'string') {
				throw new TypeError(
					`hooks.${groupName} contains an unsupported symbol key`,
				)
			}

			if (!Object.hasOwn(group, branch)) {
				throw new TypeError(`Unknown schema hook: hooks.${groupName}.${branch}`)
			}

			const phase = group[branch as keyof typeof group] as SchemaHookPhase
			flattened[phase] = groupValue[branch]
			paths[phase] = `hooks.${groupName}.${branch}`
		}
	}

	return { hooks: flattened, paths }
}

/** Retains only validated handlers for later internal Runtime composition. */
export type SchemaHookDeclarations = NormalizedHookDeclarations<SchemaHookPhase>

const schemaHookDeclarations = new WeakMap<object, SchemaHookDeclarations>()

/** Copies and validates one schema hook declaration without attaching it. */
export const normalizeSchemaHookDeclarations = (
	hooks: unknown,
): SchemaHookDeclarations | undefined => {
	const flattened = flattenSchemaHookGroups(hooks)

	if (flattened === undefined) {
		return undefined
	}

	return normalizeHookDeclarations({
		descriptors: schemaHookPhaseDescriptors,
		hooks: flattened.hooks,
		paths: flattened.paths,
		phases: schemaHookPhases,
		scope: 'schema',
	})
}

/** Attaches one normalized declaration to the exact Schema identity. */
export const declareSchemaHooks = <TDeclarationSchema extends SchemaDefinition>(
	schema: SchemaDefinition,
	hooks: SchemaHooks<TDeclarationSchema> | undefined,
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
