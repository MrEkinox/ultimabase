import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import { saveHookFamilies } from './family-keys.js'
import {
	normalizeHookDeclarations,
	normalizeExactHookDeclaration,
	type HookPhaseDescriptor,
	type NormalizedHookDeclarations,
	type NormalizedHookPhase,
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

/** Retains one custom logical mutation's exact observer branches. */
export interface SchemaMutationHookDeclarations {
	readonly afterOperation?: NormalizedHookPhase
	readonly beforeOperation?: NormalizedHookPhase
}

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
			readonly mutations: Readonly<
				Record<string, Readonly<Partial<Record<SchemaHookGroup, unknown>>>>
			>
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
	const mutations: Record<
		string,
		Partial<Record<SchemaHookGroup, unknown>>
	> = {}
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
				if (!/^[_A-Za-z][_0-9A-Za-z]*$/u.test(branch)) {
					throw new TypeError(
						`Unknown schema hook: hooks.${groupName}.${branch}`,
					)
				}
				const mutation = mutations[branch] ?? {}
				mutation[groupName] = groupValue[branch]
				mutations[branch] = mutation
				continue
			}

			const phase = group[branch as keyof typeof group] as SchemaHookPhase
			flattened[phase] = groupValue[branch]
			paths[phase] = `hooks.${groupName}.${branch}`
		}
	}

	return {
		hooks: flattened,
		mutations: immutableRecord(
			Object.fromEntries(
				Object.entries(mutations).map(([command, declarations]) => [
					command,
					immutableRecord(declarations),
				]),
			),
		),
		paths,
	}
}

/** Retains only validated handlers for later internal Runtime composition. */
export type SchemaHookDeclarations =
	NormalizedHookDeclarations<SchemaHookPhase> &
		Readonly<{
			readonly mutations?: Readonly<
				Record<string, SchemaMutationHookDeclarations>
			>
		}>

/** Copies and validates one schema hook declaration without attaching it. */
export const normalizeSchemaHookDeclarations = (
	hooks: unknown,
): SchemaHookDeclarations | undefined => {
	const flattened = flattenSchemaHookGroups(hooks)

	if (flattened === undefined) {
		return undefined
	}

	const native = normalizeHookDeclarations({
		descriptors: schemaHookPhaseDescriptors,
		hooks: flattened.hooks,
		paths: flattened.paths,
		phases: schemaHookPhases,
		scope: 'schema',
	})
	const mutations: Record<string, SchemaMutationHookDeclarations> = {}

	for (const [command, declarations] of Object.entries(flattened.mutations)) {
		mutations[command] = immutableRecord({
			...(declarations.beforeOperation === undefined
				? {}
				: {
						beforeOperation: normalizeExactHookDeclaration(
							declarations.beforeOperation,
							`hooks.beforeOperation.${command}`,
						),
					}),
			...(declarations.afterOperation === undefined
				? {}
				: {
						afterOperation: normalizeExactHookDeclaration(
							declarations.afterOperation,
							`hooks.afterOperation.${command}`,
						),
					}),
		})
	}

	const normalizedMutations =
		Object.keys(mutations).length === 0 ? undefined : immutableRecord(mutations)

	if (native === undefined && normalizedMutations === undefined) {
		return undefined
	}

	return immutableRecord({
		...native,
		...(normalizedMutations === undefined
			? {}
			: { mutations: normalizedMutations }),
	})
}
