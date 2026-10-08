import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import type {
	CompiledSchemaRegistry,
	ExposedOperationTransportBinding,
	SchemaDefinition,
} from '@ultimabase/core'

const bindingKeys = new Set(['errors', 'inputSchema', 'path'])
// Static ASCII segments only; templates, encodings, and dot segments cannot match.
const publicPathPattern = /^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/u
const reservedRoots = new Set(['classes', 'operations'])

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
	const invalid = (problem: string): TypeError =>
		new TypeError(`REST binding for operation ${operation} ${problem}`)
	if (
		!isPlainRecord(metadata) ||
		!Object.hasOwn(metadata, 'errors') ||
		Object.keys(metadata).some((key) => !bindingKeys.has(key))
	) {
		throw invalid(
			'must declare exact error status metadata and an optional path',
		)
	}
	const statuses = readRestErrorStatusMap(
		{ errors: metadata.errors },
		errors,
		operation,
	)
	const { inputSchema, path } = metadata
	if (
		Object.hasOwn(metadata, 'inputSchema') &&
		(typeof inputSchema !== 'string' || inputSchema.length === 0)
	) {
		throw invalid('has an invalid input schema')
	}
	if (
		Object.hasOwn(metadata, 'path') &&
		(typeof path !== 'string' ||
			!publicPathPattern.test(path) ||
			reservedRoots.has(path.split('/')[1] ?? ''))
	) {
		throw invalid('has an invalid public path')
	}
	return immutableRecord({
		errors: statuses,
		...(typeof path === 'string' ? { path } : {}),
		...(typeof inputSchema === 'string' ? { inputSchema } : {}),
	})
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
		!isPlainRecord(metadata.errors)
	) {
		throw new TypeError(
			`REST binding for operation ${operation} must declare exact error status metadata`,
		)
	}
	const statuses: Record<string, unknown> = metadata.errors
	if (
		Object.keys(statuses).length !== errors.length ||
		errors.some((code) => !Object.hasOwn(statuses, code))
	) {
		throw new TypeError(
			`REST binding for operation ${operation} must map every declared public error`,
		)
	}
	return immutableRecord(
		Object.fromEntries(
			Object.entries(statuses).map(([code, status]) => {
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
				return [code, status] as const
			}),
		),
	)
}
