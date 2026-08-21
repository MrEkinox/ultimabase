import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { FrameworkError } from '../errors/framework-error.js'
import {
	Schema,
	type GenericField,
	type SchemaDefinition,
} from '../schema/index.js'
import {
	assertPluginFieldKind,
	type AvailablePluginFieldKind,
} from '../schema/fields/base/kinds.js'
import { resolveSchemaFieldPath } from '../schema/fields/paths.js'
import type { SchemaRegistry } from '../schema/schema/registry.js'

/** Supplies the provenance required by every plugin declaration target error. */
export interface PluginDeclarationTargetProvenance {
	readonly localName: string
	readonly ownerPlugin: string
	readonly ownerInstanceId?: string
}

/** Retains one typed namespaced field kind for plugin target expansion. */
export interface PluginFieldKindTarget<TField extends GenericField> {
	readonly kind: TField['kind']
}

const pluginFieldKindTargets = new WeakSet<object>()

/** Creates one provenance-checked field-kind selector for plugin facades. */
export const createPluginFieldKindTarget = <TField extends GenericField>(
	kind: AvailablePluginFieldKind<TField['kind']>,
): PluginFieldKindTarget<TField> => {
	assertPluginFieldKind(kind, 'field target kind')
	const target = immutableRecord({ kind })

	pluginFieldKindTargets.add(target)

	return target
}

/** Reads only field-kind selectors created by the shared target factory. */
export const readPluginFieldKindTarget = (target: unknown): string => {
	if (
		!isPlainRecord(target) ||
		!pluginFieldKindTargets.has(target) ||
		typeof target.kind !== 'string'
	) {
		throw new TypeError(
			'Field-kind target must be created by its public factory',
		)
	}

	return target.kind
}

/** Copies one non-empty nested field path for setup-time target ownership. */
export const normalizePluginFieldPath = (
	path: unknown,
	capability: string,
): readonly [string, ...string[]] => {
	if (!isUnknownArray(path) || path.length === 0) {
		throw new TypeError(
			`Plugin ${capability} field path must be a non-empty segment list`,
		)
	}

	const [firstSegment, ...remainingSegments] = path
	assertNonEmptyString(firstSegment, `plugin ${capability} field path[0]`)
	const normalizedPath: [string, ...string[]] = [firstSegment]

	for (const [index, segment] of remainingSegments.entries()) {
		assertNonEmptyString(
			segment,
			`plugin ${capability} field path[${String(index + 1)}]`,
		)
		normalizedPath.push(segment)
	}

	return immutableArray(normalizedPath)
}

/** Erases factory variance only after a public target callback was type-checked. */
export type ErasedPluginDeclarationFactory = (context: never) => unknown

/** Invokes one already-validated target factory behind its private erased type. */
export const runPluginDeclarationFactory = (
	factory: ErasedPluginDeclarationFactory,
	context: object,
): unknown => factory(context as never)

/** Resolves one exact application-owned schema with attributed diagnostics. */
export const resolvePluginTargetSchema = (
	schemas: SchemaRegistry,
	schema: SchemaDefinition,
	registration: PluginDeclarationTargetProvenance,
	capability: string,
): SchemaDefinition => {
	const validSchema = Schema.is(schema)
	const schemaClassName = validSchema ? schema.className : '<invalid-schema>'

	if (!validSchema || schemas.get(schemaClassName) !== schema) {
		throw new FrameworkError(
			'PLUGIN_CONFLICT',
			`Plugin ${capability} "${registration.localName}" references a schema outside this application.`,
			{
				internalDetails: {
					kind: `foreign-${capability.toLowerCase()}-schema`,
					localName: registration.localName,
					ownerPlugin: registration.ownerPlugin,
					schemaClassName,
				},
			},
		)
	}

	return schema
}

/** Resolves one exact nested field path with attributed diagnostics. */
export const resolvePluginTargetField = (
	schema: SchemaDefinition,
	path: readonly [string, ...string[]],
	registration: PluginDeclarationTargetProvenance,
	capability: string,
): GenericField => {
	try {
		return resolveSchemaFieldPath(schema, path)
	} catch (cause: unknown) {
		throw new FrameworkError(
			'PLUGIN_CONFLICT',
			`Plugin ${capability} "${registration.localName}" references an invalid field path in schema "${schema.className}".`,
			{
				cause,
				internalDetails: {
					kind: `invalid-${capability.toLowerCase()}-field-path`,
					localName: registration.localName,
					ownerPlugin: registration.ownerPlugin,
					path: immutableArray(path),
					schemaClassName: schema.className,
				},
			},
		)
	}
}
