import type { CompiledSchemaRegistry } from '../../schema/schema/registry.js'
import type { NestedWriteLimits } from '../../schema/nested-writes/contracts.js'
import {
	defaultNestedWriteLimits,
	normalizeNestedWriteLimits,
} from '../../schema/nested-writes/limits.js'
import {
	generateUuidV7,
	type UuidV7Generator,
} from '../validation/identifier-generator.js'
import type { RuntimeValidationOptions } from '../validation/runtime-validation-options.js'
import type { RuntimePipeline } from '../pipeline/runtime-pipeline.js'

/** Supplies only application-owned state required by the Core coordinator. */
export interface RuntimeNestedWriteBinding {
	readonly limits: NestedWriteLimits
	readonly reserveId: () => string
	readonly schemas: CompiledSchemaRegistry
}

const runtimeNestedWriteBindings = new WeakMap<
	RuntimePipeline,
	RuntimeNestedWriteBinding
>()

/** Creates one application-local reservation source from the validation clock. */
export const createRuntimeNestedWriteBinding = (
	schemas: CompiledSchemaRegistry,
	options: RuntimeValidationOptions | undefined,
): RuntimeNestedWriteBinding => {
	const clock = options?.clock ?? (() => new Date())
	const generator: UuidV7Generator = options?.uuidV7Generator ?? generateUuidV7
	const limits = normalizeNestedWriteLimits(
		options?.nestedWrites ?? defaultNestedWriteLimits,
	)

	return Object.freeze({
		limits,
		reserveId: (): string => generator(clock().getTime()),
		schemas,
	})
}

/** Binds application ownership after the selected Runtime factory returns. */
export const bindRuntimeNestedWrites = (
	pipeline: RuntimePipeline,
	binding: RuntimeNestedWriteBinding,
): void => {
	if (runtimeNestedWriteBindings.has(pipeline)) {
		throw new TypeError('Runtime nested writes are already bound')
	}
	runtimeNestedWriteBindings.set(pipeline, binding)
}

/** Copies application ownership to the adapter-isolated transaction pipeline. */
export const inheritRuntimeNestedWrites = (
	source: RuntimePipeline,
	target: RuntimePipeline,
): void => {
	const binding = runtimeNestedWriteBindings.get(source)
	if (binding !== undefined) bindRuntimeNestedWrites(target, binding)
}

export const readRuntimeNestedWrites = (
	pipeline: RuntimePipeline,
): RuntimeNestedWriteBinding | undefined =>
	runtimeNestedWriteBindings.get(pipeline)
