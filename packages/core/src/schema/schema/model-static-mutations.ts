import type { OperationOptions } from '../../query/operations/options.js'
import type { SchemaDefinition } from './definition.js'

type StaticSchemaMutation = (
	input: unknown,
	options?: OperationOptions,
) => Promise<unknown>

// Classes remain frozen; visibility lasts only for the current owning application.
let owner: object | undefined
let staticMutations = new WeakMap<object, Map<string, StaticSchemaMutation>>()

/** Exposes installed schema mutations without modifying a class or prototype. */
export const createStaticSchemaMutationView = <
	TSchema extends new (input: unknown) => object,
>(
	target: TSchema,
): TSchema => {
	const view: TSchema = new Proxy(target, {
		construct: (constructor, arguments_, newTarget): object =>
			Reflect.construct(
				constructor,
				arguments_,
				newTarget === view ? constructor : newTarget,
			) as object,
		get: (constructor, property, receiver): unknown => {
			if (typeof property === 'string') {
				const method = staticMutations.get(view)?.get(property)
				if (method !== undefined) return method
			}
			return Reflect.get(constructor, property, receiver)
		},
		has: (constructor, property): boolean =>
			(typeof property === 'string' &&
				staticMutations.get(view)?.has(property) === true) ||
			Reflect.has(constructor, property),
	})
	return view
}

/** Adds one inert class-level dispatcher after its application has started. */
export const registerStaticSchemaMutation = (
	application: object,
	schema: SchemaDefinition,
	name: string,
	method: StaticSchemaMutation,
): void => {
	if (owner !== undefined && owner !== application) {
		throw new TypeError(
			'Static mutations already belong to another application',
		)
	}
	owner = application
	let methods = staticMutations.get(schema)
	if (methods?.has(name) === true) return
	if (Reflect.has(schema, name)) {
		throw new TypeError(`Reserved schema static mutation: ${name}`)
	}
	if (methods === undefined) {
		methods = new Map()
		staticMutations.set(schema, methods)
	}
	methods.set(name, method)
}

/** Removes visibility without invalidating the identity checks of captured dispatchers. */
export const releaseStaticSchemaMutations = (application: object): void => {
	if (owner !== application) return
	staticMutations = new WeakMap()
	owner = undefined
}
