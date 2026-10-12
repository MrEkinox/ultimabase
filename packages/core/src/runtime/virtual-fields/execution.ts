import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { FrameworkError } from '../../foundation.js'
import { snapshotOutputValue } from '../../schema/index.js'
import { getVirtualFieldResolver } from '../../schema/schema/virtual-field.js'
import type { DatabaseOperationAst } from '../database/contracts.js'
import type { RequestContext } from '../context/request-context.js'
import {
	createRuntimeCallbackDescriptor,
	getApplicationRuntimeCallbackExecutor,
	isFrameworkControlFailure,
} from '../contributions/execution.js'
import { createSchemaRuntimeCallbackOwner } from '../contributions/schema-callback-owner.js'
import { throwIfOperationCancelled } from '../cancellation/operation-cancellation.js'
import { transferRuntimeSchemaModelMetadata } from '../operations/model-metadata.js'
import type { RuntimeOperationResult } from '../pipeline/contracts.js'
import type { RuntimeVirtualFieldProjection } from './projection.js'

const virtualResolverBatchSize = 16

interface VirtualResolverInvocation {
	readonly run: () => Promise<void>
}

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
	): Promise<void> {
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
		}
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

		const records = resultRecords.map((resultRecord, itemIndex) => {
			const sourceRecord = sourceRecords[itemIndex]
			if (!isPlainRecord(resultRecord) || !isPlainRecord(sourceRecord)) {
				throw new TypeError(
					'Runtime virtual projection requires logical records',
				)
			}
			return { resultRecord, sourceRecord }
		})
		const { schema } = projection
		const resolved = projection.virtualFields.map((virtual) => {
			const descriptor = createRuntimeCallbackDescriptor({
				operationKind: operation.kind,
				owner: createSchemaRuntimeCallbackOwner(virtual.provenance),
				phase: `virtual-field:${virtual.name}`,
				target: { className: schema.className, kind: 'schema' },
			})
			const items = records.map(({ sourceRecord }) =>
				immutableRecord(
					Object.fromEntries(
						virtual.field.select.map((name) => [name, sourceRecord[name]]),
					),
				),
			)
			return {
				binding: getVirtualFieldResolver(virtual.field),
				descriptor,
				items,
				label: `${schema.className}.${virtual.name}`,
				values: new Array<unknown>(records.length),
				virtual,
			}
		})
		const call = async (
			entry: (typeof resolved)[number],
			ordinal: number,
			run: () => unknown,
		): Promise<unknown> => {
			try {
				return await this.#runtime.invoke(entry.descriptor, context, run)
			} catch (error: unknown) {
				if (isFrameworkControlFailure(error)) throw error
				throw new FrameworkError(
					'INTERNAL_ERROR',
					`Virtual field resolver failed: ${entry.label}`,
					{
						cause: error,
						publicMessage: 'The operation could not be completed.',
						internalDetails: {
							className: schema.className,
							field: entry.virtual.name,
							ordinal,
						},
					},
				)
			}
		}
		const snapshot = (
			entry: (typeof resolved)[number],
			ordinal: number,
			value: unknown,
		): unknown => {
			try {
				return snapshotOutputValue(
					entry.virtual.field.output,
					value,
					entry.label,
				)
			} catch (error: unknown) {
				throw new FrameworkError(
					'VALIDATION_ERROR',
					`Virtual field output is invalid: ${entry.label}`,
					{
						cause: error,
						publicMessage: 'The operation result is invalid.',
						internalDetails: {
							className: schema.className,
							field: entry.virtual.name,
							ordinal,
						},
					},
				)
			}
		}

		const invocations: VirtualResolverInvocation[] = []
		// Per-row resolvers keep their record-major order.
		for (const itemIndex of records.keys()) {
			for (const entry of resolved) {
				const { binding } = entry
				const item = entry.items[itemIndex]
				if (binding.kind !== 'one' || item === undefined) continue
				const ordinal = this.#nextOrdinal
				this.#nextOrdinal += 1
				invocations.push(
					immutableRecord({
						run: async (): Promise<void> => {
							const value = await call(entry, ordinal, () =>
								binding.resolve(immutableRecord({ context, item })),
							)
							entry.values[itemIndex] = snapshot(entry, ordinal, value)
						},
					}),
				)
			}
		}
		// `resolveMany` resolves every row of this read in one call (ADR-0325).
		for (const entry of resolved) {
			const { binding } = entry
			if (binding.kind !== 'many' || records.length === 0) continue
			const ordinal = this.#nextOrdinal
			this.#nextOrdinal += 1
			invocations.push(
				immutableRecord({
					run: async (): Promise<void> => {
						const values = await call(entry, ordinal, () =>
							binding.resolveMany(
								immutableRecord({
									context,
									items: immutableArray(entry.items),
								}),
							),
						)
						if (!isUnknownArray(values) || values.length !== records.length) {
							throw new FrameworkError(
								'VALIDATION_ERROR',
								`Virtual field output is invalid: ${entry.label} resolveMany must return one value per item`,
								{
									publicMessage: 'The operation result is invalid.',
									internalDetails: {
										className: schema.className,
										field: entry.virtual.name,
										ordinal,
									},
								},
							)
						}
						for (const [itemIndex, value] of values.entries()) {
							entry.values[itemIndex] = snapshot(entry, ordinal, value)
						}
					},
				}),
			)
		}

		await this.#runInvocations(context, operation, invocations)
		const resolvedRecords = records.map(({ resultRecord }, itemIndex) => {
			// Entries keep every virtual name, including `__proto__`, as an own key.
			const virtualValues: [string, unknown][] = resolved.map((entry) => [
				entry.virtual.name,
				entry.values[itemIndex],
			])
			const record = immutableRecord({
				...resultRecord,
				...Object.fromEntries(virtualValues),
			})
			transferRuntimeSchemaModelMetadata(resultRecord, record)
			return record
		})

		return (
			isUnknownArray(unknownResult)
				? immutableArray(resolvedRecords)
				: resolvedRecords[0]
		) as RuntimeOperationResult<TOperation>
	}
}
