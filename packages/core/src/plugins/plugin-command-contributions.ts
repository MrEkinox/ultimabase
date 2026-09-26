import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { isOperationTransportBinding } from '../runtime/plugin-operations/capabilities.js'
import type { OperationTransportBindingDefinition } from '../runtime/plugin-operations/contracts.js'
import { isSchemaMutationTransportBinding } from '../runtime/schema-mutations/transport-capabilities.js'
import type { SchemaMutationTransportBindingDefinition } from '../runtime/schema-mutations/transport-contracts.js'
import { assertExactPlainObject } from '../exact-object-validation.js'
import type {
	PluginOperationAuthoringContribution,
	PluginOperationBindingContribution,
	PluginOperationContribution,
	PluginOperationContributionOptions,
	PluginSchemaMutationBindingContribution,
	PluginSchemaMutationContribution,
	PluginSchemaMutationContributionOptions,
} from './plugin-command-contribution-contracts.js'
import {
	planPluginCommandBinding,
	planPluginCommandHandler,
	type PluginCommandContributionRuntime,
	type PluginCommandHandlerPlan,
	type PluginCommandTransportPlan,
} from './plugin-command-plan.js'
import {
	isPluginOperationDefinition,
	type PluginOperationDefinition,
} from './plugin-operations.js'
import {
	isPluginSchemaMutationDefinition,
	type PluginSchemaMutationDefinition,
} from './plugin-schema-mutations.js'

interface CompiledPluginCommandContributions {
	readonly handlers: readonly PluginCommandHandlerPlan[]
	readonly operations: readonly (
		PluginOperationDefinition | PluginSchemaMutationDefinition
	)[]
	readonly transports: readonly PluginCommandTransportPlan[]
}

const commandContributions = new WeakMap<
	object,
	PluginCommandContributionRuntime
>()
const bindingContributions = new WeakSet<object>()
const operationOptionKeys = new Set([
	'bindings',
	'create',
	'execute',
	'operation',
])
const schemaMutationOptionKeys = new Set([
	'bindings',
	'create',
	'mutation',
	'resolve',
])

const assertContributionOptions: (
	value: unknown,
	keys: ReadonlySet<string>,
	label: string,
) => asserts value is Readonly<Record<PropertyKey, unknown>> = (
	value,
	keys,
	label,
) => {
	assertExactPlainObject(
		value,
		keys,
		`${label} must be a plain object`,
		`Unknown ${label} option: `,
	)
}

const assertExclusiveImplementation = (
	options: Readonly<Record<PropertyKey, unknown>>,
	handlerKey: 'execute' | 'resolve',
	label: string,
): void => {
	const hasCreate = Object.hasOwn(options, 'create')
	const hasHandler = Object.hasOwn(options, handlerKey)
	if (hasCreate === hasHandler) {
		throw new TypeError(
			`${label} requires exactly one of create or ${handlerKey}`,
		)
	}
	if (hasCreate && typeof options.create !== 'function') {
		throw new TypeError(`${label} create must be a function`)
	}
	if (hasHandler && typeof options[handlerKey] !== 'function') {
		throw new TypeError(`${label} ${handlerKey} must be a function`)
	}
}

const normalizeBindings = <TBinding>(
	value: unknown,
	label: string,
	factory: string,
	isBinding: (candidate: unknown) => candidate is TBinding,
	targetsSource: (binding: TBinding) => boolean,
	sourceLabel: string,
): readonly TBinding[] => {
	const bindings: unknown = value ?? []
	if (!isUnknownArray(bindings)) {
		throw new TypeError(`${label} bindings must be an array`)
	}
	for (const [index, binding] of bindings.entries()) {
		if (!isBinding(binding)) {
			throw new TypeError(
				`${label} bindings[${String(index)}] must be created by ${factory}`,
			)
		}
		if (!targetsSource(binding)) {
			throw new TypeError(
				`${label} bindings[${String(index)}] targets another ${sourceLabel}`,
			)
		}
	}
	return immutableArray(bindings) as readonly TBinding[]
}

const isPluginOperationContribution = (
	value: unknown,
): value is PluginOperationContribution =>
	isPlainRecord(value) && commandContributions.get(value)?.kind === 'operation'

const isPluginSchemaMutationContribution = (
	value: unknown,
): value is PluginSchemaMutationContribution =>
	isPlainRecord(value) && commandContributions.get(value)?.kind === 'mutation'

const isPluginOperationBindingContribution = (
	value: unknown,
): value is PluginOperationBindingContribution =>
	isPlainRecord(value) &&
	value.kind === 'plugin-operation-binding-contribution' &&
	bindingContributions.has(value)

const isPluginSchemaMutationBindingContribution = (
	value: unknown,
): value is PluginSchemaMutationBindingContribution =>
	isPlainRecord(value) &&
	value.kind === 'plugin-schema-mutation-binding-contribution' &&
	bindingContributions.has(value)

/** Defines one owned operation contribution without repeating Core registries. */
export const contributeOperation = <
	const TOperation extends PluginOperationDefinition,
	const TBindings extends
		readonly OperationTransportBindingDefinition<TOperation>[] = readonly [],
