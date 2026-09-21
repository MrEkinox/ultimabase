import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { OperationKind } from '@ultimabase/core'
import type { SchemaHookPhase } from '../authoring/declarations.js'
import type { SchemaMutationKind } from '../authoring/contracts.js'
import type { HookOperationFamily } from '../authoring/family-keys.js'

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

const createOrder = createPhaseOrder(
	'create',
	immutableArray(['beforeCreate']),
	immutableArray(['afterCreate']),
)
const updateOrder = createPhaseOrder(
	'update',
	immutableArray(['beforeUpdate']),
	immutableArray(['afterUpdate']),
)
// Atomic upserts expose their resolved create/update branch only after persistence.
const upsertOrder = createPhaseOrder(
	'upsert',
	immutableArray([]),
	immutableArray(['afterUpsert']),
)
const deleteOrder = createPhaseOrder(
	'delete',
	immutableArray(['beforeDelete']),
	immutableArray(['afterDelete']),
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
	'delete-many': deleteOrder,
	'delete-one': deleteOrder,
	exists: readOrder,
	'find-many': readOrder,
	'find-one': readOrder,
	get: readOrder,
	'update-many': updateOrder,
	'update-one': updateOrder,
	'upsert-many': upsertOrder,
	'upsert-one': upsertOrder,
} satisfies Readonly<Record<OperationKind, NativeHookPhaseOrder>>)

/** Returns a stable frozen phase plan without rebuilding arrays per operation. */
export const getNativeHookPhaseOrder = (
	kind: OperationKind,
): NativeHookPhaseOrder => nativeHookPhaseOrders[kind]

/** Resolves the public item lifecycle name while rejecting read terminals. */
export const getMutationHookKind = (
	kind: OperationKind,
): SchemaMutationKind => {
	const family = nativeHookPhaseOrders[kind].family

	if (family === 'read') {
		throw new TypeError('Read terminals do not have a mutation hook kind')
	}

	return family
}
