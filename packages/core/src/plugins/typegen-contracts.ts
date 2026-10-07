import { assertNonEmptyString, immutableRecord } from '@ultimabase/shared'

import { assertExactEnumerablePlainObject } from '../exact-object-validation.js'

const typegenReferenceBrand: unique symbol = Symbol('TypegenReference')
const typegenReferences = new WeakSet<object>()

/** TypeScript identifiers accepted for generated type and property names. */
export const typeScriptIdentifierPattern = /^[$A-Z_a-z][$\w]*$/u

/** Rejects module specifiers with surrounding or embedded whitespace. */
export const isStableModuleSpecifier = (value: string): boolean =>
	value.trim() === value && !/\s/u.test(value)

/** Validates one non-empty TypeScript export identifier at a declaration path. */
export const assertTypeExportName = (value: unknown, path: string): string => {
	assertNonEmptyString(value, path)
	if (!typeScriptIdentifierPattern.test(value)) {
		throw new TypeError(`${path} must be a TypeScript export identifier`)
	}
	return value
}

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
	assertExactEnumerablePlainObject(
		options,
		new Set(['exportName', 'module']),
		'Typegen reference must be a plain object',
		'Typegen reference contains unknown option: ',
	)
	assertNonEmptyString(options.module, 'Typegen reference module')
	assertNonEmptyString(options.exportName, 'Typegen reference exportName')
	if (!isStableModuleSpecifier(options.module)) {
		throw new TypeError('Typegen reference module must be a stable specifier')
	}
	if (!typeScriptIdentifierPattern.test(options.exportName)) {
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
