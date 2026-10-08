import { immutableArray, isPlainRecord } from '@ultimabase/shared'

import {
	executeActiveModelSchemaMutation,
	type OperationExecutionOwnerToken,
} from '../query/operations/execution.js'
import type { OperationOptions } from '../query/operations/options.js'
import type { SchemaDefinition } from '../schema/schema/definition.js'
import {
	findSchemaModelRecord,
	readSchemaModelRecord,
	retainSchemaModelAlias,
	retainSchemaModelOwner,
} from '../schema/schema/model-state.js'
type ModelMutationsFor = (schema: SchemaDefinition) => ReadonlySet<string>
type BindValue = (value: unknown) => unknown

const applicationModelViewTargets = new WeakMap<object, object>()
const directApplicationModelViews = new WeakMap<object, object>()
/** Caches rebuilt result collections and records with their owning application. */
const directApplicationResultViews = new WeakMap<
	object,
	Readonly<{ ownerToken: OperationExecutionOwnerToken; value: object }>
>()

/**
 * Copies every own descriptor of `source` onto `target`, binding data values.
 * Returns whether any value changed; accessors are copied without invocation.
 */
const copyBoundDescriptors = (
	source: object,
	target: object,
	bind: BindValue,
): boolean => {
	let changed = false
	for (const property of Reflect.ownKeys(source)) {
		const descriptor = Object.getOwnPropertyDescriptor(source, property)
		if (descriptor === undefined) continue
		if ('value' in descriptor) {
			const value = bind(descriptor.value)
			if (value !== descriptor.value) changed = true
			descriptor.value = value
		}
		Object.defineProperty(target, property, descriptor)
	}
	if (!Object.isExtensible(source)) Object.preventExtensions(target)
	return changed
}

/** Creates an empty object sharing the prototype of `source`. */
const emptyCopyOf = (source: object): object => {
	const copy: object = {}
	Object.setPrototypeOf(copy, Reflect.getPrototypeOf(source))
	return copy
}

/**
 * Retains only inert command names and an opaque lifecycle token. Execution
 * resolves and verifies the current active application at each call boundary.
 */
export const bindDirectApplicationSchemaModel = <TModel extends object>(
	model: TModel,
	ownerToken: OperationExecutionOwnerToken,
	modelMutationsFor: ModelMutationsFor,
	ancestors: ReadonlySet<object> = new Set<object>(),
): TModel => {
	const target = applicationModelViewTargets.get(model) ?? model
	const { schema } = readSchemaModelRecord(target)
	const modelMutations = modelMutationsFor(schema)
	retainSchemaModelOwner(target, ownerToken)
	const existing = directApplicationModelViews.get(target)
	if (existing !== undefined) return existing as TModel

	const methodViews = new Map<
		string,
		(...arguments_: readonly unknown[]) => unknown
	>()
	const boundTarget = emptyCopyOf(target)
	retainSchemaModelAlias(boundTarget, target)
	const view: object = new Proxy(boundTarget, {
		get: (current, property, receiver): unknown => {
			if (typeof property === 'string' && modelMutations.has(property)) {
				const { schema } = readSchemaModelRecord(current)
				let method = methodViews.get(property)
				if (method === undefined) {
					method = (...arguments_: readonly unknown[]): unknown => {
						if (arguments_.length > 2) {
							throw new TypeError(
								`Schema mutation ${property} accepts at most two arguments`,
							)
						}
						return executeActiveModelSchemaMutation(
							view,
							schema,
							ownerToken,
							property,
							arguments_[0],
							arguments_[1] as OperationOptions | undefined,
						)
					}
					methodViews.set(property, method)
				}
				return method
			}
			return bindDirectApplicationValue(
				Reflect.get(current, property, receiver),
				ownerToken,
				modelMutationsFor,
			)
		},
		has: (current, property): boolean => {
			if (typeof property !== 'string') return Reflect.has(current, property)
			return modelMutations.has(property) || Reflect.has(current, property)
		},
	})
	retainSchemaModelAlias(view, target)
	applicationModelViewTargets.set(view, target)
	directApplicationModelViews.set(target, view)

	const descendants = new Set(ancestors).add(target)
	copyBoundDescriptors(target, boundTarget, (value) =>
		bindDirectApplicationValueInternal(
			value,
			ownerToken,
			modelMutationsFor,
			descendants,
		),
	)
	return view as TModel
}

const bindDirectApplicationValueInternal = (
	value: unknown,
	ownerToken: OperationExecutionOwnerToken,
	modelMutationsFor: ModelMutationsFor,
	ancestors: ReadonlySet<object>,
): unknown => {
	const isCollection = Array.isArray(value)
	if (!isCollection) {
		if (
			typeof value === 'object' &&
			value !== null &&
			findSchemaModelRecord(value) !== undefined
		) {
			return bindDirectApplicationSchemaModel(
				value,
				ownerToken,
				modelMutationsFor,
				ancestors,
			)
		}
		if (!isPlainRecord(value)) return value
	}
	const existing = directApplicationResultViews.get(value)
	if (existing !== undefined) {
		if (existing.ownerToken !== ownerToken) {
			throw new TypeError(
				isCollection
					? 'Application result collection cannot be rebound to another application'
					: 'Application result cannot be rebound to another application',
			)
		}
		return existing.value
	}
	if (ancestors.has(value)) return value
	const descendants = new Set(ancestors).add(value)
	const bind: BindValue = (entry) =>
		bindDirectApplicationValueInternal(
			entry,
			ownerToken,
			modelMutationsFor,
			descendants,
		)
	let bound: object | undefined
	if (isCollection) {
		const entries = Array.from(value, bind)
		if (entries.some((entry, index) => entry !== value[index])) {
			bound = immutableArray(entries)
		}
	} else {
		const copy = emptyCopyOf(value)
		if (copyBoundDescriptors(value, copy, bind)) bound = copy
	}
	if (bound === undefined) return value
	directApplicationResultViews.set(
		value,
		Object.freeze({ ownerToken, value: bound }),
	)
	return bound
}

/** Binds every model in one result tree without changing non-record values. */
export const bindDirectApplicationValue = (
	value: unknown,
	ownerToken: OperationExecutionOwnerToken,
	modelMutationsFor: ModelMutationsFor,
): unknown =>
	bindDirectApplicationValueInternal(
		value,
		ownerToken,
		modelMutationsFor,
		new Set<object>(),
	)
