import {
	defineSchemaOption,
	type FieldOptionDefinition,
	type SchemaDefinition,
	type SchemaOptionDefinition,
	type SchemaOptionRuntimeRequirement,
	type SchemaReference,
} from '@ultimabase/core'
import { definePluginFieldOption } from '@ultimabase/plugin-kit'

import type { SourceFieldHooksOption } from './authoring/source-contracts.js'
import type { SchemaHooks } from './authoring/contracts.js'
import {
	normalizeSchemaHookDeclarations,
	type SchemaHookDeclarations,
} from './authoring/declarations.js'
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

/** Owns the official schema `hooks` namespace as an opaque callback artifact. */
export const schemaHooksOption: SchemaOptionDefinition<
	SchemaHookDeclarations | undefined,
	SchemaOptionRuntimeRequirement,
	never
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
export const fieldHooksOption: FieldOptionDefinition<
	FieldHookDeclarations | undefined,
	SchemaOptionRuntimeRequirement,
	SourceFieldHooksOption
> = definePluginFieldOption({
	contexts: ['stored', 'embedded'],
	normalize: normalizeFieldHookDeclarations,
	protocolVersion: 1,
	typegen: false,
	valueKind: 'opaque',
})
