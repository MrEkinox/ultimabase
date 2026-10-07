import { immutableArray, immutableRecord } from '@ultimabase/shared'

import {
	getHookHandlerEntries,
	type NormalizedHookDeclarations,
	type NormalizedHookHandler,
} from '../authoring/normalization.js'
import type { SchemaHookDeclarations } from '../authoring/declarations.js'
import {
	getOperationSchema,
	Schema,
	type DatabaseOperationAst,
	type NestedWriteGraph,
	type RequestContext,
	type SchemaDefinition,
} from '@ultimabase/core'
import type { HookContext } from '../context/hook-context.js'
import type { HookOperationKind } from '../context/hook-context.js'
import type { SchemaMutationKind } from '../authoring/contracts.js'
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
	operationKind: HookOperationKind,
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
						contribution.ownerInstanceId,
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
	operationKind: HookOperationKind,
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

/** Collects one exact application-specific branch without selecting a native family. */
export const collectSchemaMutationHookHandlers = (
	nesting: HookContributionNesting<SchemaHookDeclarations>,
	direction: 'after' | 'before',
	phase: 'afterOperation' | 'beforeOperation',
	command: string,
	target: HookDiagnosticTarget,
): readonly HookExecutionDescriptor[] =>
	immutableArray(
		nesting[direction].flatMap((contribution) => {
			const entries: readonly NormalizedHookHandler[] =
				contribution.declarations.mutations?.[command]?.[phase]?.all ??
				immutableArray([])
			const owner =
				contribution.kind === 'developer'
					? applicationHookOwner
					: createPluginHookOwner(
							contribution.ownerPlugin,
							contribution.localName,
							contribution.ownerInstanceId,
						)

			return entries.map(({ handler, handlerIndex }) =>
				createHookExecutionDescriptor({
					declarationBranch: command,
					handler,
					handlerIndex,
					operationKind: 'plugin-schema-mutation',
					owner,
					phase,
					target,
				}),
			)
		}),
	)

/** Invokes a callback through the single application-owned safety boundary. */
export const invokeErasedHook = <TResult>(
	runtime: HookExecutionRuntime,
	descriptor: HookExecutionDescriptor,
	request: RequestContext,
	createInput: (context: HookContext) => unknown,
): Promise<TResult> =>
	runtime.invoke(
		descriptor,
		request,
		(context) => descriptor.handler(createInput(context) as never) as TResult,
	)

/** Creates the compact public shape shared by schema operation hooks. */
export const createSchemaOperationHookInput = <
	const TOperation extends { readonly kind: string },
	const TKind extends SchemaMutationKind,
>(
	operation: TOperation,
	context: HookContext,
	kind: TKind,
	nestedWrite?: NestedWriteGraph,
): Readonly<{
	readonly context: HookContext
	readonly kind: TKind
	readonly nestedWrite?: NestedWriteGraph
	readonly operation: TOperation
}> =>
	immutableRecord({
		context,
		kind,
		...(nestedWrite === undefined ? {} : { nestedWrite }),
		operation,
	})
