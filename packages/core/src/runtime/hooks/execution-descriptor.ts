import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { OperationKind } from '../../query/index.js'
import type { ErasedHookHandler } from '../../schema/hooks/normalization.js'
import type {
	HookDiagnosticOwner,
	HookDiagnosticPhase,
	HookDiagnosticTarget,
} from './diagnostics.js'

/** Supplies one stable structural identity to the shared hook executor. */
export interface HookExecutionDescriptor {
	readonly handler: ErasedHookHandler
	readonly identity: Readonly<{
		readonly declarationBranch: string
		readonly handlerIndex: number
		readonly operationKind: OperationKind
		readonly owner: HookDiagnosticOwner
		readonly phase: HookDiagnosticPhase
		readonly target: HookDiagnosticTarget
	}>
	readonly key: string
}

interface CreateHookExecutionDescriptorOptions {
	readonly declarationBranch?: string
	readonly handler: ErasedHookHandler
	readonly handlerIndex: number
	readonly operationKind: OperationKind
	readonly owner: HookDiagnosticOwner
	readonly phase: HookDiagnosticPhase
	readonly target: HookDiagnosticTarget
}

/** Keeps recursion identity stable when one broad declaration handles many terminals. */
export const createHookExecutionKey = (
	identity: HookExecutionDescriptor['identity'],
): string =>
	JSON.stringify([
		identity.owner,
		identity.target,
		identity.phase,
		identity.declarationBranch,
		identity.handlerIndex,
	])

/** Creates one immutable descriptor shared by native and plugin hook paths. */
export const createHookExecutionDescriptor = ({
	declarationBranch = 'direct',
	handler,
	handlerIndex,
	operationKind,
	owner,
	phase,
	target,
}: CreateHookExecutionDescriptorOptions): HookExecutionDescriptor => {
	const identity = immutableRecord({
		declarationBranch,
		handlerIndex,
		operationKind,
		owner,
		phase,
		target,
	})

	return immutableRecord({
		handler,
		identity,
		key: createHookExecutionKey(identity),
	})
}

/** Identifies one developer-owned declaration without plugin metadata. */
export const applicationHookOwner: HookDiagnosticOwner = immutableRecord({
	kind: 'application' as const,
})

/** Creates the redacted owner shared by low-level and native plugin hooks. */
export const createPluginHookOwner = (
	pluginName: string,
	contributionName: string,
	pluginInstanceId?: string,
): HookDiagnosticOwner =>
	immutableRecord({
		contributionName,
		kind: 'plugin' as const,
		pluginName,
		...(pluginInstanceId === undefined ? {} : { pluginInstanceId }),
	})

/** Detaches one field path before it can enter diagnostics or recursion keys. */
export const createFieldHookTarget = (
	className: string,
	path: readonly string[],
): HookDiagnosticTarget =>
	immutableRecord({
		className,
		kind: 'field' as const,
		path: immutableArray(path),
	})

/** Identifies a schema without retaining its runtime object in diagnostics. */
export const createSchemaHookTarget = (
	className: string,
): HookDiagnosticTarget =>
	immutableRecord({ className, kind: 'schema' as const })

/** Identifies an application-wide low-level contribution. */
export const globalHookTarget: HookDiagnosticTarget = immutableRecord({
	kind: 'global' as const,
})
