import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type { RequestContext } from '../../runtime/context/request-context.js'
import type {
	GenericField,
	ResolveFieldSourceTemplate,
} from '../fields/base/contract.js'
import type {
	GenericOutputDescriptor,
	OutputBuilder,
	OutputValue,
} from '../output/contracts.js'
import { assertOutputDescriptor } from '../output/descriptor.js'
import type {
	SchemaTypeInfo,
	SchemaTypeInfoSource,
	SchemaTypeInfoFor,
	UltimaBaseGeneratedVirtualFieldBuilderMethods,
	UltimaBaseGeneratedVirtualFieldOptions,
} from '../type-info.js'
import { assertPlainObject } from '../../exact-object-validation.js'

type MaybePromise<TValue> = TValue | PromiseLike<TValue>

type SelectionKeyWithValue<TSelection, TValue extends boolean> = {
	[TKey in keyof TSelection]-?: [TSelection[TKey]] extends [TValue]
		? TKey
		: never
}[keyof TSelection]

type SelectedDependencyKey<TItem, TSelection> = keyof TSelection extends never
	? keyof TItem
	: | ([SelectionKeyWithValue<TSelection, true>] extends [never]
				? Exclude<keyof TItem, SelectionKeyWithValue<TSelection, false>>
				: Extract<SelectionKeyWithValue<TSelection, true>, keyof TItem>)
		| Extract<'id', keyof TItem>

/** Computes the exact immutable persisted projection supplied to one resolver. */
export type VirtualFieldResolverItem<
	TSchema extends SchemaTypeInfoSource,
	TSelection,
> = Readonly<
	Pick<
		SchemaTypeInfoFor<TSchema>['item'],
		Extract<
			SelectedDependencyKey<SchemaTypeInfoFor<TSchema>['item'], TSelection>,
			keyof SchemaTypeInfoFor<TSchema>['item']
		>
	>
>

/** Names the flat persisted dependency selection generated for one schema. */
export type VirtualFieldDependencySelection<
	TSchema extends SchemaTypeInfoSource,
> = SchemaTypeInfoFor<TSchema>['inputs']['dependencySelect']

/** Receives only declared persisted dependencies and the real request context. */
export type VirtualFieldResolver<TItem extends object, TValue> = (input: {
	readonly context: RequestContext
	readonly item: Readonly<TItem>
}) => MaybePromise<TValue>

/** Declares one output-only schema field without persistence behavior. */
export type VirtualFieldOptions<
	TOutput extends GenericOutputDescriptor,
	TSelection extends object,
	TItem extends object,
	TOutputBuilder = OutputBuilder,
	TSourceTemplate extends object = Readonly<Record<never, never>>,
> = UltimaBaseGeneratedVirtualFieldOptions &
	Extract<
		ResolveFieldSourceTemplate<TSourceTemplate, OutputValue<TOutput>>,
		object
	> & {
		/** Supplies human-readable schema documentation. */
		readonly description?: string
		/** Describes the complete nullable and list-aware result value. */
		readonly output: (output: TOutputBuilder) => TOutput
		/** Resolves the result from the exact private dependency projection. */
		readonly resolve: VirtualFieldResolver<TItem, OutputValue<TOutput>>
		/** Selects flat persisted dependencies; canonical identity is always retained. */
		readonly select: TSelection
	}

/** Retains inert virtual metadata while Core keeps resolver identity private. */
export interface VirtualFieldDefinition<
	TOutput extends GenericOutputDescriptor = GenericOutputDescriptor,
> {
	readonly kind: 'virtual'
	readonly options: Readonly<
		UltimaBaseGeneratedVirtualFieldOptions & {
			readonly description?: string
		}
	>
	readonly output: TOutput
	readonly select: readonly string[]
}

/** Accepts any genuine Core virtual declaration. */
export type GenericVirtualField = VirtualFieldDefinition

interface VirtualFieldCapability {
	readonly resolver: VirtualFieldResolver<object, unknown>
}

const virtualFieldCapabilities = new WeakMap<object, VirtualFieldCapability>()

/** Creates one provenance-checked virtual declaration after schema validation. */
export const createVirtualFieldDefinition = <
	const TOutput extends GenericOutputDescriptor,
