import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { createDateTimeNormalizer } from '../fields/builtins/date-time.js'
import { createFieldDefinition } from '../fields/base/definition.js'
import type { FieldDefinition } from '../fields/base/contract.js'
import { normalizeStringValue } from '../fields/base/value.js'

/**
 * Identifies the lifecycle event responsible for assigning a system value.
 */
export type SystemFieldGeneration = 'create' | 'createAndUpdate'

/**
 * Marks framework-owned fields for future input inference and runtime generation.
 */
export interface SystemFieldOptions<TGeneration extends SystemFieldGeneration> {
	readonly system: true
	readonly generatedOn: TGeneration
	readonly immutable: true
	readonly required: true
}

/**
 * Extends the shared field contract with framework-owned generation metadata.
 */
export type SystemFieldDefinition<
	TKind extends string,
	TValue,
	TGeneration extends SystemFieldGeneration,
	TOptions extends object = object,
> = FieldDefinition<
	TKind,
	TValue,
	SystemFieldOptions<TGeneration> & Readonly<TOptions>
>

/**
 * Represents the UUID v7 identifier generated before insertion.
 */
export type IdSystemField = SystemFieldDefinition<
	'uuid',
	string,
	'create',
	{ readonly uuidVersion: 7 }
>

/**
 * Represents the zoned date and time assigned once during insertion.
 */
export type CreatedAtSystemField = SystemFieldDefinition<
	'dateTime',
	string,
	'create'
>

/**
 * Represents the zoned date and time refreshed for every persisted update.
 */
export type UpdatedAtSystemField = SystemFieldDefinition<
	'dateTime',
	string,
	'createAndUpdate'
>

/**
 * Collects the framework-owned fields present on every schema.
 */
export interface SystemFields {
	readonly id: IdSystemField
	readonly createdAt: CreatedAtSystemField
	readonly updatedAt: UpdatedAtSystemField
}

/**
 * Identifies names that developer declarations cannot shadow.
 */
export const reservedSystemFieldNames: readonly [
	'id',
	'createdAt',
	'updatedAt',
] = immutableArray(['id', 'createdAt', 'updatedAt'])

export type ReservedSystemFieldName = (typeof reservedSystemFieldNames)[number]

const createSystemOptions = <
	const TGeneration extends SystemFieldGeneration,
	const TOptions extends object,
>(
	generatedOn: TGeneration,
	options: TOptions,
): Readonly<SystemFieldOptions<TGeneration> & TOptions> =>
	immutableRecord({
		...options,
		system: true,
		generatedOn,
		immutable: true,
		required: true,
	})

const id: IdSystemField = createFieldDefinition(
	'uuid',
	createSystemOptions('create', { uuidVersion: 7 }),
	normalizeStringValue,
)

const normalizeSystemDateTime = createDateTimeNormalizer(true)

const createdAt: CreatedAtSystemField = createFieldDefinition(
	'dateTime',
	createSystemOptions('create', {}),
	normalizeSystemDateTime,
)

const updatedAt: UpdatedAtSystemField = createFieldDefinition(
	'dateTime',
	createSystemOptions('createAndUpdate', {}),
	normalizeSystemDateTime,
)

/**
 * Reuses one immutable metadata set across every schema definition.
 */
export const systemFields: Readonly<SystemFields> = immutableRecord({
	id,
	createdAt,
	updatedAt,
})
