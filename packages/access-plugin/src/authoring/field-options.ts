import { isPlainRecord } from '@ultimabase/shared'

import {
	normalizeFieldAccessDeclarations,
	type FieldAccessDeclarations,
} from './field-declarations.js'

/** Removes Core-owned Access callbacks while retaining every plugin option verbatim. */
export const splitFieldAccessOptions = <TMetadata extends object>(
	options: TMetadata & { readonly access?: unknown },
	normalizeAccess: (
		access: unknown,
	) => FieldAccessDeclarations | undefined = normalizeFieldAccessDeclarations,
): Readonly<{
	readonly access: FieldAccessDeclarations | undefined
	readonly metadataOptions: TMetadata
}> => {
	if (!isPlainRecord(options)) {
		throw new TypeError('field options must be an object')
	}

	if (!Object.hasOwn(options, 'access')) {
		return { access: undefined, metadataOptions: options }
	}

	const { access, ...metadataOptions } = options
	return {
		access: normalizeAccess(access),
		metadataOptions: metadataOptions as TMetadata,
	}
}
