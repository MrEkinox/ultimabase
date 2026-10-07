import {
	defineSchemaOption,
	type FieldOptionDefinition,
	type PluginSourceFieldObjectValue,
	type PluginSourceFieldOptionByKind,
	type PluginSourceFieldValue,
	type PluginSourceOpaque,
	type PluginSourceRelationChange,
	type SchemaDefinition,
	type SchemaOptionDefinition,
	type SchemaOptionRuntimeRequirement,
	type SchemaReference,
} from '@ultimabase/core'
import { definePluginFieldOption } from '@ultimabase/plugin-kit'
import type { MaybePromise } from '@ultimabase/shared'

import type { AccessContext } from './context.js'
import type { SchemaAccess } from './authoring/contracts.js'
import {
	normalizeFieldAccessDeclarations,
	normalizeSchemaAccessDeclarations,
} from './authoring/declarations.js'

type SourceAccessDecision<TInput> =
	boolean | ((input: TInput) => MaybePromise<boolean>)

type SchemaForOptions<TOptions> =
	TOptions extends Readonly<{
		readonly className: infer TClassName extends string
	}>
		? SchemaReference<TClassName>
		: SchemaDefinition

/** Resolves the exact generated schema identity used by one `access` declaration. */
export type SchemaAccessOption<TOptions> = SchemaAccess<
	SchemaForOptions<TOptions>
>

interface SourceFieldAccessInput {
	readonly context: PluginSourceOpaque<AccessContext>
}

interface SourceFieldValueAccessInput {
	readonly context: PluginSourceOpaque<AccessContext>
	readonly value: PluginSourceFieldObjectValue
}

interface SourceFieldPresentValueAccessInput {
	readonly context: PluginSourceOpaque<AccessContext>
	readonly value: PluginSourceFieldValue
}

interface SourceFieldReplaceAccessInput extends SourceFieldPresentValueAccessInput {
	readonly originalValue: PluginSourceFieldValue
}

interface SourceFieldClearAccessInput {
	readonly context: PluginSourceOpaque<AccessContext>
	readonly originalValue: PluginSourceFieldObjectValue
}

interface SourceFieldReadAccessOption {
	readonly orderBy: SourceAccessDecision<SourceFieldAccessInput>
	readonly output: SourceAccessDecision<SourceFieldValueAccessInput>
	readonly where: SourceAccessDecision<SourceFieldAccessInput>
}

interface SourceFieldWriteAccessOption {
	readonly clear: SourceAccessDecision<SourceFieldClearAccessInput>
	readonly fill: SourceAccessDecision<SourceFieldPresentValueAccessInput>
	readonly replace: SourceAccessDecision<SourceFieldReplaceAccessInput>
}

interface SourceValueFieldAccessOption {
	readonly read?: boolean | SourceFieldReadAccessOption
	readonly write?: boolean | SourceFieldWriteAccessOption
}

interface SourceRelationWriteAccessInput extends SourceFieldAccessInput {
	readonly change: PluginSourceRelationChange
}

interface SourceRelationFieldAccessOption {
	readonly read?: SourceAccessDecision<SourceFieldAccessInput>
	readonly write?: SourceAccessDecision<SourceRelationWriteAccessInput>
}

type SourceFieldAccessOption = PluginSourceFieldOptionByKind<
	SourceValueFieldAccessOption,
	SourceRelationFieldAccessOption
>

/** Owns the official schema `access` namespace as an opaque policy artifact. */
export const schemaAccessOption: SchemaOptionDefinition<
	ReturnType<typeof normalizeSchemaAccessDeclarations>,
	SchemaOptionRuntimeRequirement,
	never
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
	ReturnType<typeof normalizeFieldAccessDeclarations>,
	SchemaOptionRuntimeRequirement,
	SourceFieldAccessOption
> = definePluginFieldOption({
	contexts: ['stored', 'embedded', 'virtual'],
	normalize: normalizeFieldAccessDeclarations,
	protocolVersion: 1,
	typegen: false,
	valueKind: 'opaque',
})
