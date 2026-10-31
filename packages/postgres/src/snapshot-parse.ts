// A snapshot read back from a database or `migrations/schema.json` (D-105),
// checked; a key 0.2 did not write is optional (D-170).
import type {
	Check,
	Column,
	ForeignKey,
	Search,
	Snapshot,
	TableSnapshot,
} from './snapshot.ts'

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

const isStrings = (value: unknown): value is string[] =>
	Array.isArray(value) && value.every((item) => typeof item === 'string')

/** Each entry of a record, checked by `read`, or `undefined`. */
function entries<T>(
	value: unknown,
	read: (item: unknown) => T | undefined,
): Record<string, T> | undefined {
	if (!isRecord(value)) return undefined
	const result: Record<string, T> = {}
	for (const [key, item] of Object.entries(value)) {
		const checked = read(item)
		if (checked === undefined) return undefined
		result[key] = checked
	}
	return result
}

const columnOf = (value: unknown): Column | undefined =>
	isRecord(value) &&
	typeof value['field'] === 'string' &&
	typeof value['type'] === 'string' &&
	typeof value['nullable'] === 'boolean'
		? {
				field: value['field'],
				type: value['type'],
				nullable: value['nullable'],
			}
		: undefined

const checkOf = (value: unknown): Check | undefined =>
	isRecord(value) &&
	typeof value['column'] === 'string' &&
	isStrings(value['values'])
		? {
				column: value['column'],
				values: value['values'],
				...(value['list'] === true ? { list: true as const } : {}),
			}
		: undefined

const foreignKeyOf = (value: unknown): ForeignKey | undefined =>
	isRecord(value) &&
	typeof value['column'] === 'string' &&
	typeof value['table'] === 'string' &&
	typeof value['cascade'] === 'boolean'
		? {
				column: value['column'],
				table: value['table'],
				cascade: value['cascade'],
			}
		: undefined

const stringsOf = (value: unknown): string[] | undefined =>
	isStrings(value) ? value : undefined

/** A search, `null` for none, or `undefined` when it is neither. */
const searchOf = (value: unknown): Search | null | undefined =>
	value === null
		? null
		: isRecord(value) &&
			  typeof value['index'] === 'string' &&
			  typeof value['language'] === 'string' &&
			  isStrings(value['columns'])
			? {
					index: value['index'],
					language: value['language'],
					columns: value['columns'],
				}
			: undefined

function tableOf(value: unknown): TableSnapshot | undefined {
	if (!isRecord(value)) return undefined
	const key = value['primaryKey']
	const columns = entries(value['columns'], columnOf)
	const uniques = entries(value['uniques'], stringsOf)
	const checks = entries(value['checks'], checkOf)
	const indexes = entries(value['indexes'], stringsOf)
	const trigrams = entries(value['trigrams'], (item) =>
		typeof item === 'string' ? item : undefined,
	)
	const foreignKeys = entries(value['foreignKeys'], foreignKeyOf)
	const search = searchOf(value['search'])
	const lower =
		value['lowerUniques'] === undefined
			? {}
			: entries(value['lowerUniques'], stringsOf)
	const model = value['model']
	if (
		typeof model !== 'string' ||
		!isRecord(key) ||
		typeof key['name'] !== 'string' ||
		!isStrings(key['columns']) ||
		columns === undefined ||
		uniques === undefined ||
		checks === undefined ||
		indexes === undefined ||
		trigrams === undefined ||
		foreignKeys === undefined ||
		search === undefined ||
		lower === undefined
	) {
		return undefined
	}
	const primaryKey = { name: key['name'], columns: key['columns'] }
	return {
		model,
		columns,
		primaryKey,
		uniques,
		checks,
		indexes,
		trigrams,
		foreignKeys,
		search,
		...(Object.keys(lower).length > 0 ? { lowerUniques: lower } : {}),
	}
}

/** A snapshot read back from a database or a file, checked. */
export function parseSnapshot(value: unknown): Snapshot {
	const tables = isRecord(value) ? entries(value['tables'], tableOf) : undefined
	if (!isRecord(value) || value['postgres'] !== 1 || tables === undefined) {
		throw new Error('The schema snapshot is not one postgres() wrote.')
	}
	return { postgres: 1, tables }
}
