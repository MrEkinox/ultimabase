import { immutableRecord } from '@ultimabase/shared'

import { FrameworkError, type PluginDefinition } from '../../foundation.js'
import { FrameworkApplication } from '../../application/framework-application.js'
import {
	getCompiledStaticRelationWhere,
	normalizeContextualRelationWhereResult,
	readRelationWhereField,
} from '../../query/filters/relation-where-declaration.js'
import {
	createQueryRelationComplexityError,
	queryRelationPredicateMaxCount,
} from '../../query/filters/relation.js'
import type { QueryFilterNode } from '../../query/filters/logical.js'
import { WhereBuilder } from '../../query/filters/where.js'
import { getRelationWhereDeclaration } from '../../schema/fields/builtins/relation.js'
import type { SchemaDefinition } from '../../schema/index.js'
import { assertApplicationEngineAvailable } from '../engine/application-binding.js'
import type {
	DatabaseOperationAst,
	DatabaseRelationPredicateScope,
	DatabaseRelationReference,
} from '../database/contracts.js'
import type { RequestContext } from '../context/request-context.js'
import {
	createRuntimeCallbackDescriptor,
	getApplicationRuntimeCallbackExecutor,
} from '../contributions/execution.js'
import { createSchemaRuntimeCallbackOwner } from '../contributions/schema-callback-owner.js'
import {
	prepareRuntimeRelationPredicates,
	type RuntimeRelationPredicatePreparationInput,
} from './predicate-preparation.js'

type RelationFilterApplication = FrameworkApplication<
	readonly SchemaDefinition[],
	readonly PluginDefinition[]
>

const preserveFrameworkControlFailure = (error: unknown): boolean =>
	error instanceof FrameworkError &&
	(error.code === 'OPERATION_CANCELLED' ||
		error.code === 'RUNTIME_CALLBACK_RECURSION')

const omitIdentityFilter = (
	filter: QueryFilterNode<SchemaDefinition>,
): QueryFilterNode<SchemaDefinition> | undefined =>
	filter.kind === 'constant' && filter.value ? undefined : filter

/** Resolves and reuses relation declarations only inside one root operation. */
export class RuntimeRelationFilterResolver {
	readonly #application: RelationFilterApplication
	readonly #resolved = new Map<
		object,
		QueryFilterNode<SchemaDefinition> | undefined
	>()
	readonly #resolving = new Set<object>()
	#predicateOccurrences = 0
	readonly #runtime

	constructor(application: RelationFilterApplication) {
		if (!(application instanceof FrameworkApplication)) {
			throw new TypeError(
				'Runtime relation filters require a FrameworkApplication',
			)
		}

		this.#application = application
		this.#runtime = getApplicationRuntimeCallbackExecutor(application)
	}

	/** Prepares private policy and declaration scopes for every relation predicate. */
	async preparePredicates(
		input: RuntimeRelationPredicatePreparationInput,
	): Promise<readonly DatabaseRelationPredicateScope[] | undefined> {
		return prepareRuntimeRelationPredicates(this.#application, this, input)
	}

	/** @internal Charges one caller or private occurrence to this root operation. */
	consumePredicateOccurrence(): void {
		this.#predicateOccurrences += 1
		if (this.#predicateOccurrences > queryRelationPredicateMaxCount) {
			throw createQueryRelationComplexityError()
		}
	}

	/** Returns one immutable private target restriction for an exact relation field. */
	async resolve(
		context: RequestContext,
		operation: DatabaseOperationAst,
		relation: DatabaseRelationReference,
	): Promise<QueryFilterNode<SchemaDefinition> | undefined> {
		assertApplicationEngineAvailable(this.#application)
		const field = readRelationWhereField(relation.source, relation.fieldPath)
		if (field.kind !== 'relation') {
			throw new TypeError('Runtime relation filter path must end at a relation')
		}
		if (this.#resolved.has(field)) return this.#resolved.get(field)

		const declaration = getRelationWhereDeclaration(field)
		if (declaration === undefined) {
			this.#resolved.set(field, undefined)
			return undefined
		}
		if (declaration.kind === 'static') {
			const compiled = getCompiledStaticRelationWhere(field)
			if (compiled === undefined) {
				throw new TypeError('Static relation filter was not compiled')
			}
			const resolved = omitIdentityFilter(compiled)
			this.#resolved.set(field, resolved)
			return resolved
		}

		if (this.#resolving.has(field)) {
			throw new FrameworkError(
				'RUNTIME_CALLBACK_RECURSION',
				`Recursive relation filter resolution detected for ${relation.source.className}.${relation.fieldPath.join('.')}.`,
				{ publicMessage: 'A recursive Runtime callback was rejected.' },
			)
		}

		const rootFieldName = relation.fieldPath[0]
		const provenance =
			rootFieldName === undefined
				? undefined
				: relation.source.provenance.fields[rootFieldName]
		if (provenance === undefined) {
			throw new TypeError('Runtime relation filter provenance is missing')
		}
		const descriptor = createRuntimeCallbackDescriptor({
			operationKind: operation.kind,
			owner: createSchemaRuntimeCallbackOwner(provenance),
			phase: `relation-where:${relation.fieldPath.join('.')}`,
			target: {
				className: relation.source.className,
				kind: 'schema',
			},
		})

		this.#resolving.add(field)
		try {
			let resolved: QueryFilterNode<SchemaDefinition>
			try {
				resolved = await this.#runtime.invoke(descriptor, context, () =>
					normalizeContextualRelationWhereResult(
						relation.target,
						declaration.resolve(
							immutableRecord({
								context,
								where: new WhereBuilder(relation.target),
							}),
						),
					),
				)
			} catch (error: unknown) {
				if (preserveFrameworkControlFailure(error)) throw error
				throw new FrameworkError(
					'INTERNAL_ERROR',
					`Relation filter resolver failed: ${relation.source.className}.${relation.fieldPath.join('.')}`,
					{
						cause: error,
						publicMessage: 'The operation could not be completed.',
						internalDetails: {
							className: relation.source.className,
							fieldPath: relation.fieldPath,
						},
					},
				)
			}

			assertApplicationEngineAvailable(this.#application)
			const normalized = omitIdentityFilter(resolved)
			this.#resolved.set(field, normalized)
			return normalized
		} finally {
			this.#resolving.delete(field)
		}
	}
}
