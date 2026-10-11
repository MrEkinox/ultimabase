import { AsyncLocalStorage } from 'node:async_hooks'
import { immutableRecord } from '@ultimabase/shared'

import type {
	NestedWriteGraph,
	NestedWriteObjectNode,
} from '../../schema/nested-writes/contracts.js'

/** Lists the targets one relation field gains and loses, as object ids. */
export interface RuntimeRelationLinkChanges {
	readonly connect: readonly string[]
	readonly disconnect: readonly string[]
}

/** Identifies the exact graph node whose ordinary Runtime lifecycle is active. */
export interface RuntimeNestedWriteStageContext {
	readonly graph: NestedWriteGraph
	readonly node: NestedWriteObjectNode
	/**
	 * Reads the relation link changes this node makes, by field name, once the
	 * graph preflight has run; a `set` becomes its difference (ADR-0318).
	 */
	readonly readRelationChanges?: () => Readonly<
		Record<string, RuntimeRelationLinkChanges>
	>
}

const activeNestedWrite = new AsyncLocalStorage<
	RuntimeNestedWriteStageContext | undefined
>()

export const createRuntimeNestedWriteStageContext = (
	graph: NestedWriteGraph,
	node: NestedWriteObjectNode,
	readRelationChanges?: RuntimeNestedWriteStageContext['readRelationChanges'],
): RuntimeNestedWriteStageContext =>
	immutableRecord({
		graph,
		node,
		...(readRelationChanges === undefined ? {} : { readRelationChanges }),
	})

/** Prevents parent graph state from leaking into child queries started by Hooks. */
export const runWithRuntimeNestedWriteStageContext = <TResult>(
	context: RuntimeNestedWriteStageContext | undefined,
	run: () => TResult,
): TResult => activeNestedWrite.run(context, run)

export const readRuntimeNestedWriteStageContext = ():
	RuntimeNestedWriteStageContext | undefined => activeNestedWrite.getStore()
