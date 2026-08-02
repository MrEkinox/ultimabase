import { isPlainRecord } from '@ultimabase/shared'

import {
	normalizeHookDeclarations,
	type NormalizedHookDeclarations,
} from './normalization.js'

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

/** Retains only validated handlers inside a field's private capabilities. */
export type FieldHookDeclarations = NormalizedHookDeclarations<FieldHookPhase>

/** Copies and validates one field hook declaration without executing handlers. */
export const normalizeFieldHookDeclarations = (
	hooks: unknown,
): FieldHookDeclarations | undefined =>
	normalizeHookDeclarations({
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
