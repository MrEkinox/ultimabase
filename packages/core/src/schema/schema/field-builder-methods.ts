import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type { GenericField } from '../fields/base/contract.js'
import {
	assertPluginFieldKind,
	type AvailablePluginFieldKind,
} from '../fields/base/kinds.js'
import {
	assertPluginFieldTypeDefinition,
	normalizePluginFieldTypegen,
	type OwnedPluginFieldType,
	type PluginFieldTypeDefinition,
	type PluginFieldTypegen,
} from './plugin-field-types.js'

/** Names every Core method that a plugin can never replace. */
export const coreFieldBuilderMethodNames = [
	'add',
	'bigint',
	'binary',
	'boolean',
	'date',
	'dateTime',
	'decimal',
	'enum',
	'float',
	'int',
	'json',
	'object',
	'pointer',
	'relation',
	'string',
	'time',
	'uuid',
] as const

const coreFieldBuilderMethodNameSet: ReadonlySet<string> = new Set(
	coreFieldBuilderMethodNames,
)
const fieldBuilderMethodKeys = new Set([
	'factory',
	'fieldKind',
	'name',
	'typegen',
])
const fieldBuilderMethodTypegenKeys = new Set([
	'methodType',
	'module',
	'structuralContainsType',
	'valueType',
])
const declaredFieldBuilderMethods = new WeakSet<object>()

/** Describes the named public types referenced by deterministic generation. */
export interface FieldBuilderMethodTypegen extends PluginFieldTypegen {
	/** Exported callable type used to add the method to generated builders. */
	readonly methodType: string
}

/** Accepts an existing field factory without erasing its public overloads. */
export type FieldBuilderMethodFactory = (options: never) => GenericField

/** Defines one plugin-owned name-first method before owner injection. */
export interface FieldBuilderMethodDefinition<
	TName extends string = string,
	TFieldKind extends string = string,
	TFactory extends FieldBuilderMethodFactory = FieldBuilderMethodFactory,
> {
	readonly name: TName
	readonly fieldKind: TFieldKind
	readonly factory: TFactory
	readonly typegen: FieldBuilderMethodTypegen
}

/** Adds the application-injected owner to one validated method definition. */
export interface OwnedFieldBuilderMethod extends FieldBuilderMethodDefinition {
	readonly owner: string
}

/** Supplies resolved plugin methods to one application schema compilation. */
export interface FieldBuilderMethodResolver {
	get(name: string): OwnedFieldBuilderMethod | undefined
	values(): readonly OwnedFieldBuilderMethod[]
}

/** Gives one plugin an owner-bound write-only registration boundary. */
export interface FieldBuilderMethodRegistrar {
	/** Declares a generated value contract without adding a public builder method. */
	declareType(definition: PluginFieldTypeDefinition): void
	/** Declares a public builder method and its generated value contract together. */
	register(definition: FieldBuilderMethodDefinition): void
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

const normalizeTypegen = (value: unknown): FieldBuilderMethodTypegen => {
	if (!isPlainRecord(value)) {
		throw new TypeError('FieldBuilder method typegen must be a plain object')
	}

	assertKnownKeys(value, fieldBuilderMethodTypegenKeys, 'typegen')
	const pluginTypegen = normalizePluginFieldTypegen(
		immutableRecord({
			module: value.module,
			...(value.structuralContainsType === undefined
				? {}
				: { structuralContainsType: value.structuralContainsType }),
			valueType: value.valueType,
		}),
		'FieldBuilder method typegen',
	)

	return immutableRecord({
		methodType: assertTypeExportName(
			value.methodType,
			'FieldBuilder method typegen.methodType',
		),
		...pluginTypegen,
	})
}

/**
 * Snapshots one reusable plugin method without assigning application ownership.
 *
 * @example
 * ```ts
 * const vectorMethod = defineFieldBuilderMethod({
 *   name: 'vector',
 *   fieldKind: 'pg-vector.vector',
 *   factory: vectorField,
 *   typegen: {
 *     module: '@ultimabase/pg-vector-plugin',
 *     methodType: 'VectorFieldBuilderMethod',
 *     valueType: 'VectorValue',
 *   },
 * })
 * ```
 */
export const defineFieldBuilderMethod = <
	const TName extends string,
	const TFieldKind extends string,
	const TFactory extends FieldBuilderMethodFactory,
>(
	definition: FieldBuilderMethodDefinition<TName, TFieldKind, TFactory> & {
		readonly fieldKind: AvailablePluginFieldKind<TFieldKind>
	},
): FieldBuilderMethodDefinition<TName, TFieldKind, TFactory> => {
	const untrustedDefinition: unknown = definition

	if (!isPlainRecord(untrustedDefinition)) {
		throw new TypeError('FieldBuilder method definition must be a plain object')
	}

	assertKnownKeys(
		untrustedDefinition,
		fieldBuilderMethodKeys,
		'FieldBuilder method definition',
	)
	assertNonEmptyString(definition.name, 'FieldBuilder method name')

	if (!/^[$A-Z_a-z][$\w]*$/u.test(definition.name)) {
		throw new TypeError(
			'FieldBuilder method name must be a TypeScript property identifier',
		)
	}

	assertPluginFieldKind(definition.fieldKind, 'FieldBuilder method fieldKind')

	if (typeof definition.factory !== 'function') {
		throw new TypeError('FieldBuilder method factory must be a function')
	}

	const snapshot = immutableRecord({
		factory: definition.factory,
		fieldKind: definition.fieldKind,
		name: definition.name,
		typegen: normalizeTypegen(definition.typegen),
	})

	declaredFieldBuilderMethods.add(snapshot)

	return snapshot
}

const assertFieldBuilderMethodDefinition: (
	value: unknown,
	path: string,
) => asserts value is FieldBuilderMethodDefinition = (value, path) => {
	if (!isPlainRecord(value) || !declaredFieldBuilderMethods.has(value)) {
		throw new TypeError(`${path} must be created by defineFieldBuilderMethod`)
	}
}

/** Owns the plugin method set for exactly one application compilation. */
export class FieldBuilderMethodRegistry implements FieldBuilderMethodResolver {
	readonly #methods = new Map<string, OwnedFieldBuilderMethod>()
	readonly #fieldTypes: OwnedPluginFieldType[] = []
	#closed = false
	#snapshot: readonly OwnedFieldBuilderMethod[] | undefined
	#fieldTypeSnapshot: readonly OwnedPluginFieldType[] | undefined

