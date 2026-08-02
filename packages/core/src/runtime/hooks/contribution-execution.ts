import {
	immutableArray,
	immutableRecord,
	type MaybePromise,
} from '@ultimabase/shared'

import {
	getHookHandlers,
	type ErasedHookHandler,
	type NormalizedHookDeclarations,
} from '../../schema/hooks/normalization.js'
import { Schema, type SchemaDefinition } from '../../schema/index.js'
import type { DatabaseOperationAst } from '../database/contracts.js'
import { getOperationSchema } from '../operations/schema.js'
import type {
	HookContribution,
	HookContributionNesting,
} from './contribution-plan.js'

/** Reads one exact declared schema before dispatching identity-owned hooks. */
export const requireDeclaredOperationSchema = (
	operation: DatabaseOperationAst,
): SchemaDefinition => {
	const schema = getOperationSchema(operation)

	if (!Schema.is(schema)) {
		throw new TypeError('Native hook dispatch requires a declared schema')
	}

	return schema
}

/** Flattens one phase while retaining the precompiled contribution order. */
const collectContributionHandlers = <TPhase extends string>(
	contributions: readonly HookContribution<
		NormalizedHookDeclarations<TPhase>
	>[],
	phase: TPhase,
	family?: string,
): readonly ErasedHookHandler[] => {
	const handlers: ErasedHookHandler[] = []

	for (const contribution of contributions) {
		handlers.push(...getHookHandlers(contribution.declarations, phase, family))
	}

	return immutableArray(handlers)
}

/** Resolves one nesting direction without rebuilding plugin ownership order. */
export const collectNestedHookHandlers = <TPhase extends string>(
	nesting: HookContributionNesting<NormalizedHookDeclarations<TPhase>>,
	direction: 'after' | 'before',
	phase: TPhase,
	family?: string,
): readonly ErasedHookHandler[] =>
	collectContributionHandlers(nesting[direction], phase, family)

/** Invokes a callback only after its public declaration was type-checked. */
export const invokeErasedHook = (
	handler: ErasedHookHandler,
	input: unknown,
): MaybePromise<unknown> => handler(input as never)

/** Executes observers best-effort and returns their failures in stable order. */
export const runHookObservers = async (
	handlers: readonly ErasedHookHandler[],
	createInput: (handlerIndex: number) => unknown,
): Promise<readonly unknown[]> => {
	const failures: unknown[] = []

	for (const [handlerIndex, handler] of handlers.entries()) {
		try {
			await invokeErasedHook(handler, createInput(handlerIndex))
		} catch (error: unknown) {
			// Finalization observers cannot prevent sibling observers from receiving state.
			failures.push(error)
		}
	}

	return immutableArray(failures)
}

/** Creates the compact public shape shared by schema operation hooks. */
export const createSchemaOperationHookInput = <
	const TOperation extends { readonly kind: string },
>(
	operation: TOperation,
): Readonly<{
	readonly kind: TOperation['kind']
	readonly operation: TOperation
}> => immutableRecord({ kind: operation.kind, operation })
