// A field's `validate` (D-23): a Standard Schema or a function, whose output
// is the stored value.
import type { Issue } from './errors.ts'
import type { StandardSchema } from './fields.ts'
import type { FieldInfo, ModelInfo } from './schema.ts'
import { isObject } from './query-where.ts'

export type Result =
	{ readonly value: unknown } | { readonly issues: readonly Issue[] }

/** A Standard Schema, its `~standard` and that object's `validate`. */
export type Standard = {
	readonly schema: StandardSchema
	readonly self: object
	readonly validate: Function
}

/** A Standard Schema's `~standard`, or `undefined` for any other value. */
export function standardOf(schema: unknown): Standard | undefined {
	if (typeof schema !== 'object' && typeof schema !== 'function') {
		return undefined
	}
	if (schema === null) return undefined
	const standard: unknown = Reflect.get(schema, '~standard')
	if (!isObject(standard) || typeof standard['validate'] !== 'function') {
		return undefined
	}
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a `~standard` with a `validate` is the interface; each result is checked.
	const typed = schema as StandardSchema
	return { schema: typed, self: standard, validate: standard['validate'] }
}

/** A schema issue's path, behind `prefix`. */
function pathOf(
	prefix: readonly (string | number)[],
	path: unknown,
): (string | number)[] {
	if (!Array.isArray(path)) return [...prefix]
	return [
		...prefix,
		...path.map((segment: unknown) => {
			const key = isObject(segment) ? segment['key'] : segment
			return typeof key === 'string' || typeof key === 'number'
				? key
				: String(key)
		}),
	]
}

/**
 * What a Standard Schema returns for `value`, its issues' paths behind
 * `prefix`; `where` names the schema when it breaks the standard.
 */
export async function checked(
	standard: Standard,
	value: unknown,
	prefix: readonly (string | number)[],
	where: string,
): Promise<Result> {
	const result: unknown = await Reflect.apply(
		standard.validate,
		standard.self,
		[value],
	)
	if (isObject(result) && Array.isArray(result['issues'])) {
		return {
			issues: result['issues'].map((issue: unknown) => ({
				path: pathOf(prefix, isObject(issue) ? issue['path'] : undefined),
				message:
					isObject(issue) && typeof issue['message'] === 'string'
						? issue['message']
						: 'Invalid value.',
			})),
		}
	}
	if (isObject(result) && 'value' in result) return { value: result['value'] }
	throw new TypeError(
		`${where}: the schema returned no Standard Schema result.`,
	)
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
	if (standard !== undefined) {
		return checked(standard, value, [field.name], `${model.name}.${field.name}`)
	}
	if (typeof validate !== 'function') {
		throw new TypeError(
			`${model.name}.${field.name}: validate is a Standard Schema or a function.`,
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
