import type {
	AvailablePluginFieldKind,
	GenericField,
	SchemaDefinition,
} from '@ultimabase/core'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import type { FieldAccess } from './authoring/contracts.js'

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

/** Accepts only selectors created above, never structural lookalikes. */
export const readFieldKindAccessTarget = (target: unknown): string => {
	const kind = isPlainRecord(target) ? fieldKindTargets.get(target) : undefined
	if (kind === undefined) {
		throw new TypeError(
			'Access field-kind target must be created by defineFieldKindAccessTarget()',
		)
	}
	return kind
}

export interface FieldKindAccessContributionDefinition<
	TField extends GenericField = GenericField,
> {
	readonly create: (
		context: FieldKindAccessTargetContext<TField>,
	) => FieldAccess<TField>
	readonly target: FieldKindAccessTarget<TField>
	readonly targetKind: 'field-kind'
}

interface ErasedFieldKindAccessContributionDefinition {
	readonly create: (context: never) => FieldAccess<GenericField>
	readonly target: FieldKindAccessTarget<GenericField>
	readonly targetKind: 'field-kind'
}

export type AccessTargetContributionDefinition =
	ErasedFieldKindAccessContributionDefinition
