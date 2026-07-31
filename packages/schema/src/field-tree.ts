import { isBuiltInField } from './built-in-field.js'
import type { GenericField } from './field.js'
import { assertNonEmptyString, isPlainRecord } from './runtime-value.js'

const assertPluginKind = (kind: string, path: string): void => {
	const separator = kind.indexOf('.')

	if (
		separator <= 0 ||
		separator === kind.length - 1 ||
		kind.trim() !== kind ||
		/\s/u.test(kind)
	) {
		throw new TypeError(`${path}.kind must use a namespaced identifier`)
	}
}

/**
 * Protects schema composition from malformed or circular JavaScript metadata.
 */
export function assertFieldDefinitionTree(
	value: unknown,
	path: string,
	ancestors: WeakSet<object> = new WeakSet<object>(),
): asserts value is GenericField {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a field definition`)
	}

	if (ancestors.has(value)) {
		throw new TypeError(`${path} must not contain circular field definitions`)
	}

	const { kind, options } = value

	if (typeof kind !== 'string' || !isPlainRecord(options)) {
		throw new TypeError(`${path} must be a field definition`)
	}

	assertNonEmptyString(kind, `${path}.kind`)

	if (!isBuiltInField({ kind })) {
		assertPluginKind(kind, path)
	}

	ancestors.add(value)

	try {
		if (kind !== 'object') {
			return
		}

		if (!isPlainRecord(options.fields)) {
			throw new TypeError(`${path}.options.fields must be a field map`)
		}

		for (const [name, field] of Object.entries(options.fields)) {
			assertNonEmptyString(name, 'object field name')
			assertFieldDefinitionTree(
				field,
				`${path}.options.fields.${name}`,
				ancestors,
			)
		}
	} finally {
		ancestors.delete(value)
	}
}
