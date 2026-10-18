import {
	immutableArray,
	immutableRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import {
	assertExactEnumerablePlainObject,
	assertPlainObject,
} from '../exact-object-validation.js'

import { readPluginCommandOperation } from './command-catalog.js'
import {
	isPluginSchemaMutationDefinition,
	type PluginSchemaMutationDefinition,
} from './plugin-schema-mutations.js'

/**
 * Selects where one schema mutation is exposed as a direct application
 * command: the schema only, since results are plain data (ADR-0310).
 */
export type PluginSchemaMutationSurface = 'schema'

/** Binds one exact mutation token to a non-empty set of application surfaces. */
export interface PluginSchemaMutationSurfaceBinding<
	TMutation extends PluginSchemaMutationDefinition =
		PluginSchemaMutationDefinition,
> {
	readonly mutation: TMutation
	readonly surfaces: readonly PluginSchemaMutationSurface[]
}

const schemaMutationCommandNamePattern = /^[_A-Za-z][_0-9A-Za-z]*$/u

/** @internal Validates and detaches one schema mutation surface map. */
export const snapshotSchemaMutationMap = (
	value:
		Readonly<Record<string, PluginSchemaMutationSurfaceBinding>> | undefined,
): Readonly<Record<string, PluginSchemaMutationSurfaceBinding>> => {
	if (value === undefined) return immutableRecord({})
	assertPlainObject(
		value,
		'schema surface schemaMutations must be a plain object',
	)
	const snapshot: [string, PluginSchemaMutationSurfaceBinding][] = []
	for (const [name, binding] of Object.entries(value)) {
		if (!schemaMutationCommandNamePattern.test(name)) {
			throw new TypeError(
				`schema mutation command name must be a TypeScript and GraphQL identifier: ${name}`,
			)
		}
		assertExactEnumerablePlainObject(
			binding,
			new Set(['mutation', 'surfaces']),
			`schema mutation ${name} binding must be a plain object`,
			`schema mutation ${name} binding contains unknown option: `,
		)
		if (!isPluginSchemaMutationDefinition(binding.mutation)) {
			throw new TypeError(
				`schema mutation ${name} must be created by defineSchemaMutation`,
			)
		}
		if (!isUnknownArray(binding.surfaces) || binding.surfaces.length === 0) {
			throw new TypeError(
				`schema mutation ${name} surfaces must be a non-empty array`,
			)
		}
		const surfaces = new Set<PluginSchemaMutationSurface>()
		const untrustedSurfaces: readonly unknown[] = binding.surfaces
		for (const surface of untrustedSurfaces) {
			if (surface !== 'schema') {
				throw new TypeError(
					`schema mutation ${name} surface must be schema: results have no model methods`,
				)
			}
			if (surfaces.has(surface)) {
				throw new TypeError(
					`schema mutation ${name} contains duplicate surface: ${surface}`,
				)
			}
			surfaces.add(surface)
		}
		// The alias names its operation, so rules can cover One and Many (ADR-0347).
		readPluginCommandOperation(name, binding.mutation.target)
		snapshot.push([
			name,
			immutableRecord({
				mutation: binding.mutation,
				surfaces: immutableArray([...surfaces]),
			}),
		])
	}
	return immutableRecord(Object.fromEntries(snapshot))
}
