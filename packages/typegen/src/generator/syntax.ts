const TypeScriptKeywords = new Set([
	'break',
	'case',
	'catch',
	'class',
	'const',
	'continue',
	'debugger',
	'default',
	'delete',
	'do',
	'else',
	'enum',
	'export',
	'extends',
	'false',
	'finally',
	'for',
	'function',
	'if',
	'import',
	'in',
	'instanceof',
	'new',
	'null',
	'return',
	'super',
	'switch',
	'this',
	'throw',
	'true',
	'try',
	'typeof',
	'var',
	'void',
	'while',
	'with',
])

export const quote = (value: string): string => JSON.stringify(value)

export const propertyName = (value: string): string =>
	/^[$A-Z_a-z][$0-9A-Z_a-z]*$/u.test(value) ? value : quote(value)

export const typeIdentifier = (value: string): string => {
	const normalized = value.replaceAll(/[^$0-9A-Z_a-z]/gu, '_')
	const prefixed = /^[$A-Z_a-z]/u.test(normalized)
		? normalized
		: `_${normalized}`

	return TypeScriptKeywords.has(prefixed) ? `_${prefixed}` : prefixed
}

/** Capitalizes a type identifier, which is never empty (`''` becomes `_`). */
export const fieldIdentifier = (value: string): string => {
	const normalized = typeIdentifier(value)

	return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`
}

export const renderDocumentation = (
	description: string | undefined,
): string => {
	if (description === undefined) {
		return ''
	}

	const normalized = description
		.replaceAll('*/', '* /')
		.replaceAll(/\s+/gu, ' ')

	return `\t/** ${normalized.trim()} */\n`
}

export const renderUnion = (values: readonly string[]): string =>
	values.length === 0 ? 'never' : values.join(' | ')
