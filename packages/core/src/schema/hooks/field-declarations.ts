import { isPlainRecord } from '@ultimabase/shared'

import {
	normalizeHookDeclarations,
	type HookPhaseDescriptor,
	type NormalizedHookDeclarations,
} from './normalization.js'
import {
	mutationHookFamilies,
	operationHookFamilies,
	saveHookFamilies,
} from './family-keys.js'

/** Lists accepted inline phases once so declaration validation cannot drift. */
export const fieldHookPhases = [
	'resolveInput',
	'validate',
	'beforeCreate',
	'afterCreate',
	'beforeUpdate',
	'afterUpdate',
	'beforeUpsert',
	'afterUpsert',
	'beforeDelete',
	'afterDelete',
	'beforeSave',
	'afterSave',
	'resolveOutput',
	'onChange',
	'afterCommit',
	'afterRollback',
	'onError',
] as const

/** Identifies every field phase accepted at the declaration boundary. */
export type FieldHookPhase = (typeof fieldHookPhases)[number]

// Inline exact phases stay direct while reusable lifecycle phases may specialize.
const fieldHookPhaseDescriptors = {
	resolveInput: { order: 'broad-first', variants: saveHookFamilies },
	validate: { order: 'broad-first', variants: saveHookFamilies },
	beforeSave: { order: 'broad-first', variants: saveHookFamilies },
	afterSave: { order: 'specific-first', variants: saveHookFamilies },
	resolveOutput: { order: 'specific-first', variants: operationHookFamilies },
	onChange: { order: 'broad-first', variants: mutationHookFamilies },
	afterCommit: { order: 'specific-first', variants: mutationHookFamilies },
	afterRollback: {
		order: 'specific-first',
		variants: mutationHookFamilies,
	},
	onError: { order: 'specific-first', variants: operationHookFamilies },
} as const satisfies Readonly<
	Partial<Record<FieldHookPhase, HookPhaseDescriptor>>
>

/** Retains only validated handlers inside a field's private capabilities. */
export type FieldHookDeclarations = NormalizedHookDeclarations<FieldHookPhase>

/** Copies and validates one field hook declaration without executing handlers. */
export const normalizeFieldHookDeclarations = (
	hooks: unknown,
): FieldHookDeclarations | undefined =>
	normalizeHookDeclarations({
		descriptors: fieldHookPhaseDescriptors,
		hooks,
		phases: fieldHookPhases,
		scope: 'field',
	})

/** Separates declaration-only callbacks from stable physical field metadata. */
export const splitFieldDeclarationOptions = <TMetadata extends object>(
	options: TMetadata & { readonly hooks?: unknown },
): Readonly<{
	hooks: FieldHookDeclarations | undefined
	metadataOptions: TMetadata
}> => {
	if (!isPlainRecord(options)) {
		throw new TypeError('field options must be an object')
	}

	if (!Object.hasOwn(options, 'hooks')) {
		return {
			hooks: undefined,
			metadataOptions: options,
		}
	}

	const { hooks, ...metadataOptions } = options

	return {
		hooks: normalizeFieldHookDeclarations(hooks),
		// The single omitted declaration key is not part of physical metadata.
		metadataOptions: metadataOptions as TMetadata,
	}
}
