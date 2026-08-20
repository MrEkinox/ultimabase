import type {
	AvailablePluginFieldKind,
	FieldExtension,
	GenericField,
	SchemaDefinition,
	SchemaExtension,
} from '@ultimabase/core'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import type { FieldAccess, SchemaAccess } from './authoring/contracts.js'
import type { FieldAccessDeclarations } from './authoring/field-declarations.js'
import type { SchemaAccessDeclarations } from './authoring/declarations.js'

export interface SchemaExtensionAccessTargetContext<
	TExtension extends SchemaExtension<string, object>,
> {
	readonly extension: TExtension
	readonly schema: SchemaDefinition
}

export interface FieldExtensionAccessTargetContext<
	TExtension extends FieldExtension<string, object>,
> {
	readonly extension: TExtension
	readonly field: GenericField
	readonly path: readonly string[]
	readonly schema: SchemaDefinition
}

export interface FieldKindAccessTargetContext<TField extends GenericField> {
	readonly field: TField
	readonly path: readonly string[]
	readonly schema: SchemaDefinition
}

export interface FieldKindAccessTarget<TField extends GenericField> {
	readonly kind: TField['kind']
}

const fieldKindTargets = new WeakMap<object, string>()

/** Creates one typed selector for a namespaced community field kind. */
export const defineFieldKindAccessTarget = <TField extends GenericField>(
	kind: AvailablePluginFieldKind<TField['kind']>,
): FieldKindAccessTarget<TField> => {
	if (
		typeof kind !== 'string' ||
		!kind.includes('.') ||
		kind.startsWith('.') ||
		kind.endsWith('.') ||
		/\s/u.test(kind)
	) {
		throw new TypeError('Access field-kind target must be namespaced')
	}
	const target = immutableRecord({ kind })
	fieldKindTargets.set(target, kind)
	return target
}

export const readFieldKindAccessTarget = (target: unknown): string => {
	if (!isPlainRecord(target)) {
		throw new TypeError(
			'Access field-kind target must be created by defineFieldKindAccessTarget()',
		)
	}
	const kind = fieldKindTargets.get(target)
	if (kind === undefined) {
		throw new TypeError(
			'Access field-kind target must be created by defineFieldKindAccessTarget()',
		)
	}
	return kind
}

interface TargetDefinitionBase {
	readonly master: 'bypass' | 'enforce'
}

export interface SchemaExtensionAccessContributionDefinition<
	TExtension extends SchemaExtension<string, object> = SchemaExtension<
		string,
		object
	>,
> extends TargetDefinitionBase {
	readonly create: (
		context: SchemaExtensionAccessTargetContext<TExtension>,
	) => SchemaAccess<SchemaDefinition>
	readonly extension: TExtension
	readonly targetKind: 'schema-extension'
}

export interface FieldExtensionAccessContributionDefinition<
	TExtension extends FieldExtension<string, object> = FieldExtension<
		string,
		object
	>,
> extends TargetDefinitionBase {
	readonly create: (
		context: FieldExtensionAccessTargetContext<TExtension>,
	) => FieldAccess<GenericField>
	readonly extension: TExtension
	readonly targetKind: 'field-extension'
}

export interface FieldKindAccessContributionDefinition<
	TField extends GenericField = GenericField,
> extends TargetDefinitionBase {
	readonly create: (
		context: FieldKindAccessTargetContext<TField>,
	) => FieldAccess<TField>
	readonly target: FieldKindAccessTarget<TField>
	readonly targetKind: 'field-kind'
}

interface ErasedSchemaExtensionAccessContributionDefinition extends TargetDefinitionBase {
	readonly create: (context: never) => SchemaAccess<SchemaDefinition>
	readonly extension: SchemaExtension<string, object>
	readonly targetKind: 'schema-extension'
}

interface ErasedFieldExtensionAccessContributionDefinition extends TargetDefinitionBase {
	readonly create: (context: never) => FieldAccess<GenericField>
	readonly extension: FieldExtension<string, object>
	readonly targetKind: 'field-extension'
}

interface ErasedFieldKindAccessContributionDefinition extends TargetDefinitionBase {
	readonly create: (context: never) => FieldAccess<GenericField>
	readonly target: FieldKindAccessTarget<GenericField>
	readonly targetKind: 'field-kind'
}

export type AccessTargetContributionDefinition =
	| ErasedFieldExtensionAccessContributionDefinition
	| ErasedFieldKindAccessContributionDefinition
	| ErasedSchemaExtensionAccessContributionDefinition

export type ResolvedAccessTargetDeclarations =
	FieldAccessDeclarations | SchemaAccessDeclarations