	/** Opens one transactional owner-bound registration session. */
	beginPluginDeclaration(pluginName: string): Readonly<{
		fields: FieldBuilderMethodRegistrar
		commit(): void
		close(): void
	}> {
		assertNonEmptyString(pluginName, 'pluginName')
		if (this.#closed) {
			throw new TypeError('FieldBuilder method registration is already closed')
		}

		const stagedMethods = new Map<string, OwnedFieldBuilderMethod>()
		const stagedFieldTypes: OwnedPluginFieldType[] = []
		let sessionClosed = false
		const assertSessionOpen = (): void => {
			if (sessionClosed || this.#closed) {
				throw new TypeError(
					'FieldBuilder method declaration facade is already closed',
				)
			}
		}

		const stageFieldType = (
			definition: PluginFieldTypeDefinition,
			path: string,
		): void => {
			assertPluginFieldTypeDefinition(definition, path)
			stagedFieldTypes.push(
				immutableRecord({ ...definition, owner: pluginName }),
			)
		}

		const fields = immutableRecord({
			declareType: (definition: PluginFieldTypeDefinition): void => {
				assertSessionOpen()
				stageFieldType(definition, `Plugin field type from ${pluginName}`)
			},
			register: (definition: FieldBuilderMethodDefinition): void => {
				assertSessionOpen()

				assertFieldBuilderMethodDefinition(
					definition,
					`FieldBuilder method from ${pluginName}`,
				)

				if (coreFieldBuilderMethodNameSet.has(definition.name)) {
					throw new TypeError(
						`FieldBuilder method "${definition.name}" from "${pluginName}" conflicts with "@ultimabase/core"`,
					)
				}

				const existing =
					stagedMethods.get(definition.name) ??
					this.#methods.get(definition.name)

				if (existing !== undefined) {
					throw new TypeError(
						`FieldBuilder method "${definition.name}" from "${pluginName}" conflicts with "${existing.owner}"`,
					)
				}

				const fieldType = immutableRecord({
					fieldKind: definition.fieldKind,
					typegen: immutableRecord({
						module: definition.typegen.module,
						...(definition.typegen.structuralContainsType === undefined
							? {}
							: {
									structuralContainsType:
										definition.typegen.structuralContainsType,
								}),
						valueType: definition.typegen.valueType,
					}),
				})
				stagedMethods.set(
					definition.name,
					immutableRecord({ ...definition, owner: pluginName }),
				)
				stagedFieldTypes.push(
					immutableRecord({ ...fieldType, owner: pluginName }),
				)
			},
		})

		return immutableRecord({
			fields,
			commit: (): void => {
				assertSessionOpen()
				this.#fieldTypes.push(...stagedFieldTypes)
				for (const [name, method] of stagedMethods) {
					this.#methods.set(name, method)
				}
				stagedMethods.clear()
				stagedFieldTypes.length = 0
			},
			close: (): void => {
				sessionClosed = true
				stagedMethods.clear()
				stagedFieldTypes.length = 0
			},
		})
	}

	close(): void {
		if (this.#closed) {
			return
		}

		this.#closed = true
		this.#snapshot = immutableArray([...this.#methods.values()])
		this.#fieldTypeSnapshot = immutableArray(this.#fieldTypes)
	}

	get(name: string): OwnedFieldBuilderMethod | undefined {
		if (!this.#closed) {
			throw new TypeError('FieldBuilder method registration is not closed')
		}

		return this.#methods.get(name)
	}

	values(): readonly OwnedFieldBuilderMethod[] {
		if (this.#snapshot === undefined) {
			throw new TypeError('FieldBuilder method registration is not closed')
		}

		return this.#snapshot
	}

	/** Reads the immutable generated value contracts after declaration closes. */
	fieldTypes(): readonly OwnedPluginFieldType[] {
		if (this.#fieldTypeSnapshot === undefined) {
			throw new TypeError('Plugin field type registration is not closed')
		}

		return this.#fieldTypeSnapshot
	}
}
