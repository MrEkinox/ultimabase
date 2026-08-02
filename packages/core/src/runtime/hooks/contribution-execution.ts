import { immutableArray, immutableRecord } from '@ultimabase/shared'

import {
	getHookHandlerEntries,
	type NormalizedHookDeclarations,
} from '../../schema/hooks/normalization.js'
import { Schema, type SchemaDefinition } from '../../schema/index.js'
import type { DatabaseOperationAst } from '../database/contracts.js'
import type { HookContext } from '../../schema/hooks/hook-context.js'
import type { OperationKind } from '../../query/index.js'
import type { RequestContext } from '../context/request-context.js'
import { getOperationSchema } from '../operations/schema.js'
import type {
	HookContribution,
	HookContributionNesting,
} from './contribution-plan.js'
import type {
	HookDiagnosticPhase,
	HookDiagnosticTarget,
} from './diagnostics.js'
import {
	applicationHookOwner,
	createHookExecutionDescriptor,
	createPluginHookOwner,
	type HookExecutionDescriptor,
} from './execution-descriptor.js'
import type { HookExecutionRuntime } from './execution-runtime.js'

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
	operationKind: OperationKind,
	target: HookDiagnosticTarget,
	family?: string,
): readonly HookExecutionDescriptor[] => {
	const handlers: HookExecutionDescriptor[] = []

	for (const contribution of contributions) {
		const declaredHandlers = getHookHandlerEntries(
			contribution.declarations,
			phase,
			family,
		)
		const owner =
			contribution.kind === 'developer'
				? applicationHookOwner
				: createPluginHookOwner(
						contribution.ownerPlugin,
						contribution.localName,
					)

		for (const {
			declarationBranch,
			handler,
			handlerIndex,
		} of declaredHandlers) {
			handlers.push(
				createHookExecutionDescriptor({
					declarationBranch,
					handler,
					handlerIndex,
					operationKind,
					owner,
					phase: phase as HookDiagnosticPhase,
					target,
				}),
			)
		}
	}

	return immutableArray(handlers)
}

/** Resolves one nesting direction without rebuilding plugin ownership order. */
export const collectNestedHookHandlers = <TPhase extends string>(
	nesting: HookContributionNesting<NormalizedHookDeclarations<TPhase>>,
	direction: 'after' | 'before',
	phase: TPhase,
	operationKind: OperationKind,
	target: HookDiagnosticTarget,
	family?: string,
): readonly HookExecutionDescriptor[] =>
	collectContributionHandlers(
		nesting[direction],
		phase,
		operationKind,
		target,
		family,
	)

/** Invokes a callback through the single application-owned safety boundary. */
export const invokeErasedHook = <TResult>(
	runtime: HookExecutionRuntime,
	descriptor: HookExecutionDescriptor,
	request: RequestContext,
	createInput: (context: HookContext) => unknown,
	options?: Readonly<{ readonly cancellable?: boolean }>,
): Promise<TResult> =>
	runtime.invoke(
		descriptor,
		request,
		(context) => descriptor.handler(createInput(context) as never) as TResult,
		options,
	)

/** Executes observers best-effort and returns their failures in stable order. */
export const runHookObservers = async (
	runtime: HookExecutionRuntime,
	handlers: readonly HookExecutionDescriptor[],
	request: RequestContext,
	createInput: (context: HookContext) => unknown,
): Promise<readonly unknown[]> => {
	const failures: unknown[] = []

	for (const handler of handlers) {
		try {
			await invokeErasedHook(runtime, handler, request, createInput, {
				cancellable: false,
			})
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
	context: HookContext,
): Readonly<{
	readonly context: HookContext
	readonly kind: TOperation['kind']
	readonly operation: TOperation
}> => immutableRecord({ context, kind: operation.kind, operation })
