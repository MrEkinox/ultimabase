import { readActiveApplicationOwner } from '../../application/active-application.js'
import { readApplicationKernelState } from '../../application/application-kernel-state.js'
import { executeStaticSchemaMutation } from '../../query/operations/execution.js'
import type { OperationOptions } from '../../query/operations/options.js'
import type { SchemaDefinition } from './definition.js'

const resolveStaticMutation = (
	schema: SchemaDefinition,
	className: string,
	name: string,
) => {
	const application = readActiveApplicationOwner()
	if (
		application === undefined ||
		!['started', 'stopping', 'stopped', 'disposing'].includes(application.state)
	)
		return undefined
	const surface =
		readApplicationKernelState(application).commands.schemaSurface(className)
	return surface?.schema === schema && surface.schemaMutations.has(name)
}

/** Resolves class-level mutations from the sole active compiled application. */
export const createStaticSchemaMutationView = <
	TSchema extends new (input: unknown) => object,
>(
	target: TSchema,
	className: string,
): TSchema => {
	const view: TSchema = new Proxy(target, {
		construct: (constructor, arguments_, newTarget): object =>
			Reflect.construct(
				constructor,
				arguments_,
				newTarget === view ? constructor : newTarget,
			) as object,
		get: (constructor, property, receiver): unknown => {
			if (typeof property !== 'string' || Reflect.has(constructor, property))
				return Reflect.get(constructor, property, receiver)
			if (
				resolveStaticMutation(
					view as unknown as SchemaDefinition,
					className,
					property,
				) === true
			)
				return (input: unknown, options?: OperationOptions) =>
					executeStaticSchemaMutation(
						view as unknown as SchemaDefinition,
						property,
						input,
						options,
					)
			return Reflect.get(constructor, property, receiver)
		},
		has: (constructor, property): boolean =>
			Reflect.has(constructor, property) ||
			(typeof property === 'string' &&
				resolveStaticMutation(
					view as unknown as SchemaDefinition,
					className,
					property,
				) !== undefined),
	})
	return view
}
