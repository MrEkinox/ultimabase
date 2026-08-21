import {
	assertNonEmptyString,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import {
	assertPluginFieldKind,
	type AvailablePluginFieldKind,
} from '../fields/base/kinds.js'

const pluginFieldTypeKeys = new Set(['fieldKind', 'typegen'])
const pluginFieldTypegenKeys = new Set([
	'module',
	'structuralContainsType',
	'valueType',
])
const declaredPluginFieldTypes = new WeakSet<object>()

/** Describes the named public types associated with one plugin field kind. */
export interface PluginFieldTypegen {
	/** Bare package export that owns every referenced type. */
	readonly module: string
	/** Exported partial operand accepted by structural containment when enabled. */
	readonly structuralContainsType?: string
	/** Exported logical value type used by generated models and operations. */
	readonly valueType: string
}

/** Defines Typegen metadata for one plugin field kind without exposing a builder. */
export interface PluginFieldTypeDefinition<TFieldKind extends string = string> {
	readonly fieldKind: TFieldKind
	readonly typegen: PluginFieldTypegen
}

/** Adds the application-injected owner to one validated field type definition. */
export interface OwnedPluginFieldType extends PluginFieldTypeDefinition {
	readonly owner: string
}

const assertKnownKeys = (
	value: Readonly<Record<string, unknown>>,
	knownKeys: ReadonlySet<string>,
	path: string,
): void => {
	const unknownKey = Object.keys(value).find((key) => !knownKeys.has(key))

	if (unknownKey !== undefined) {
		throw new TypeError(`Unknown ${path} key: ${unknownKey}`)
	}
}

const assertTypeExportName = (value: unknown, path: string): string => {
	assertNonEmptyString(value, path)

	if (!/^[$A-Z_a-z][$\w]*$/u.test(value)) {
		throw new TypeError(`${path} must be a TypeScript export identifier`)
	}

	return value
}

/** @internal Normalizes the shared value metadata used by methods and type-only declarations. */
export const normalizePluginFieldTypegen = (
	value: unknown,
	path: string,
): PluginFieldTypegen => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a plain object`)
	}

	assertKnownKeys(value, pluginFieldTypegenKeys, path)
	assertNonEmptyString(value.module, `${path}.module`)

	if (value.module.trim() !== value.module || /\s/u.test(value.module)) {
		throw new TypeError(`${path}.module must be a stable module specifier`)
	}

	return immutableRecord({
		module: value.module,
		...(value.structuralContainsType === undefined
			? {}
			: {
					structuralContainsType: assertTypeExportName(
						value.structuralContainsType,
						`${path}.structuralContainsType`,
					),
				}),
		valueType: assertTypeExportName(value.valueType, `${path}.valueType`),
	})
}

/**
 * Snapshots Typegen metadata for a plugin field used without a public builder.
 *
 * @example
 * ```ts
 * const aclType = definePluginFieldType({
 *   fieldKind: 'ultimabase.acl',
 *   typegen: {
 *     module: '@ultimabase/acl-permissions-plugin',
 *     structuralContainsType: 'ACLContainmentOperand',
 *     valueType: 'ACL',
 *   },
 * })
 * ```
 */
export const definePluginFieldType = <const TFieldKind extends string>(
	definition: PluginFieldTypeDefinition<TFieldKind> & {
		readonly fieldKind: AvailablePluginFieldKind<TFieldKind>
	},
): PluginFieldTypeDefinition<TFieldKind> => {
	const untrustedDefinition: unknown = definition

	if (!isPlainRecord(untrustedDefinition)) {
		throw new TypeError('Plugin field type definition must be a plain object')
	}

	assertKnownKeys(
		untrustedDefinition,
		pluginFieldTypeKeys,
		'Plugin field type definition',
	)
	assertPluginFieldKind(definition.fieldKind, 'Plugin field type fieldKind')

	const snapshot = immutableRecord({
		fieldKind: definition.fieldKind,
		typegen: normalizePluginFieldTypegen(
			definition.typegen,
			'Plugin field type typegen',
		),
	})

	declaredPluginFieldTypes.add(snapshot)

	return snapshot
}

/** @internal Rejects forged declarations at the owner-bound registration boundary. */
export const assertPluginFieldTypeDefinition: (
	value: unknown,
	path: string,
) => asserts value is PluginFieldTypeDefinition = (value, path) => {
	if (!isPlainRecord(value) || !declaredPluginFieldTypes.has(value)) {
		throw new TypeError(`${path} must be created by definePluginFieldType`)
	}
}
