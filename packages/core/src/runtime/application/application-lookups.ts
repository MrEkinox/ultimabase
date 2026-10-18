import { readApplicationKernelState } from '../../application/application-kernel-state.js'
import type { CompiledApplicationSchemaSurface } from '../../plugins/application-surface-contracts.js'
import type {
	PluginDefinition,
	PluginFactory,
} from '../../plugins/definition.js'
import type { PluginIdentity } from '../../plugins/manifest.js'
import type { OperationOptions } from '../../query/operations/options.js'
import { Schema, type SchemaDefinition } from '../../schema/index.js'

/**
 * Resolves the application surface a name or schema class designates. A class
 * must be the exact registered class, not another schema of the same name.
 */
export const resolveSchemaSurface = (
	nameOrClass: SchemaDefinition | string,
	lookup: (className: string) => CompiledApplicationSchemaSurface | undefined,
): CompiledApplicationSchemaSurface => {
	const className =
		typeof nameOrClass === 'string' ? nameOrClass : nameOrClass.className
	const surface = lookup(className)
	if (surface === undefined) {
		throw new TypeError(`Unknown application schema: ${className}`)
	}
	if (
		typeof nameOrClass !== 'string' &&
		(!Schema.is(nameOrClass) || surface.schema !== nameOrClass)
	) {
		throw new TypeError(
			`Schema class does not belong to this application: ${className}`,
		)
	}
	return surface
}

/**
 * Calls one installed schema mutation of a handle, refusing a mutation the
 * schema's surface does not install.
 */
export const invokeInstalledSchemaMutation = (
	handle: object | undefined,
	schema: SchemaDefinition,
	name: string,
	input: unknown,
	options: OperationOptions | undefined,
): Promise<unknown> => {
	const method: unknown =
		handle === undefined ? undefined : Reflect.get(handle, name)
	if (handle === undefined || typeof method !== 'function') {
		throw new TypeError(
			`Schema mutation ${schema.className}.${name} is not installed in this application`,
		)
	}
	return Reflect.apply(method, handle, [input, options]) as Promise<unknown>
}

/**
 * Reads the setup exports of an installed plugin designated by its exact
 * definition, the factory that creates it, its identity or its id.
 */
export const readInstalledPluginExports = (
	application: {
		getPluginDynamic(identity: PluginIdentity | string): unknown
	},
	pluginOrIdentity: PluginDefinition | PluginFactory | PluginIdentity | string,
): unknown => {
	if (typeof pluginOrIdentity === 'function') {
		return application.getPluginDynamic(pluginOrIdentity.pluginId)
	}
	return typeof pluginOrIdentity === 'object' && 'manifest' in pluginOrIdentity
		? readApplicationKernelState(application).pluginExports(pluginOrIdentity)
		: application.getPluginDynamic(pluginOrIdentity)
}
