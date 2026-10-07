import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import type {
	CompiledSchemaRegistry,
	ExposedOperationTransportBinding,
	SchemaDefinition,
} from '@ultimabase/core'

/** Reads a static operation path without allowing aliases or schema-route shadowing. */
export const readRestOperationBindingMetadata = (
	metadata: unknown,
	errors: readonly string[],
	operation: string,
): Readonly<{
	readonly errors: Readonly<Record<string, number>>
	readonly path?: string
	readonly inputSchema?: string
}> => {
	if (
		!isPlainRecord(metadata) ||
		!Object.hasOwn(metadata, 'errors') ||
		Object.keys(metadata).some(
			(key) => key !== 'errors' && key !== 'path' && key !== 'inputSchema',
		)
	) {
		throw new TypeError(
			`REST binding for operation ${operation} must declare exact error status metadata and an optional path`,
		)
	}
	const statuses = readRestErrorStatusMap(
		{ errors: metadata.errors },
		errors,
		operation,
	)
	const inputSchema = metadata.inputSchema
	if (
		Object.hasOwn(metadata, 'inputSchema') &&
		(typeof inputSchema !== 'string' || inputSchema.length === 0)
	) {
		throw new TypeError(
			`REST binding for operation ${operation} has an invalid input schema`,
		)
	}
	const schema = typeof inputSchema === 'string' ? { inputSchema } : {}
	if (!Object.hasOwn(metadata, 'path'))
		return immutableRecord({ errors: statuses, ...schema })
	const path = metadata.path
	// Paths are relative to the versioned REST root; built-in namespaces stay reserved.
	if (
		typeof path !== 'string' ||
		!/^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/u.test(path) ||
		['classes', 'operations'].includes(path.split('/')[1] ?? '')
	) {
		throw new TypeError(
			`REST binding for operation ${operation} has an invalid public path`,
		)
	}
	return immutableRecord({ errors: statuses, path, ...schema })
}

/** Schema-derived operation input can reference only the operation owner's schema. */
export const resolveRestOperationInputSchema = (
	name: string | undefined,
	descriptor: ExposedOperationTransportBinding,
	schemas: CompiledSchemaRegistry,
): SchemaDefinition | undefined => {
	if (name === undefined) return undefined
	const schema = schemas.get(name)
	const owner = schema?.definition.provenance.schema.owner
	if (
		owner?.kind !== 'plugin' ||
		owner.pluginId !== descriptor.owner.pluginId ||
		owner.version !== descriptor.owner.version ||
		owner.instanceId !== descriptor.owner.instanceId
	) {
		throw new TypeError(
			`REST operation ${descriptor.name} cannot use input schema ${name}`,
		)
	}
	return schema
}

/** Validates one binding's complete declared PluginError-to-status mapping. */
export const readRestErrorStatusMap = (
	metadata: unknown,
	errors: readonly string[],
	operation: string,
): Readonly<Record<string, number>> => {
	if (
		!isPlainRecord(metadata) ||
		Object.keys(metadata).length !== 1 ||
		!Object.hasOwn(metadata, 'errors') ||
		!isPlainRecord(metadata.errors)
	) {
		throw new TypeError(
			`REST binding for operation ${operation} must declare exact error status metadata`,
		)
	}
	const statuses = metadata.errors
	const keys = Object.keys(statuses)
	if (
		keys.length !== errors.length ||
		errors.some((code) => !Object.hasOwn(statuses, code))
	) {
		throw new TypeError(
			`REST binding for operation ${operation} must map every declared public error`,
		)
	}
	for (const [code, status] of Object.entries(statuses)) {
		if (
			!errors.includes(code) ||
			typeof status !== 'number' ||
			!Number.isSafeInteger(status) ||
			status < 400 ||
			status > 599
		) {
			throw new TypeError(
				`REST binding for operation ${operation} has an invalid status for ${code}`,
			)
		}
	}
	return immutableRecord(statuses as Readonly<Record<string, number>>)
}
