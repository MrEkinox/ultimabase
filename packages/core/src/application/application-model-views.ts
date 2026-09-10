import type { CompiledApplicationSchemaSurface } from '../plugins/application-surface-registry.js'
import type { PluginOperationDefinition } from '../plugins/plugin-operations.js'
import type { OperationOptions } from '../query/operations/options.js'
import type { SchemaDefinition } from '../schema/schema/definition.js'
import {
	isSchemaModelInstance,
	retainSchemaModelAlias,
} from '../schema/schema/model-state.js'
import type { UltimaBaseGeneratedModelSurface } from '../schema/type-info.js'
import type {
	ApplicationOperationBinding,
	ApplicationOperationHandle,
} from './application-handles.js'
import { createUnavailableSchemaMutationMethod } from './application-schema-mutations.js'

/** Preserves one schema model while adding the selected application's generated surface. */
export type ApplicationBoundModel<
	TSchema extends SchemaDefinition,
	TModel extends object,
> = TModel & UltimaBaseGeneratedModelSurface<TSchema>

/** @internal Holds the application-local state shared by raw and proxied handles. */
export interface ApplicationSchemaModelViewState {
	readonly mergeOptions: (options: unknown) => OperationOptions
	readonly modelViews: WeakMap<object, object>
	readonly resolveOperation: (
		operation: PluginOperationDefinition,
		binding?: ApplicationOperationBinding,
	) => ApplicationOperationHandle
	readonly surface: CompiledApplicationSchemaSurface
}

const applicationSchemaModelViewStates = new WeakMap<
	object,
	ApplicationSchemaModelViewState
>()
const applicationModelViewTargets = new WeakMap<object, object>()
const boundModelInputCommands: ReadonlySet<string> = new Set([
	'delete',
	'fetch',
	'update',
])

/** @internal Shares one model-view state with a raw or proxied schema handle. */
export const registerApplicationSchemaModelViewHost = (
	handle: object,
	state: ApplicationSchemaModelViewState,
): void => {
	applicationSchemaModelViewStates.set(handle, state)
}

const bindBuiltInModelCommand =
	(
		property: 'delete' | 'exists' | 'fetch' | 'update',
		method: (...arguments_: readonly unknown[]) => unknown,
		model: object,
		state: ApplicationSchemaModelViewState,
	): ((...arguments_: readonly unknown[]) => unknown) =>
	(...arguments_: readonly unknown[]): unknown => {
		if (property === 'exists') {
			if (arguments_.length > 1) {
				throw new TypeError('Schema model exists accepts at most one argument')
			}
			return Reflect.apply(method, model, [state.mergeOptions(arguments_[0])])
		}
		if (arguments_.length > 2) {
			throw new TypeError(
				`Schema model ${property} accepts at most two arguments`,
			)
		}
		return Reflect.apply(method, model, [
			arguments_[0],
			state.mergeOptions(arguments_[1]),
		])
	}

/** @internal Adds callable plugin commands without mutating a schema model or prototype. */
export const bindApplicationSchemaModel = <
	TSchema extends SchemaDefinition,
	TModel extends object,
>(
	handle: object,
	model: TModel,
): ApplicationBoundModel<TSchema, TModel> => {
	const state = applicationSchemaModelViewStates.get(handle)
	if (state === undefined) {
		throw new TypeError('Unknown application schema handle')
	}
	const target = applicationModelViewTargets.get(model) ?? model
	if (!isSchemaModelInstance(state.surface.schema, target)) {
		throw new TypeError(
			`Application model binding requires an exact ${state.surface.schema.className} model`,
		)
	}
	const existing = state.modelViews.get(target)
	if (existing !== undefined) {
		return existing as ApplicationBoundModel<TSchema, TModel>
	}

	const commandHandles = new Map<string, ApplicationOperationHandle>()
	const methodViews = new Map<PropertyKey, unknown>()
	const view: object = new Proxy(target, {
		get: (current, property, receiver): unknown => {
			if (
				typeof property === 'string' &&
				state.surface.modelMutations.has(property)
			) {
				let mutation = methodViews.get(property)
				if (mutation === undefined) {
					mutation = createUnavailableSchemaMutationMethod(
						property,
						() => undefined,
					)
					methodViews.set(property, mutation)
				}
				return mutation
			}
			if (
				typeof property === 'string' &&
				state.surface.modelCommands.has(property)
			) {
				let command = methodViews.get(property)
				if (command === undefined) {
					const compiled = state.surface.modelCommands.get(property)
					if (compiled === undefined) {
						throw new TypeError(`Unknown model command: ${property}`)
					}
					let operationHandle = commandHandles.get(property)
					if (operationHandle === undefined) {
						operationHandle = state.resolveOperation(compiled.operation, {
							model: view,
							schema: state.surface.schema,
						})
						commandHandles.set(property, operationHandle)
					}
					const selectedHandle = operationHandle
					command = (input: unknown) => selectedHandle.execute(input)
					methodViews.set(property, command)
				}
				return command
			}

			const value: unknown = Reflect.get(current, property, receiver)
			if (
				typeof property === 'string' &&
				typeof value === 'function' &&
				(property === 'exists' || boundModelInputCommands.has(property))
			) {
				let method = methodViews.get(property)
				if (method === undefined) {
					method = bindBuiltInModelCommand(
						property as 'delete' | 'exists' | 'fetch' | 'update',
						value as (...arguments_: readonly unknown[]) => unknown,
						view,
						state,
					)
					methodViews.set(property, method)
				}
				return method
			}

			return value
		},
		has: (current, property): boolean =>
			(typeof property === 'string' &&
				(state.surface.modelCommands.has(property) ||
					state.surface.modelMutations.has(property))) ||
			Reflect.has(current, property),
	})
	retainSchemaModelAlias(view, target)
	applicationModelViewTargets.set(view, target)
	state.modelViews.set(target, view)
	return view as ApplicationBoundModel<TSchema, TModel>
}
