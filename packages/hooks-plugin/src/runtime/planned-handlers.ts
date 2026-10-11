import type {
	NestedWriteGraph,
	OperationAstNode,
	SchemaDefinition,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type { NormalizedHookHandler } from '../authoring/declarations.js'
import type { HookOperationKind } from '../context/hook-context.js'
import type { HookContribution } from './contribution-plan.js'
import type {
	HookDiagnosticPhase,
	HookDiagnosticTarget,
} from './diagnostics.js'
import {
	applicationHookOwner,
	createHookExecutionDescriptor,
	createPluginHookOwner,
	globalHookTarget,
	type HookExecutionDescriptor,
} from './execution-runtime.js'

/** One handler ready to run, with the kind of declaration it came from. */
export interface PlannedHandler {
	readonly descriptor: HookExecutionDescriptor
	readonly source: HookContribution<object>['kind']
}

/** Flattens one phase while retaining the precompiled contribution order. */
export const collectHandlers = <TDeclarations extends object>(
	contributions: readonly HookContribution<TDeclarations>[],
	select: (declarations: TDeclarations) => readonly NormalizedHookHandler[],
	identity: Readonly<{
		declarationBranch?: string
		operationKind: HookOperationKind
		phase: HookDiagnosticPhase
		target: HookDiagnosticTarget
	}>,
): readonly PlannedHandler[] =>
	immutableArray(
		contributions.flatMap((contribution) => {
			const owner =
				contribution.kind === 'plugin'
					? createPluginHookOwner(
							contribution.ownerPlugin,
							contribution.localName,
							contribution.ownerInstanceId,
						)
					: applicationHookOwner
			const target =
				contribution.kind === 'global' ? globalHookTarget : identity.target
			return select(contribution.declarations).map((entry) =>
				immutableRecord({
					descriptor: createHookExecutionDescriptor({
						...entry,
						...identity,
						owner,
						target,
					}),
					source: contribution.kind,
				}),
			)
		}),
	)

/**
 * Freezes one hook input with what its declaration may see: the schema name
 * for global hooks, and the internal operation tree for plugin contributions
 * (ADR-0318). Application hooks see plain data only.
 */
export const createInputFor = (
	handler: PlannedHandler,
	schema: SchemaDefinition,
	internals: Readonly<Record<string, unknown>>,
	input: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> =>
	immutableRecord(
		handler.source === 'global'
			? { ...input, schema: schema.className }
			: handler.source === 'plugin'
				? { ...input, ...internals }
				: input,
	)

/** The internal tree a `provideHookContributions` hook may read (ADR-0318). */
export interface HookInternals {
	/** The normalized operation being processed. */
	readonly operation: OperationAstNode
	/** The complete nested-write graph, during a nested write only. */
	readonly nestedWrite?: NestedWriteGraph
}

/**
 * Reads the internal operation tree of a hook input. Only hooks contributed
 * through `provideHookContributions` receive it; application hooks see plain
 * data and get `undefined`.
 *
 * @example `const graph = readHookInternals(input)?.nestedWrite`
 */
export const readHookInternals = (input: object): HookInternals | undefined => {
	const operation: unknown = Reflect.get(input, 'operation')
	if (!isPlainRecord(operation) || typeof operation.kind !== 'string') {
		return undefined
	}
	const nestedWrite: unknown = Reflect.get(input, 'nestedWrite')
	// Runtime attached both values from its own operation and graph.
	return immutableRecord({
		operation: operation as unknown as OperationAstNode,
		...(isPlainRecord(nestedWrite)
			? { nestedWrite: nestedWrite as unknown as NestedWriteGraph }
			: {}),
	})
}
