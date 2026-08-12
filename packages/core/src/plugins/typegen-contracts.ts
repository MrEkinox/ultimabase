import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type {
	JsonPrimitive,
	JsonValue,
} from '../schema/fields/builtins/json.js'

const typegenReferenceBrand: unique symbol = Symbol('TypegenReference')
const typegenReferences = new WeakSet<object>()
const identifierPattern = /^[$A-Z_a-z][$\w]*$/u

/** Names one public exported TypeScript type without importing executable code. */
export interface TypegenReference<
	TModule extends string = string,
	TExportName extends string = string,
> {
	readonly [typegenReferenceBrand]: true
	readonly exportName: TExportName
	readonly module: TModule
}

/** Creates one nominal inert reference that still requires `typegen:reference`. */
export const defineTypegenReference = <
	const TModule extends string,
	const TExportName extends string,
>(options: {
	readonly exportName: TExportName
	readonly module: TModule
}): TypegenReference<TModule, TExportName> => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Typegen reference must be a plain object')
	}
	for (const key of Object.keys(options)) {
		if (key !== 'exportName' && key !== 'module') {
			throw new TypeError(`Typegen reference contains unknown option: ${key}`)
		}
	}
	assertNonEmptyString(options.module, 'Typegen reference module')
	assertNonEmptyString(options.exportName, 'Typegen reference exportName')
	if (options.module.trim() !== options.module || /\s/u.test(options.module)) {
		throw new TypeError('Typegen reference module must be a stable specifier')
	}
	if (!identifierPattern.test(options.exportName)) {
		throw new TypeError('Typegen reference exportName must be an identifier')
	}
	const reference = immutableRecord({
		[typegenReferenceBrand]: true as const,
		...options,
	})
	typegenReferences.add(reference)
	return reference
}

export const isTypegenReference = (value: unknown): value is TypegenReference =>
	typeof value === 'object' && value !== null && typegenReferences.has(value)

/** Expresses TypeScript contracts structurally without accepting source text. */
export type TypegenTypeNode =
	| Readonly<{ readonly kind: 'array'; readonly value: TypegenTypeNode }>
	| Readonly<{
			readonly kind:
				'bigint' | 'boolean' | 'never' | 'number' | 'string' | 'unknown'
	  }>
	| Readonly<{ readonly kind: 'literal'; readonly value: JsonPrimitive }>
	| Readonly<{
			readonly kind: 'object'
			readonly properties: readonly TypegenPropertyNode[]
	  }>
	| Readonly<{
			readonly arguments?: readonly TypegenTypeNode[]
			readonly kind: 'reference'
			readonly reference: TypegenReference
	  }>
	| Readonly<{
			readonly kind: 'tuple'
			readonly values: readonly TypegenTypeNode[]
	  }>
	| Readonly<{
			readonly kind: 'union'
			readonly values: readonly TypegenTypeNode[]
	  }>

export interface TypegenPropertyNode {
	readonly description?: string
	readonly name: string
	readonly optional?: boolean
	readonly readonly?: boolean
	readonly type: TypegenTypeNode
}

export interface TypegenNamedDeclaration {
	readonly description?: string
	readonly kind: 'type'
	readonly name: string
	readonly type: TypegenTypeNode
}

export interface TypegenSchemaAugmentation {
	readonly model?: readonly TypegenPropertyNode[]
	readonly schema?: readonly TypegenPropertyNode[]
	readonly target: string
}

export interface TypegenStructuredContribution {
	readonly augmentations?: readonly TypegenSchemaAugmentation[]
	readonly contributionId: string
	readonly declarations?: readonly TypegenNamedDeclaration[]
	readonly staticOptions?: Readonly<Record<string, JsonValue>>
}

export type TypegenOutputDeclaration = Readonly<{
	readonly contributionId: string
	readonly declarations: readonly TypegenNamedDeclaration[]
	readonly kind: 'declaration'
	readonly outputPath: string
	readonly staticOptions?: Readonly<Record<string, JsonValue>>
}>

export type TypegenOutputMetadata = Readonly<{
	readonly contributionId: string
	readonly kind: 'metadata'
	readonly metadata: JsonValue
	readonly outputPath: string
	readonly staticOptions?: Readonly<Record<string, JsonValue>>
}>

export type TypegenOutputDeclarationOptions =
	TypegenOutputDeclaration | TypegenOutputMetadata

const assertExactKeys = (
	value: Readonly<Record<string, unknown>>,
	keys: ReadonlySet<string>,
	path: string,
): void => {
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== 'string' || !keys.has(key)) {
			throw new TypeError(`${path} contains unknown option: ${String(key)}`)
		}
	}
}

