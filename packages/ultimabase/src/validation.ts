// A field's `validate` (D-23): a Standard Schema or a function, whose output
// is the stored value.
import type { Issue } from './errors.ts'
import type { FieldInfo, ModelInfo } from './schema.ts'
import { isObject } from './query-where.ts'

type Result =
	{ readonly value: unknown } | { readonly issues: readonly Issue[] }

function standardOf(validate: unknown): unknown {
	if (typeof validate !== 'object' && typeof validate !== 'function') {
		return undefined
	}
	if (validate === null) return undefined
	const standard: unknown = Reflect.get(validate, '~standard')
	return standard
}

/** A schema issue's path, behind the field's name. */
function pathOf(field: string, path: unknown): (string | number)[] {
	if (!Array.isArray(path)) return [field]
	return [
		field,
		...path.map((segment: unknown) => {
			const key = isObject(segment) ? segment['key'] : segment
			return typeof key === 'string' || typeof key === 'number'
				? key
				: String(key)
		}),
	]
}

function issuesOf(field: string, issues: readonly unknown[]): Issue[] {
	return issues.map((issue) => ({
		path: pathOf(field, isObject(issue) ? issue['path'] : undefined),
		message:
			isObject(issue) && typeof issue['message'] === 'string'
				? issue['message']
				: 'Invalid value.',
	}))
}

/** The value to store, or the issues that refuse it. */
export async function validated(
	model: ModelInfo,
	field: FieldInfo,
	value: unknown,
): Promise<Result> {
	const validate = field.options['validate']
	if (validate === undefined) return { value }
	const standard = standardOf(validate)
	if (isObject(standard) && typeof standard['validate'] === 'function') {
		const result: unknown = await Reflect.apply(
			standard['validate'],
			standard,
			[value],
		)
		if (isObject(result) && Array.isArray(result['issues'])) {
			return { issues: issuesOf(field.name, result['issues']) }
		}
		if (isObject(result) && 'value' in result) return { value: result['value'] }
		throw new TypeError(
			`${model.name}.${field.name}: the schema returned no Standard Schema result.`,
		)
	}
	if (typeof validate !== 'function') {
		throw new TypeError(
			`${model.name}.${field.name}: validate is a Standard Schema or a function (D-23).`,
		)
	}
	try {
		const output: unknown = await Reflect.apply(validate, undefined, [value])
		return { value: output }
	} catch (error) {
		// The function refuses by throwing; its message is for the client (D-88).
		const message = error instanceof Error ? error.message : String(error)
		return { issues: [{ path: [field.name], message }] }
	}
}
