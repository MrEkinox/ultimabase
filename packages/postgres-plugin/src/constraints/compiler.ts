import {
	FrameworkError,
	type DatabaseConstraintNode,
	type PluginConstraintCompilerRegistry,
} from '@ultimabase/core'
import { immutableArray } from '@ultimabase/shared'
import { and, type SQL } from 'drizzle-orm'

import { compilePostgresConstraintPredicate } from './definition.js'
import type { CompiledPostgresSchema } from '../schema/contracts.js'

/** Describes the read-only registry surface retained by one adapter instance. */
export type PostgresConstraintCompilerRegistry = Pick<
	PluginConstraintCompilerRegistry,
	'values'
>

const emptyCompilerContributions: ReturnType<
	PluginConstraintCompilerRegistry['values']
> = immutableArray([])

/** Allows direct adapter tests to retain the same fail-closed behavior. */
export const emptyPostgresConstraintCompilerRegistry: PostgresConstraintCompilerRegistry =
	Object.freeze({
		values: () => emptyCompilerContributions,
	})

type ConstraintCompilerFailure =
	'compiler-failed' | 'compiler-missing' | 'version-unsupported'

/** Reports deterministic metadata without exposing payloads, SQL, or parameters. */
const createConstraintCompilerError = (
	node: DatabaseConstraintNode,
	reason: ConstraintCompilerFailure,
	ownerPlugin?: string,
): FrameworkError<'INTERNAL_ERROR'> =>
	new FrameworkError(
		'INTERNAL_ERROR',
		`PostgreSQL constraint compilation failed for ${node.kind} version ${String(node.version)}.`,
		{
			publicMessage: 'The database operation is not available.',
			internalDetails: {
				kind: 'postgres-constraint-compilation-failed',
				constraintKind: node.kind,
				reason,
				version: node.version,
				...(ownerPlugin === undefined ? {} : { ownerPlugin }),
			},
		},
	)

/** Compiles every node before SQL execution and combines them with logical AND. */
export const compilePostgresConstraints = (
	registry: PostgresConstraintCompilerRegistry,
	schema: CompiledPostgresSchema,
	constraints: readonly DatabaseConstraintNode[],
): SQL | undefined => {
	const predicates: SQL[] = []
	const registrations = registry.values()

	for (const node of constraints) {
		const matchingKind = registrations.filter(
			({ definition }) =>
				definition.adapter === 'postgres' && definition.kind === node.kind,
		)
		const registration = matchingKind.find(
			({ definition }) => definition.version === node.version,
		)

		if (registration === undefined) {
			throw createConstraintCompilerError(
				node,
				matchingKind.length === 0 ? 'compiler-missing' : 'version-unsupported',
			)
		}

		try {
			predicates.push(
				compilePostgresConstraintPredicate(
					registration.definition,
					schema,
					node.payload,
				),
			)
		} catch {
			// Compiler exceptions may contain private payload or SQL diagnostics.
			throw createConstraintCompilerError(
				node,
				'compiler-failed',
				registration.ownerPlugin,
			)
		}
	}

	return and(...predicates)
}