export const snapshotTypegenTypeNode = (
	value: unknown,
	path: string,
): TypegenTypeNode => {
	if (!isPlainRecord(value) || typeof value.kind !== 'string') {
		throw new TypeError(`${path} must be a structured Typegen type`)
	}
	if (
		value.kind === 'bigint' ||
		value.kind === 'boolean' ||
		value.kind === 'never' ||
		value.kind === 'number' ||
		value.kind === 'string' ||
		value.kind === 'unknown'
	) {
		assertExactKeys(value, new Set(['kind']), path)
		return immutableRecord({ kind: value.kind })
	}
	if (value.kind === 'literal') {
		assertExactKeys(value, new Set(['kind', 'value']), path)
		if (
			value.value !== null &&
			typeof value.value !== 'boolean' &&
			typeof value.value !== 'number' &&
			typeof value.value !== 'string'
		) {
			throw new TypeError(`${path}.value must be a JSON primitive`)
		}
		return immutableRecord({ kind: 'literal', value: value.value })
	}
	if (value.kind === 'reference') {
		assertExactKeys(value, new Set(['arguments', 'kind', 'reference']), path)
		if (!isTypegenReference(value.reference)) {
			throw new TypeError(
				`${path}.reference must be created by defineTypegenReference`,
			)
		}
		const arguments_ = value.arguments
		if (arguments_ !== undefined && !isUnknownArray(arguments_)) {
			throw new TypeError(`${path}.arguments must be a list`)
		}
		return immutableRecord({
			...(arguments_ === undefined
				? {}
				: {
						arguments: immutableArray(
							arguments_.map((argument, index) =>
								snapshotTypegenTypeNode(
									argument,
									`${path}.arguments[${String(index)}]`,
								),
							),
						),
					}),
			kind: 'reference',
			reference: value.reference,
		})
	}
	if (value.kind === 'array') {
		assertExactKeys(value, new Set(['kind', 'value']), path)
		return immutableRecord({
			kind: 'array',
			value: snapshotTypegenTypeNode(value.value, `${path}.value`),
		})
	}
	if (value.kind === 'tuple' || value.kind === 'union') {
		assertExactKeys(value, new Set(['kind', 'values']), path)
		if (!isUnknownArray(value.values) || value.values.length === 0) {
			throw new TypeError(`${path}.values must be a non-empty list`)
		}
		return immutableRecord({
			kind: value.kind,
			values: immutableArray(
				value.values.map((item, index) =>
					snapshotTypegenTypeNode(item, `${path}.values[${String(index)}]`),
				),
			),
		})
	}
	if (value.kind === 'object') {
		assertExactKeys(value, new Set(['kind', 'properties']), path)
		if (!isUnknownArray(value.properties)) {
			throw new TypeError(`${path}.properties must be a list`)
		}
		return immutableRecord({
			kind: 'object',
			properties: snapshotTypegenProperties(
				value.properties,
				`${path}.properties`,
			),
		})
	}
	throw new TypeError(`${path}.kind is unsupported: ${value.kind}`)
}

export const snapshotTypegenProperties = (
	values: readonly unknown[],
	path: string,
): readonly TypegenPropertyNode[] => {
	const names = new Set<string>()
	return immutableArray(
		values.map((value, index) => {
			const itemPath = `${path}[${String(index)}]`
			if (!isPlainRecord(value)) {
				throw new TypeError(`${itemPath} must be a property`)
			}
			assertExactKeys(
				value,
				new Set(['description', 'name', 'optional', 'readonly', 'type']),
				itemPath,
			)
			assertNonEmptyString(value.name, `${itemPath}.name`)
			if (names.has(value.name)) {
				throw new TypeError(
					`${path} contains duplicate property: ${value.name}`,
				)
			}
			names.add(value.name)
			if (
				value.description !== undefined &&
				typeof value.description !== 'string'
			) {
				throw new TypeError(`${itemPath}.description must be a string`)
			}
			if (value.optional !== undefined && typeof value.optional !== 'boolean') {
				throw new TypeError(`${itemPath}.optional must be a boolean`)
			}
			if (value.readonly !== undefined && typeof value.readonly !== 'boolean') {
				throw new TypeError(`${itemPath}.readonly must be a boolean`)
			}
			return immutableRecord({
				...(value.description === undefined
					? {}
					: { description: value.description }),
				name: value.name,
				...(value.optional === undefined ? {} : { optional: value.optional }),
				...(value.readonly === undefined ? {} : { readonly: value.readonly }),
				type: snapshotTypegenTypeNode(value.type, `${itemPath}.type`),
			})
		}),
	)
}
