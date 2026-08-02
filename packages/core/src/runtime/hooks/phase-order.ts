import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { OperationKind } from '../../query/index.js'
import type { SchemaHookPhase } from '../../schema/hooks/declarations.js'
import type { FieldHookPhase } from '../../schema/hooks/field-declarations.js'
import type { HookOperationFamily } from '../../schema/hooks/family-keys.js'

/** Captures the deterministic business phase nesting for one terminal operation. */
export interface NativeHookPhaseOrder {
	readonly family: HookOperationFamily
	readonly fieldAfter: readonly FieldHookPhase[]
	readonly fieldBefore: readonly FieldHookPhase[]
	readonly schemaAfter: readonly SchemaHookPhase[]
	readonly schemaBefore: readonly SchemaHookPhase[]
}

const noFieldPhases: readonly FieldHookPhase[] = immutableArray([])

const createPhaseOrder = (
	family: HookOperationFamily,
	schemaBefore: readonly SchemaHookPhase[],
	schemaAfter: readonly SchemaHookPhase[],
	fieldBefore: readonly FieldHookPhase[],
	fieldAfter: readonly FieldHookPhase[],
): NativeHookPhaseOrder =>
	immutableRecord({
		family,
		fieldAfter,
		fieldBefore,
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
		immutableArray(['beforeOperation', 'beforeSave', exactBefore]),
		immutableArray([exactAfter, 'afterSave', 'afterOperation']),
		immutableArray(['beforeSave', exactBefore]),
		immutableArray([exactAfter, 'afterSave']),
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
	noFieldPhases,
	noFieldPhases,
)
const upsertOrder = createSavePhaseOrder(
	'upsert',
	'beforeUpsert',
	'afterUpsert',
)
const deleteOneOrder = createPhaseOrder(
	'delete',
	immutableArray(['beforeOperation', 'beforeDelete']),
	immutableArray(['afterDelete', 'afterOperation']),
	immutableArray(['beforeDelete']),
	immutableArray(['afterDelete']),
)
const deleteManyOrder = createPhaseOrder(
	'delete',
	deleteOneOrder.schemaBefore,
	deleteOneOrder.schemaAfter,
	noFieldPhases,
	noFieldPhases,
)
const findOrder = createPhaseOrder(
	'find',
	immutableArray(['beforeOperation']),
	immutableArray(['afterOperation']),
	noFieldPhases,
	noFieldPhases,
)

// The exhaustive record makes new query terminals fail type checking until ordered.
const nativeHookPhaseOrders = immutableRecord({
	count: findOrder,
	'create-many': createOrder,
	'create-one': createOrder,
	'delete-many': deleteManyOrder,
	'delete-one': deleteOneOrder,
	exists: findOrder,
	find: findOrder,
	first: findOrder,
	get: findOrder,
	'update-many': updateManyOrder,
	'update-one': updateOneOrder,
	'upsert-many': upsertOrder,
	'upsert-one': upsertOrder,
} satisfies Readonly<Record<OperationKind, NativeHookPhaseOrder>>)

/** Returns a stable frozen phase plan without rebuilding arrays per operation. */
export const getNativeHookPhaseOrder = (
	kind: OperationKind,
): NativeHookPhaseOrder => nativeHookPhaseOrders[kind]
