import {
	assertNonEmptyString,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type { GenericField } from '../fields/base/contract.js'
import type { GenericOutputDescriptor } from '../output/contracts.js'
import { assertPluginFieldKind } from '../fields/base/kinds.js'
import {
	fieldDeclarationContexts,
	assertFieldDeclarationContext,
	type FieldDeclarationContext,
} from './field-contexts.js'

const familyKeys = new Set(['builder', 'fieldKind', 'typegen'])
const builderKeys = new Set(['contexts', 'name'])
const contextKeys = new Set(['factory', 'fieldKind', 'methodType', 'typegen'])
const typegenKeys = new Set(['module', 'structuralContainsType', 'valueType'])
const declaredPluginFieldFamilies = new WeakSet<object>()

type NamespacedPluginFieldKind = `${string}.${string}`

/** Describes the named public types associated with one plugin field kind. */
export interface PluginFieldTypegen {
	/** Bare package export that owns every referenced type. */
	readonly module: string
	/** Exported partial operand accepted by structural containment when enabled. */
	readonly structuralContainsType?: string
	/** Exported logical value type used by generated models and operations. */
	readonly valueType: string
}

/** Describes the named public types referenced by one generated builder method. */
export interface FieldBuilderMethodTypegen extends PluginFieldTypegen {
	/** Exported callable type used to add the method to generated builders. */
	readonly methodType: string
}

/** Accepts an existing field factory without erasing its public overloads. */
export type FieldBuilderMethodFactory = (
	options: never,
) => GenericField | GenericOutputDescriptor

/** Defines one exact implementation for one resolved builder context. */
export interface FieldBuilderMethodContextDefinition<
	TFieldKind extends NamespacedPluginFieldKind = NamespacedPluginFieldKind,
	TFactory extends FieldBuilderMethodFactory = FieldBuilderMethodFactory,
> {
	readonly factory: TFactory
	readonly fieldKind: TFieldKind
	readonly typegen: FieldBuilderMethodTypegen
}

/** Maps only the resolved builder contexts implemented by one public method. */
export type FieldBuilderMethodContexts = Readonly<
	Partial<Record<FieldDeclarationContext, FieldBuilderMethodContextDefinition>>
>

/** Describes one resolved plugin-owned builder method. */
export interface FieldBuilderMethodDefinition<
	TName extends string = string,
	TContexts extends FieldBuilderMethodContexts = FieldBuilderMethodContexts,
> {
	readonly name: TName
	readonly contexts: TContexts
}

/** Adds the application-injected owner to one resolved method definition. */
export interface OwnedFieldBuilderMethod extends FieldBuilderMethodDefinition {
	readonly owner: string
}

/** Defines one builder context while inheriting the field family's common metadata. */
export interface PluginFieldFamilyContextDefinition<
	TFactory extends FieldBuilderMethodFactory = FieldBuilderMethodFactory,
	TFieldKind extends NamespacedPluginFieldKind = NamespacedPluginFieldKind,
> {
	readonly factory: TFactory
	readonly fieldKind?: TFieldKind
	readonly methodType: string
	readonly typegen?: PluginFieldTypegen
}

/** Maps only the builder contexts implemented by one plugin field family. */
export type PluginFieldFamilyContexts = Readonly<
	Partial<Record<FieldDeclarationContext, PluginFieldFamilyContextDefinition>>
>

/** Defines an optional public builder method for one plugin field family. */
export interface PluginFieldFamilyBuilder<
	TName extends string = string,
	TContexts extends PluginFieldFamilyContexts = PluginFieldFamilyContexts,
> {
	readonly name: TName
	readonly contexts: TContexts
}

/** Defines one plugin field kind and its optional contextual builder method. */
export type PluginFieldFamilyDefinition<
	TFieldKind extends NamespacedPluginFieldKind = NamespacedPluginFieldKind,
	TBuilder extends PluginFieldFamilyBuilder | undefined =
		PluginFieldFamilyBuilder | undefined,
> = Readonly<{
	readonly fieldKind: TFieldKind
	readonly typegen: PluginFieldTypegen
}> &
	(TBuilder extends PluginFieldFamilyBuilder
		? Readonly<{ readonly builder: TBuilder }>
		: Readonly<{ readonly builder?: undefined }>)

/** Adds the application-injected owner to one generated value contract. */
export interface OwnedPluginFieldType {
	readonly fieldKind: string
	readonly owner: string
	readonly typegen: PluginFieldTypegen
}

/** Supplies resolved plugin methods to one application schema compilation. */
export interface FieldBuilderMethodResolver {
	get(name: string): OwnedFieldBuilderMethod | undefined
	values(): readonly OwnedFieldBuilderMethod[]
}

/** Gives one plugin an owner-bound write-only field-family boundary. */
export interface PluginFieldFamilyRegistrar {
	/** Registers one plugin field kind and its optional contextual builder. */
	register(definition: PluginFieldFamilyDefinition): void
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

const normalizeTypegen = (value: unknown, path: string): PluginFieldTypegen => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a plain object`)
	}
	assertKnownKeys(value, typegenKeys, path)
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

const normalizeContext = (
	value: unknown,
	context: FieldDeclarationContext,
): PluginFieldFamilyContextDefinition => {
	const path = `Plugin field family builder contexts.${context}`
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a plain object`)
	}
	assertKnownKeys(value, contextKeys, path)
	if (typeof value.factory !== 'function') {
		throw new TypeError(`${path}.factory must be a function`)
	}

	return immutableRecord({
		factory: value.factory as FieldBuilderMethodFactory,
		...(value.fieldKind === undefined
			? {}
			: {
					fieldKind: assertPluginFieldKind(
						value.fieldKind,
						`${path}.fieldKind`,
					) as NamespacedPluginFieldKind,
				}),
		methodType: assertTypeExportName(value.methodType, `${path}.methodType`),
		...(value.typegen === undefined
			? {}
			: { typegen: normalizeTypegen(value.typegen, `${path}.typegen`) }),
	})
}

