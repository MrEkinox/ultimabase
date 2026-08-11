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
	type ExtensionDefinition,
	type FieldExtension,
	type GenericField,
	type SchemaDefinition,
} from '../schema/index.js'
import {
	assertPluginFieldKind,
	type AvailablePluginFieldKind,
} from '../schema/fields/base/kinds.js'
import { resolveSchemaFieldPath } from '../schema/hooks/field-paths.js'
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
	capability: 'Access' | 'hook',
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

/** Verifies that a plugin only targets an extension it owns. */
export const assertOwnedPluginExtension: (
	ownerPlugin: string,
	extension: unknown,
	scope: 'field' | 'schema',
	capability: 'Access' | 'hook',
) => asserts extension is ExtensionDefinition<
	'field' | 'schema',
	string,
	object
> = (ownerPlugin, extension, scope, capability) => {
	if (
		!isPlainRecord(extension) ||
		extension.scope !== scope ||
		typeof extension.name !== 'string' ||
		typeof extension.pluginName !== 'string' ||
		!isPlainRecord(extension.config)
	) {
		throw new TypeError(
			`Plugin ${capability} target must be a ${scope} extension`,
		)
	}

	assertNonEmptyString(extension.name, `plugin ${capability} extension name`)
	assertNonEmptyString(
		extension.pluginName,
		`plugin ${capability} extension pluginName`,
	)

	if (extension.pluginName !== ownerPlugin) {
		throw new FrameworkError(
			'PLUGIN_CONFLICT',
			`Plugin "${ownerPlugin}" cannot target extension "${extension.name}" owned by plugin "${extension.pluginName}".`,
			{
				internalDetails: {
					kind: `foreign-${capability.toLowerCase()}-extension`,
					extensionName: extension.name,
					extensionScope: scope,
					ownerPlugin,
					targetPlugin: extension.pluginName,
				},
			},
		)
	}
}

/** Compares extension declarations without relying on object identity. */
export const pluginExtensionMatches = (
	actual: ExtensionDefinition<'field' | 'schema', string, object>,
	target: ExtensionDefinition<'field' | 'schema', string, object>,
): boolean =>
	actual.scope === target.scope &&
	actual.name === target.name &&
	actual.pluginName === target.pluginName

/** Resolves one exact application-owned schema with attributed diagnostics. */
export const resolvePluginTargetSchema = (
	schemas: SchemaRegistry,
	schema: SchemaDefinition,
	registration: PluginDeclarationTargetProvenance,
	capability: 'Access' | 'hook',
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
	capability: 'Access' | 'hook',
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

const emptyFieldExtensions: readonly FieldExtension<string, object>[] =
	immutableArray([])

const isFieldExtension = (
	value: unknown,
): value is FieldExtension<string, object> =>
	isPlainRecord(value) &&
	value.scope === 'field' &&
	typeof value.name === 'string' &&
	value.name.length > 0 &&
	typeof value.pluginName === 'string' &&
	value.pluginName.length > 0 &&
	isPlainRecord(value.config)

/** Reads validated field extensions for shared plugin target expansion. */
export const getPluginTargetFieldExtensions = (
	field: GenericField,
	capability: 'Access' | 'hook',
): readonly FieldExtension<string, object>[] => {
	const extensions: unknown =
		'extensions' in field.options ? field.options.extensions : undefined

	if (!isUnknownArray(extensions)) {
		return emptyFieldExtensions
	}

	const normalizedExtensions: FieldExtension<string, object>[] = []

	for (const extension of extensions) {
		if (!isFieldExtension(extension)) {
			throw new TypeError(
				`Invalid field extension in plugin ${capability} target`,
			)
		}

		normalizedExtensions.push(extension)
	}

	return immutableArray(normalizedExtensions)
}