>(
	options: PluginOperationContributionOptions<TOperation, TBindings>,
): PluginOperationContribution<TOperation, TBindings> => {
	const label = 'plugin operation contribution'
	assertContributionOptions(options, operationOptionKeys, label)
	if (!isPluginOperationDefinition(options.operation)) {
		throw new TypeError(`${label} requires an operation`)
	}
	const bindings = normalizeBindings(
		options.bindings,
		label,
		'operationTransportBinding',
		isOperationTransportBinding,
		(binding) => binding.operation === options.operation,
		'operation',
	)
	assertExclusiveImplementation(options, 'execute', label)

	const contribution = immutableRecord({
		bindings: bindings as TBindings,
		kind: 'plugin-operation-contribution' as const,
		operation: options.operation,
	})
	commandContributions.set(contribution, {
		...(Object.hasOwn(options, 'create') ? { create: options.create } : {}),
		...(Object.hasOwn(options, 'execute') ? { execute: options.execute } : {}),
		kind: 'operation',
		source: options.operation,
	})
	return contribution
}

/** Contributes only one binding while preserving exact operation ownership. */
export const contributeOperationBinding = <
	const TBinding extends OperationTransportBindingDefinition,
>(
	binding: TBinding,
): PluginOperationBindingContribution<TBinding> => {
	if (!isOperationTransportBinding(binding)) {
		throw new TypeError(
			'plugin operation binding contribution requires an operationTransportBinding',
		)
	}
	const contribution = immutableRecord({
		binding,
		kind: 'plugin-operation-binding-contribution' as const,
	})
	bindingContributions.add(contribution)
	return contribution
}

/** Defines one owned schema mutation without repeating Core registries. */
export const contributeSchemaMutation = <
	const TMutation extends PluginSchemaMutationDefinition,
	const TBindings extends
		readonly SchemaMutationTransportBindingDefinition<TMutation>[] =
		readonly [],
>(
	options: PluginSchemaMutationContributionOptions<TMutation, TBindings>,
): PluginSchemaMutationContribution<TMutation, TBindings> => {
	const label = 'plugin schema mutation contribution'
	assertContributionOptions(options, schemaMutationOptionKeys, label)
	if (!isPluginSchemaMutationDefinition(options.mutation)) {
		throw new TypeError(`${label} requires a mutation`)
	}
	const bindings = normalizeBindings(
		options.bindings,
		label,
		'schemaMutationTransportBinding',
		isSchemaMutationTransportBinding,
		(binding) => binding.mutation === options.mutation,
		'mutation',
	)
	assertExclusiveImplementation(options, 'resolve', label)

	const contribution = immutableRecord({
		bindings: bindings as TBindings,
		kind: 'plugin-schema-mutation-contribution' as const,
		mutation: options.mutation,
	})
	commandContributions.set(contribution, {
		...(Object.hasOwn(options, 'create') ? { create: options.create } : {}),
		...(Object.hasOwn(options, 'resolve') ? { resolve: options.resolve } : {}),
		kind: 'mutation',
		source: options.mutation,
	})
	return contribution
}

/** Contributes only one binding under the schema mutation's exact owner. */
export const contributeSchemaMutationBinding = <
	const TBinding extends SchemaMutationTransportBindingDefinition,
>(
	binding: TBinding,
): PluginSchemaMutationBindingContribution<TBinding> => {
	if (!isSchemaMutationTransportBinding(binding)) {
		throw new TypeError(
			'plugin schema mutation binding contribution requires a schemaMutationTransportBinding',
		)
	}
	const contribution = immutableRecord({
		binding,
		kind: 'plugin-schema-mutation-binding-contribution' as const,
	})
	bindingContributions.add(contribution)
	return contribution
}

export const compilePluginCommandContributions = (
	contributions: readonly PluginOperationAuthoringContribution[],
): CompiledPluginCommandContributions => {
	const untrustedContributions: unknown = contributions
	if (!isUnknownArray(untrustedContributions)) {
		throw new TypeError('plugin operation contributions must be an array')
	}

	const handlers: PluginCommandHandlerPlan[] = []
	const operations: (
		PluginOperationDefinition | PluginSchemaMutationDefinition
	)[] = []
	const transports: PluginCommandTransportPlan[] = []
	for (const [index, contribution] of untrustedContributions.entries()) {
		if (!isPlainRecord(contribution)) {
			throw new TypeError(
				`plugin operation contributions[${String(index)}] must be created by a Core contribution factory`,
			)
		}

		if (
			isPluginOperationContribution(contribution) ||
			isPluginSchemaMutationContribution(contribution)
		) {
			const runtime = commandContributions.get(contribution)
			if (runtime === undefined) {
				throw new TypeError(
					contribution.kind === 'plugin-operation-contribution'
						? 'plugin operation contribution lost its runtime'
						: 'plugin schema mutation contribution lost its runtime',
				)
			}
			operations.push(runtime.source)
			handlers.push(planPluginCommandHandler(runtime))
			for (const binding of contribution.bindings) {
				transports.push(planPluginCommandBinding(binding))
			}
			continue
		}

		if (
			isPluginOperationBindingContribution(contribution) ||
			isPluginSchemaMutationBindingContribution(contribution)
		) {
			transports.push(planPluginCommandBinding(contribution.binding))
			continue
		}

		throw new TypeError(
			`plugin operation contributions[${String(index)}] must be created by a Core contribution factory`,
		)
	}

	return immutableRecord({
		handlers: immutableArray(handlers),
		operations: immutableArray(operations),
		transports: immutableArray(transports),
	})
}
