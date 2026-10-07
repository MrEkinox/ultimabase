import {
	assertNonEmptyString,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import { assertExactEnumerableKeys } from '../exact-object-validation.js'

const typegenReferenceBrand: unique symbol = Symbol('TypegenReference')
const typegenReferences = new WeakSet<object>()
const identifierPattern = /^[$A-Z_a-z][$\w]*$/u

/** Names one public exported TypeScript type without importing executable code. */
export interface TypegenReference<
	TModule extends string = string,
	TExportName extends string = string,
> {
	readonly [typegenReferenceBrand]: true
	readonly exportName: TExportName
	readonly module: TModule
}

/** Creates one nominal inert reference that still requires `typegen:reference`. */
export const defineTypegenReference = <
	const TModule extends string,
	const TExportName extends string,
>(options: {
	readonly exportName: TExportName
	readonly module: TModule
}): TypegenReference<TModule, TExportName> => {
	if (!isPlainRecord(options)) {
		throw new TypeError('Typegen reference must be a plain object')
	}
	assertExactEnumerableKeys(
		options,
		new Set(['exportName', 'module']),
		'Typegen reference contains unknown option: ',
	)
	assertNonEmptyString(options.module, 'Typegen reference module')
	assertNonEmptyString(options.exportName, 'Typegen reference exportName')
	if (options.module.trim() !== options.module || /\s/u.test(options.module)) {
		throw new TypeError('Typegen reference module must be a stable specifier')
	}
	if (!identifierPattern.test(options.exportName)) {
		throw new TypeError('Typegen reference exportName must be an identifier')
	}
	const reference = immutableRecord({
		[typegenReferenceBrand]: true as const,
		...options,
	})
	typegenReferences.add(reference)
	return reference
}

export const isTypegenReference = (value: unknown): value is TypegenReference =>
	typeof value === 'object' && value !== null && typegenReferences.has(value)