>(
	output: TOutput,
	select: readonly string[],
	resolver: VirtualFieldResolver<object, unknown>,
	options: Readonly<Record<string, unknown>>,
): VirtualFieldDefinition<TOutput> => {
	assertOutputDescriptor(output, 'virtual.output')
	if (typeof resolver !== 'function') {
		throw new TypeError('virtual.resolve must be a function')
	}
	assertPlainObject(options, 'virtual options must be a plain object')

	const field = immutableRecord({
		kind: 'virtual' as const,
		options: immutableRecord(options),
		output,
		select: immutableArray(select),
	}) as VirtualFieldDefinition<TOutput>
	virtualFieldCapabilities.set(field, { resolver })
	return field
}

/** Protects compilation and transports from forged virtual declarations. */
export function assertVirtualFieldDefinition(
	value: unknown,
	path: string,
): asserts value is GenericVirtualField {
	if (
		!isPlainRecord(value) ||
		value.kind !== 'virtual' ||
		!isPlainRecord(value.options) ||
		!Array.isArray(value.select) ||
		!virtualFieldCapabilities.has(value)
	) {
		throw new TypeError(`${path} must be created by field.virtual`)
	}
	assertOutputDescriptor(value.output, `${path}.output`)
}

/** @internal Reads the exact resolver retained behind Core provenance. */
export const getVirtualFieldResolver = (
	field: GenericVirtualField,
): VirtualFieldResolver<object, unknown> => {
	const capability = virtualFieldCapabilities.get(field)
	if (capability === undefined) {
		throw new TypeError('Invalid virtual field resolver binding')
	}
	return capability.resolver
}

/** Normalizes one dependency selection against persisted non-relation fields. */
export const normalizeVirtualFieldSelection = (
	value: unknown,
	persistedFields: Readonly<Record<string, GenericField>>,
	path: string,
): readonly string[] => {
	assertPlainObject(value, `${path} must be a flat boolean selection`)

	const entries = Object.entries(value)
	for (const [name, selected] of entries) {
		if (!Object.hasOwn(persistedFields, name)) {
			throw new TypeError(`${path}.${name} must reference a persisted field`)
		}
		if (persistedFields[name]?.kind === 'relation') {
			throw new TypeError(`${path}.${name} cannot reference a relation field`)
		}
		if (typeof selected !== 'boolean') {
			throw new TypeError(`${path}.${name} must be a boolean`)
		}
		if (name === 'id' && !selected) {
			throw new TypeError(`${path}.id cannot be false`)
		}
	}

	const included = entries
		.filter(([, selected]) => selected)
		.map(([name]) => name)
	const eligible = Object.entries(persistedFields)
		.filter(([, field]) => field.kind !== 'relation')
		.map(([name]) => name)
	const selected =
		included.length > 0
			? included
			: eligible.filter((name) => value[name] !== false)

	return immutableArray(['id', ...selected.filter((name) => name !== 'id')])
}

/** Creates the callable `field.virtual` surface and its plugin namespace. */
type CoreVirtualFieldBuilderMethod<
	TSchema extends SchemaTypeInfoSource = SchemaTypeInfo,
	TSourceTemplate extends object = Readonly<Record<never, never>>,
	TOutputBuilder = OutputBuilder,
> = <
	const TOutput extends GenericOutputDescriptor,
	const TSelection extends VirtualFieldDependencySelection<TSchema>,
>(
	options: VirtualFieldOptions<
		TOutput,
		TSelection,
		VirtualFieldResolverItem<TSchema, TSelection>,
		TOutputBuilder,
		TSourceTemplate
	>,
) => VirtualFieldDefinition<TOutput>

/** Creates the callable virtual field plus application-local plugin methods. */
export type VirtualFieldBuilderMethod<
	TSchema extends SchemaTypeInfoSource = SchemaTypeInfo,
	TSourceTemplate extends object = Readonly<Record<never, never>>,
	TOutputBuilder = OutputBuilder,
	TPluginMethods extends object = UltimaBaseGeneratedVirtualFieldBuilderMethods,
> = CoreVirtualFieldBuilderMethod<TSchema, TSourceTemplate, TOutputBuilder> &
	TPluginMethods
