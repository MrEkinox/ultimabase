import {
	defineSchemaOption,
	type FieldOptionValueCarrier,
	type FieldOptionDefinition,
	type SchemaDefinition,
	type SchemaOptionDefinition,
	type SchemaReference,
} from '@ultimabase/core'
import { definePluginFieldOption } from '@ultimabase/plugin-kit'

import type { SchemaAccess } from './authoring/contracts.js'
import { normalizeSchemaAccessDeclarations } from './authoring/declarations.js'
import type { FieldAccessFor } from './authoring/contracts.js'
import type { RelationFieldAccess } from './authoring/contracts.js'
import { normalizeFieldAccessDeclarations } from './authoring/field-declarations.js'

type SchemaForOptions<TOptions> =
	TOptions extends Readonly<{
		readonly className: infer TClassName extends string
	}>
		? SchemaReference<TClassName>
		: SchemaDefinition

/** Resolves the generated schema identity used by one `access` declaration. */
export type SchemaAccessOption<TOptions> = SchemaAccess<
	SchemaForOptions<TOptions>
>

type FieldOptionInput<TOptions> = Omit<TOptions, 'access'>

type FieldValueForOptions<TOptions> =
	FieldOptionInput<TOptions> extends FieldOptionValueCarrier<infer TValue>
		? FieldOptionInput<TOptions> extends { readonly list: true }
			? readonly TValue[]
			: TValue
		: unknown

type FieldObjectValueForOptions<TOptions> =
	FieldOptionInput<TOptions> extends { readonly required: true }
		? FieldValueForOptions<TOptions>
		: FieldValueForOptions<TOptions> | null

type RelationTargetForOptions<TOptions> =
	FieldOptionInput<TOptions> extends {
		readonly target: () => infer TTarget extends SchemaDefinition
	}
		? TTarget
		: FieldOptionInput<TOptions> extends {
					readonly target: infer TTargetName extends string
			  }
			? SchemaReference<TTargetName>
			: SchemaDefinition

/** Resolves exact scalar, list, and presence values for field Access rules. */
export type FieldAccessOption<TOptions> = [
	FieldValueForOptions<TOptions>,
] extends [never]
	? RelationFieldAccess<RelationTargetForOptions<TOptions>>
	: FieldAccessFor<
			FieldObjectValueForOptions<TOptions>,
			FieldObjectValueForOptions<TOptions>
		>

/** Owns the official schema `access` namespace as an opaque policy artifact. */
export const schemaAccessOption: SchemaOptionDefinition<
	ReturnType<typeof normalizeSchemaAccessDeclarations>
> = defineSchemaOption({
	normalize: normalizeSchemaAccessDeclarations,
	protocolVersion: 1,
	typegen: {
		generic: 'self',
		module: '@ultimabase/access-plugin',
		type: 'SchemaAccessOption',
	},
	valueKind: 'opaque',
})

/** Owns the official field `access` namespace as an opaque policy artifact. */
export const fieldAccessOption: FieldOptionDefinition<
	ReturnType<typeof normalizeFieldAccessDeclarations>
> = definePluginFieldOption({
	contexts: ['stored', 'embedded', 'virtual'],
	normalize: normalizeFieldAccessDeclarations,
	protocolVersion: 1,
	typegen: {
		generic: 'self',
		module: '@ultimabase/access-plugin',
		type: 'FieldAccessOption',
	},
	valueKind: 'opaque',
})
