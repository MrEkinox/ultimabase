import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type {
	CompiledApplicationSchemaSurface,
	CompiledSchemaMutationCommand,
} from '../../plugins/application-surface-registry.js'
import {
	defineCapability,
	provideCapability,
	type CapabilityToken,
} from '../../plugins/capabilities.js'
import {
	defineCoreFoundationProvider,
	type CoreFoundationProvider,
} from '../../plugins/capability-providers.js'
import type { SchemaDefinition } from '../../schema/index.js'

/** Describes one final schema-local mutation without exposing its resolver. */
export interface ApplicationSchemaMutationDescriptor {
	readonly command: string
	readonly mutation: CompiledSchemaMutationCommand['mutation']
	readonly owner: CompiledSchemaMutationCommand['owner']
	readonly schema: SchemaDefinition
}

/** Reads the callback-free mutation vocabulary compiled for one application. */
export interface ApplicationSchemaMutationSurface {
	get(schema: SchemaDefinition): readonly ApplicationSchemaMutationDescriptor[]
}

interface SurfaceState {
	disposed: boolean
	resolveSurface: SchemaMutationSurfaceResolver | undefined
}

/** Resolves one final application-owned surface without exposing its registry. */
export type SchemaMutationSurfaceResolver = (
	className: string,
) => CompiledApplicationSchemaSurface | undefined

const surfaceStates = new WeakMap<object, SurfaceState>()

const descriptorsFor = (
	surface: CompiledApplicationSchemaSurface,
): readonly ApplicationSchemaMutationDescriptor[] => {
	const commands = new Map<string, CompiledSchemaMutationCommand>([
		...surface.schemaMutations,
		...surface.modelMutations,
	])

	return immutableArray(
		[...commands]
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([command, definition]) =>
				immutableRecord({
					command,
					mutation: definition.mutation,
					owner: definition.owner,
					schema: surface.schema,
				}),
			),
	)
}

class CoreApplicationSchemaMutationSurface implements ApplicationSchemaMutationSurface {
	get(
		schema: SchemaDefinition,
	): readonly ApplicationSchemaMutationDescriptor[] {
		const state = this.#state()
		const surface = state.resolveSurface?.(schema.className)

		return surface?.schema === schema
			? descriptorsFor(surface)
			: immutableArray([])
	}

	#state(): SurfaceState {
		const state = surfaceStates.get(this)
		if (
			state === undefined ||
			state.disposed ||
			state.resolveSurface === undefined
		) {
			throw new TypeError('Application schema mutation surface is unavailable')
		}
		return state
	}
}

/** Supplies optional engines with exact compiled schema-mutation identities. */
export const applicationSchemaMutationSurfaceCapability: CapabilityToken<
	ApplicationSchemaMutationSurface,
	ApplicationSchemaMutationSurface,
	'ultimabase.application-schema-mutation-surface',
	'1.0.0',
	'single',
	'application'
> = defineCapability<ApplicationSchemaMutationSurface>()({
	capabilityId: 'ultimabase.application-schema-mutation-surface',
	version: '1.0.0',
	cardinality: 'single',
	lifetime: 'application',
	compose: ([provider]) => {
		if (!surfaceStates.has(provider)) {
			throw new TypeError(
				'Application schema mutation surface must use the Core provider',
			)
		}
		return provider
	},
})

const canonicalSurface = provideCapability(
	applicationSchemaMutationSurfaceCapability,
	{
		contributionId: 'application-schema-mutation-surface',
		create: () => {
			const surface = new CoreApplicationSchemaMutationSurface()
			const state: SurfaceState = {
				disposed: false,
				resolveSurface: undefined,
			}
			surfaceStates.set(surface, state)
			Object.freeze(surface)
			return immutableRecord({
				value: surface,
				dispose: () => {
					state.disposed = true
					state.resolveSurface = undefined
				},
			})
		},
	},
)

/** @internal Installs the Core provider only when a plugin consumes the surface. */
export const canonicalApplicationSchemaMutationSurfaceFoundation: CoreFoundationProvider<
	typeof applicationSchemaMutationSurfaceCapability
> = defineCoreFoundationProvider(canonicalSurface)

/** @internal Binds the final application-local surface after static compilation. */
export const bindApplicationSchemaMutationSurface = (
	surface: unknown,
	resolveSurface: SchemaMutationSurfaceResolver,
): void => {
	if (surface === undefined) return
	if (typeof surface !== 'object' || surface === null) {
		throw new TypeError('Unknown application schema mutation surface')
	}
	const state = surfaceStates.get(surface)
	if (state === undefined || state.disposed) {
		throw new TypeError('Unknown application schema mutation surface')
	}
	if (state.resolveSurface !== undefined) {
		throw new TypeError('Application schema mutation surface is already bound')
	}
	state.resolveSurface = resolveSurface
}

/** Identifies the non-replaceable Core mutation-surface protocol. */
export const isApplicationSchemaMutationSurfaceCapability = (
	token: object,
): boolean => token === applicationSchemaMutationSurfaceCapability
