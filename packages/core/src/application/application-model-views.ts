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
const applicationModelViewTargets = new WeakMap<object, object>()
const directApplicationModelViews = new WeakMap<object, object>()
const directApplicationCollectionViews = new WeakMap<
	object,
	Readonly<{
		ownerToken: OperationExecutionOwnerToken
		value: readonly unknown[]
	}>
>()
const directApplicationRecordViews = new WeakMap<
	object,
	Readonly<{
		ownerToken: OperationExecutionOwnerToken
		value: object
	}>
>()
/**
 * Retains only inert command names and an opaque lifecycle token. Execution
 * resolves and verifies the current active application at each call boundary.
 */
export const bindDirectApplicationSchemaModel = <TModel extends object>(
	model: TModel,
	ownerToken: OperationExecutionOwnerToken,
	modelMutationsFor: (schema: SchemaDefinition) => ReadonlySet<string>,
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
	const boundTarget: object = {}
	Object.setPrototypeOf(boundTarget, Reflect.getPrototypeOf(target))
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
	for (const property of Reflect.ownKeys(target)) {
		const descriptor = Object.getOwnPropertyDescriptor(target, property)
		if (descriptor === undefined) continue
		Object.defineProperty(
			boundTarget,
			property,
			'value' in descriptor
				? {
						...descriptor,
						value: bindDirectApplicationValueInternal(
							descriptor.value,
							ownerToken,
							modelMutationsFor,
							descendants,
						),
					}
				: descriptor,
		)
	}
	if (!Object.isExtensible(target)) Object.preventExtensions(boundTarget)
	return view as TModel
}

const bindDirectApplicationValueInternal = (
	value: unknown,
	ownerToken: OperationExecutionOwnerToken,
	modelMutationsFor: (schema: SchemaDefinition) => ReadonlySet<string>,
	ancestors: ReadonlySet<object>,
): unknown => {
	if (Array.isArray(value)) {
		const existing = directApplicationCollectionViews.get(value)
		if (existing !== undefined) {
			if (existing.ownerToken !== ownerToken) {
				throw new TypeError(
					'Application result collection cannot be rebound to another application',
				)
			}
			return existing.value
		}
		if (ancestors.has(value)) return value
		const descendants = new Set(ancestors).add(value)
		let changed = false
		const entries: unknown[] = []
		for (const entry of value) {
			const boundEntry = bindDirectApplicationValueInternal(
				entry,
				ownerToken,
				modelMutationsFor,
				descendants,
			)
			if (boundEntry !== entry) changed = true
			entries.push(boundEntry)
		}
		if (!changed) return value
		const bound = immutableArray(entries)
		directApplicationCollectionViews.set(
			value,
			Object.freeze({ ownerToken, value: bound }),
		)
		return bound
	}
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
	if (isPlainRecord(value)) {
		const existing = directApplicationRecordViews.get(value)
		if (existing !== undefined) {
			if (existing.ownerToken !== ownerToken) {
				throw new TypeError(
					'Application result cannot be rebound to another application',
				)
			}
			return existing.value
		}
		if (ancestors.has(value)) return value
		const descendants = new Set(ancestors).add(value)
		let changed = false
		const descriptors: [PropertyKey, PropertyDescriptor][] = []
		for (const property of Reflect.ownKeys(value)) {
			const descriptor = Object.getOwnPropertyDescriptor(value, property)
			if (descriptor === undefined) continue
			if (!('value' in descriptor)) {
				descriptors.push([property, descriptor])
				continue
			}
			const boundEntry = bindDirectApplicationValueInternal(
				descriptor.value,
				ownerToken,
				modelMutationsFor,
				descendants,
			)
			if (boundEntry !== descriptor.value) changed = true
			descriptors.push([property, { ...descriptor, value: boundEntry }])
		}
		if (!changed) return value
		const bound: object = {}
		Object.setPrototypeOf(bound, Reflect.getPrototypeOf(value))
		for (const [property, descriptor] of descriptors) {
			Object.defineProperty(bound, property, descriptor)
		}
		if (!Object.isExtensible(value)) Object.preventExtensions(bound)
		directApplicationRecordViews.set(
			value,
			Object.freeze({ ownerToken, value: bound }),
		)
		return bound
	}
	return value
}

/** Binds every model in one result tree without changing non-record values. */
export const bindDirectApplicationValue = (
	value: unknown,
	ownerToken: OperationExecutionOwnerToken,
	modelMutationsFor: (schema: SchemaDefinition) => ReadonlySet<string>,
): unknown =>
	bindDirectApplicationValueInternal(
		value,
		ownerToken,
		modelMutationsFor,
		new Set<object>(),
	)
