import { AsyncLocalStorage } from 'node:async_hooks'
import { immutableRecord } from '@ultimabase/shared'

import type {
	NestedWriteGraph,
	NestedWriteObjectNode,
} from '../../schema/nested-writes/contracts.js'

/** Identifies the exact graph node whose ordinary Runtime lifecycle is active. */
export interface RuntimeNestedWriteStageContext {
	readonly graph: NestedWriteGraph
	readonly node: NestedWriteObjectNode
}

const activeNestedWrite = new AsyncLocalStorage<
	RuntimeNestedWriteStageContext | undefined
>()

export const createRuntimeNestedWriteStageContext = (
	graph: NestedWriteGraph,
	node: NestedWriteObjectNode,
): RuntimeNestedWriteStageContext => immutableRecord({ graph, node })

/** Prevents parent graph state from leaking into child queries started by Hooks. */
export const runWithRuntimeNestedWriteStageContext = <TResult>(
	context: RuntimeNestedWriteStageContext | undefined,
	run: () => TResult,
): TResult => activeNestedWrite.run(context, run)

export const readRuntimeNestedWriteStageContext = ():
	RuntimeNestedWriteStageContext | undefined => activeNestedWrite.getStore()
