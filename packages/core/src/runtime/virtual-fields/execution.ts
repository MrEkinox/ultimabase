import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { FrameworkError } from '../../foundation.js'
import {
	snapshotOutputValue,
	type SchemaContributionProvenance,
} from '../../schema/index.js'
import { getVirtualFieldResolver } from '../../schema/schema/virtual-field.js'
import type { DatabaseOperationAst } from '../database/contracts.js'
import type { RequestContext } from '../context/request-context.js'
import {
	createRuntimeCallbackDescriptor,
	getApplicationRuntimeCallbackExecutor,
	type RuntimeCallbackDescriptor,
} from '../contributions/execution.js'
import { throwIfOperationCancelled } from '../cancellation/operation-cancellation.js'
import { transferRuntimeSchemaModelMetadata } from '../operations/model-metadata.js'
import type { RuntimeOperationResult } from '../pipeline/contracts.js'
import type { RuntimeVirtualFieldProjection } from './projection.js'

const virtualResolverBatchSize = 16

interface VirtualResolverInvocation {
	readonly run: () => Promise<unknown>
}

const createCallbackOwner = (
	provenance: SchemaContributionProvenance,
): RuntimeCallbackDescriptor['owner'] => {
	if (provenance.owner.kind === 'application') {
		return immutableRecord({
			contributionId: provenance.contributionId,
			kind: 'application' as const,
		})
	}
	if (provenance.owner.kind === 'plugin') {
		return immutableRecord({
			contributionId: provenance.contributionId,
			kind: 'plugin' as const,
			pluginId: provenance.owner.pluginId,
			...(provenance.owner.instanceId === undefined
				? {}
				: { instanceId: provenance.owner.instanceId }),
		})
	}

	throw new FrameworkError(
		'INTERNAL_ERROR',
		'Core-owned schema fields cannot carry application virtual resolvers.',
		{ publicMessage: 'The operation could not be completed.' },
	)
}

const preserveFrameworkControlFailure = (error: unknown): boolean =>
	error instanceof FrameworkError &&
	(error.code === 'OPERATION_CANCELLED' ||
		error.code === 'RUNTIME_CALLBACK_RECURSION')

/** Owns one operation's deterministic and bounded virtual callback schedule. */
export class RuntimeVirtualFieldScheduler {
	readonly #runtime
	#nextOrdinal = 0

	constructor(application: object) {
		this.#runtime = getApplicationRuntimeCallbackExecutor(application)
	}

	async #runInvocations(
		context: RequestContext,
		operation: DatabaseOperationAst,
		invocations: readonly VirtualResolverInvocation[],
	): Promise<readonly unknown[]> {
		const values: unknown[] = []

		for (
			let offset = 0;
			offset < invocations.length;
			offset += virtualResolverBatchSize
		) {
			throwIfOperationCancelled(context.signal, {
				operationKind: operation.kind,
				phase: 'virtual-field-batch',
			})
			const batch = invocations.slice(offset, offset + virtualResolverBatchSize)
			const settled = await Promise.allSettled(batch.map(({ run }) => run()))
			const failure = settled.find(
				(result): result is PromiseRejectedResult =>
					result.status === 'rejected',
			)
			if (failure !== undefined) throw failure.reason

			for (const result of settled) {
				if (result.status === 'fulfilled') values.push(result.value)
			}
		}

		return immutableArray(values)
	}

	/** Resolves one root or eager-target projection without exposing its private source. */
	async resolve<const TOperation extends DatabaseOperationAst>(
		context: RequestContext,
		operation: TOperation,
		projection: RuntimeVirtualFieldProjection,
		result: RuntimeOperationResult<TOperation>,
		privateSource: unknown,
	): Promise<RuntimeOperationResult<TOperation>> {
		if (result === null) return result

		const unknownResult: unknown = result
		const resultRecords: readonly unknown[] = isUnknownArray(unknownResult)
			? unknownResult
			: [unknownResult]
		const sourceRecords = isUnknownArray(privateSource)
			? privateSource
			: [privateSource]
		if (resultRecords.length !== sourceRecords.length) {
			throw new TypeError(
				'Runtime virtual projection changed result cardinality',
			)
		}

		const invocations: VirtualResolverInvocation[] = []
		for (const [itemIndex, resultRecord] of resultRecords.entries()) {
			const sourceRecord = sourceRecords[itemIndex]
			if (!isPlainRecord(resultRecord) || !isPlainRecord(sourceRecord)) {
				throw new TypeError(
					'Runtime virtual projection requires logical records',
				)
			}

			for (const virtual of projection.virtualFields) {
				const ordinal = this.#nextOrdinal
				this.#nextOrdinal += 1
				const item = immutableRecord(
					Object.fromEntries(
						virtual.field.select.map((name) => [name, sourceRecord[name]]),
					),
				)
				const descriptor = createRuntimeCallbackDescriptor({
					operationKind: operation.kind,
					owner: createCallbackOwner(virtual.provenance),
					phase: `virtual-field:${virtual.name}`,
					target: {
						className: projection.schema.className,
						kind: 'schema',
					},
				})

				invocations.push(
					immutableRecord({
						run: async (): Promise<unknown> => {
							let value: unknown
							try {
								value = await this.#runtime.invoke(descriptor, context, () =>
									getVirtualFieldResolver(virtual.field)(
										immutableRecord({ context, item }),
									),
								)
							} catch (error: unknown) {
								if (preserveFrameworkControlFailure(error)) throw error
								throw new FrameworkError(
									'INTERNAL_ERROR',
									`Virtual field resolver failed: ${projection.schema.className}.${virtual.name}`,
									{
										cause: error,
										publicMessage: 'The operation could not be completed.',
										internalDetails: {
											className: projection.schema.className,
											field: virtual.name,
											ordinal,
										},
									},
								)
							}

							try {
								return snapshotOutputValue(
									virtual.field.output,
									value,
									`${projection.schema.className}.${virtual.name}`,
								)
							} catch (error: unknown) {
								throw new FrameworkError(
									'VALIDATION_ERROR',
									`Virtual field output is invalid: ${projection.schema.className}.${virtual.name}`,
									{
										cause: error,
										publicMessage: 'The operation result is invalid.',
										internalDetails: {
											className: projection.schema.className,
											field: virtual.name,
											ordinal,
										},
									},
								)
							}
						},
					}),
				)
			}
		}

		const values = await this.#runInvocations(context, operation, invocations)
		let valueIndex = 0
		const resolvedRecords = resultRecords.map((record) => {
			if (!isPlainRecord(record)) {
				throw new TypeError('Runtime virtual result must be a record')
			}
			const virtualValues: Record<string, unknown> = {}
			for (const virtual of projection.virtualFields) {
				virtualValues[virtual.name] = values[valueIndex]
				valueIndex += 1
			}
			const resolved = immutableRecord({ ...record, ...virtualValues })
			transferRuntimeSchemaModelMetadata(record, resolved)
			return resolved
		})

		return (
			isUnknownArray(unknownResult)
				? immutableArray(resolvedRecords)
				: resolvedRecords[0]
		) as RuntimeOperationResult<TOperation>
	}
}
