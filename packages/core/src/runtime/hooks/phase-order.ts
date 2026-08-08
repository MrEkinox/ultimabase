import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { OperationKind } from '../../query/index.js'
import type { SchemaHookPhase } from '../../schema/hooks/declarations.js'
import type { HookOperationFamily } from '../../schema/hooks/family-keys.js'

/** Captures the deterministic business phase nesting for one terminal operation. */
export interface NativeHookPhaseOrder {
	readonly family: HookOperationFamily
	readonly schemaAfter: readonly SchemaHookPhase[]
	readonly schemaBefore: readonly SchemaHookPhase[]
}

const createPhaseOrder = (
	family: HookOperationFamily,
	schemaBefore: readonly SchemaHookPhase[],
	schemaAfter: readonly SchemaHookPhase[],
): NativeHookPhaseOrder =>
	immutableRecord({
		family,
		schemaAfter,
		schemaBefore,
	})

type SaveBeforePhase = 'beforeCreate' | 'beforeUpdate' | 'beforeUpsert'
type SaveAfterPhase = 'afterCreate' | 'afterUpdate' | 'afterUpsert'

/** Builds the repeated save nesting once so schema and field orders cannot drift. */
const createSavePhaseOrder = (
	family: Extract<HookOperationFamily, 'create' | 'update' | 'upsert'>,
	exactBefore: SaveBeforePhase,
	exactAfter: SaveAfterPhase,
): NativeHookPhaseOrder =>
	createPhaseOrder(
		family,
		immutableArray([exactBefore]),
		immutableArray([exactAfter]),
	)

const createOrder = createSavePhaseOrder(
	'create',
	'beforeCreate',
	'afterCreate',
)
const updateOneOrder = createSavePhaseOrder(
	'update',
	'beforeUpdate',
	'afterUpdate',
)
const updateManyOrder = createPhaseOrder(
	'update',
	updateOneOrder.schemaBefore,
	updateOneOrder.schemaAfter,
)
const upsertOrder = createSavePhaseOrder(
	'upsert',
	'beforeUpsert',
	'afterUpsert',
)
const deleteOneOrder = createPhaseOrder(
	'delete',
	immutableArray(['beforeDelete']),
	immutableArray(['afterDelete']),
)
const deleteManyOrder = createPhaseOrder(
	'delete',
	deleteOneOrder.schemaBefore,
	deleteOneOrder.schemaAfter,
)
const readOrder = createPhaseOrder(
	'read',
	immutableArray([]),
	immutableArray([]),
)

// The exhaustive record makes new operation terminals fail type checking until ordered.
const nativeHookPhaseOrders = immutableRecord({
	count: readOrder,
	'create-many': createOrder,
	'create-one': createOrder,
	'delete-many': deleteManyOrder,
	'delete-one': deleteOneOrder,
	exists: readOrder,
	'find-many': readOrder,
	'find-one': readOrder,
	get: readOrder,
	'update-many': updateManyOrder,
	'update-one': updateOneOrder,
	'upsert-many': upsertOrder,
	'upsert-one': upsertOrder,
} satisfies Readonly<Record<OperationKind, NativeHookPhaseOrder>>)

/** Returns a stable frozen phase plan without rebuilding arrays per operation. */
export const getNativeHookPhaseOrder = (
	kind: OperationKind,
): NativeHookPhaseOrder => nativeHookPhaseOrders[kind]
