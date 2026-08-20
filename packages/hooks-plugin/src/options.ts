import {
	defineSchemaOption,
	type FieldDefinition,
	type FieldOptionValueCarrier,
	type GenericField,
	type ResolveFieldTypegenState,
	type SchemaDefinition,
	type SchemaOptionDefinition,
	type SchemaReference,
} from '@ultimabase/core'

import type { SchemaHooks } from './authoring/contracts.js'
import {
	normalizeSchemaHookDeclarations,
	type SchemaHookDeclarations,
} from './authoring/declarations.js'
import type { FieldHooks } from './authoring/field-contracts.js'
import {
	normalizeFieldHookDeclarations,
	type FieldHookDeclarations,
} from './authoring/field-declarations.js'

type SchemaForOptions<TOptions> =
	TOptions extends Readonly<{
		readonly className: infer TClassName extends string
	}>
		? SchemaReference<TClassName>
		: SchemaDefinition

/** Resolves the exact generated schema identity from `SchemaOptions<this>`. */
export type SchemaHooksOption<TOptions> = SchemaHooks<
	SchemaForOptions<TOptions>
>

type FieldForOptions<TOptions> =
	TOptions extends FieldOptionValueCarrier<infer TValue>
		? FieldDefinition<
				'field',
				TValue,
				Extract<TOptions, object>,
				ResolveFieldTypegenState<Extract<TOptions, object>>
			>
		: GenericField

/** Resolves exact scalar, list, and presence values from `FieldOptions<this>`. */
export type FieldHooksOption<TOptions> = FieldHooks<FieldForOptions<TOptions>>

/** Owns the official schema `hooks` namespace as an opaque callback artifact. */
export const schemaHooksOption: SchemaOptionDefinition<
	SchemaHookDeclarations | undefined
> = defineSchemaOption({
	normalize: normalizeSchemaHookDeclarations,
	protocolVersion: 1,
	typegen: {
		generic: 'self',
		module: '@ultimabase/hooks-plugin',
		type: 'SchemaHooksOption',
	},
	valueKind: 'opaque',
})

/** Owns the official field `hooks` namespace as an opaque callback artifact. */
export const fieldHooksOption: SchemaOptionDefinition<
	FieldHookDeclarations | undefined
> = defineSchemaOption({
	normalize: normalizeFieldHookDeclarations,
	protocolVersion: 1,
	typegen: {
		generic: 'self',
		module: '@ultimabase/hooks-plugin',
		type: 'FieldHooksOption',
	},
	valueKind: 'opaque',
})