const normalizeBuilder = (value: unknown): PluginFieldFamilyBuilder => {
	if (!isPlainRecord(value)) {
		throw new TypeError('Plugin field family builder must be a plain object')
	}
	assertKnownKeys(value, builderKeys, 'Plugin field family builder')
	assertNonEmptyString(value.name, 'Plugin field family builder name')
	if (!/^[$A-Z_a-z][$\w]*$/u.test(value.name)) {
		throw new TypeError(
			'Plugin field family builder name must be a TypeScript property identifier',
		)
	}
	if (!isPlainRecord(value.contexts)) {
		throw new TypeError(
			'Plugin field family builder contexts must be a plain object',
		)
	}
	const keys = Reflect.ownKeys(value.contexts)
	if (keys.length === 0) {
		throw new TypeError(
			'Plugin field family builder contexts must declare at least one context',
		)
	}
	const contexts = new Map<
		FieldDeclarationContext,
		PluginFieldFamilyContextDefinition
	>()
	for (const key of keys) {
		assertFieldDeclarationContext(key, 'Plugin field family builder context')
		contexts.set(key, normalizeContext(value.contexts[key], key))
	}

	return immutableRecord({
		contexts: immutableRecord(
			Object.fromEntries(
				fieldDeclarationContexts.flatMap((context) => {
					const definition = contexts.get(context)
					return definition === undefined ? [] : [[context, definition]]
				}),
			),
		),
		name: value.name,
	})
}

/**
 * Defines one plugin field family, with an optional contextual builder method.
 *
 * Shared kind and Typegen metadata are declared once. A context may override
 * them when one public method intentionally represents different field kinds.
 */
export function definePluginFieldFamily<
	const TFieldKind extends NamespacedPluginFieldKind,
	const TName extends string,
	const TContexts extends PluginFieldFamilyContexts,
>(
	definition: PluginFieldFamilyDefinition<
		TFieldKind,
		PluginFieldFamilyBuilder<TName, TContexts>
	>,
): PluginFieldFamilyDefinition<
	TFieldKind,
	PluginFieldFamilyBuilder<TName, TContexts>
>
export function definePluginFieldFamily<
	const TFieldKind extends NamespacedPluginFieldKind,
>(
	definition: PluginFieldFamilyDefinition<TFieldKind, undefined>,
): PluginFieldFamilyDefinition<TFieldKind, undefined>
export function definePluginFieldFamily(
	definition: PluginFieldFamilyDefinition,
): PluginFieldFamilyDefinition {
	const candidate: unknown = definition
	if (!isPlainRecord(candidate)) {
		throw new TypeError('Plugin field family definition must be a plain object')
	}
	assertKnownKeys(candidate, familyKeys, 'Plugin field family definition')

	const fieldKind = assertPluginFieldKind(
		definition.fieldKind,
		'Plugin field family fieldKind',
	) as NamespacedPluginFieldKind
	const typegen = normalizeTypegen(
		definition.typegen,
		'Plugin field family typegen',
	)
	const snapshot: PluginFieldFamilyDefinition =
		definition.builder === undefined
			? immutableRecord({ fieldKind, typegen })
			: immutableRecord({
					builder: normalizeBuilder(definition.builder),
					fieldKind,
					typegen,
				})

	declaredPluginFieldFamilies.add(snapshot)
	return snapshot
}

/** @internal Rejects forged families at the owner-bound registration boundary. */
export const assertPluginFieldFamily: (
	value: unknown,
	path: string,
) => asserts value is PluginFieldFamilyDefinition = (value, path) => {
	if (!isPlainRecord(value) || !declaredPluginFieldFamilies.has(value)) {
		throw new TypeError(`${path} must be created by definePluginFieldFamily`)
	}
}

/** @internal Expands one context after the family has been owner-validated. */
export const resolvePluginFieldFamilyContext = (
	family: PluginFieldFamilyDefinition,
	context: PluginFieldFamilyContextDefinition,
): FieldBuilderMethodContextDefinition => {
	const typegen = context.typegen ?? family.typegen
	return immutableRecord({
		factory: context.factory,
		fieldKind: context.fieldKind ?? family.fieldKind,
		typegen: immutableRecord({ methodType: context.methodType, ...typegen }),
	})
}
