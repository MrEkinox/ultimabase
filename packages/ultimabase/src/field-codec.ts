// Plugin field values decoded as rows leave the adapter (D-122): code, rules
// and hooks read the value, the adapter its stored form.
import type { Nested, Row } from './adapter.ts'
import type { Codec } from './definition.ts'
import { isObject } from './query-where.ts'
import type { ModelInfo } from './schema.ts'

type Models = ReadonlyMap<string, ModelInfo>
type Codecs = readonly (readonly [string, Codec])[]

const known = new WeakMap<ModelInfo, Codecs>()

function codecsOf(model: ModelInfo): Codecs {
	const found = known.get(model)
	if (found !== undefined) return found
	const codecs = [...model.fields.values()].flatMap((field) =>
		field.kind === 'scalar' && field.codec !== undefined
			? [[field.name, field.codec] as const]
			: [],
	)
	known.set(model, codecs)
	return codecs
}

/** The row with its plugin fields decoded, its included rows' too. */
function decodedRow(
	models: Models,
	model: ModelInfo,
	read: Nested,
	row: Row,
): Row {
	const changed: { [field: string]: unknown } = {}
	// `null` is stored as is, never decoded.
	for (const [name, codec] of codecsOf(model)) {
		const value = row[name]
		if (value !== undefined && value !== null) {
			changed[name] = codec.decode(value)
		}
	}
	for (const [name, nested] of Object.entries(read.include ?? {})) {
		const field = model.fields.get(name)
		const target =
			field === undefined || field.kind === 'scalar'
				? undefined
				: models.get(field.target)
		const value = row[name]
		if (target === undefined) continue
		if (Array.isArray(value)) {
			changed[name] = value.map((item: unknown) =>
				isRow(item) ? decodedRow(models, target, nested, item) : item,
			)
		} else if (isRow(value)) {
			changed[name] = decodedRow(models, target, nested, value)
		}
	}
	return Object.keys(changed).length === 0 ? row : { ...row, ...changed }
}

const isRow = (value: unknown): value is Row =>
	isObject(value) && typeof value['id'] === 'string'

/** The rows `read` returned, decoded. */
export function decoded(
	models: Models,
	read: (Nested & { readonly model: string }) | undefined,
	rows: Row[],
): Row[] {
	const model = read === undefined ? undefined : models.get(read.model)
	if (read === undefined || model === undefined) return rows
	return rows.map((row) => decodedRow(models, model, read, row))
}
