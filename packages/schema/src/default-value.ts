import { immutableRecord } from '@ultimabase/shared'

/**
 * Produces one value when the runtime creates an object.
 */
export type DefaultFactory<TValue> = () => TValue

/**
 * Distinguishes the three default execution boundaries available to adapters.
 */
export type DefaultKind = 'database' | 'runtime' | 'static'

const assertDatabaseDefaultConfig = (config: unknown): void => {
	if (
		typeof config !== 'object' ||
		config === null ||
		Array.isArray(config)
	) {
		throw new TypeError('Database default config must be an object')
	}
}

/**
 * Carries an adapter-owned database expression without coupling Schema to one database.
 */
export class DatabaseDefault<TValue, TConfig extends object = object> {
	public readonly kind = 'database' as const
	public readonly name: string
	public readonly config: Readonly<TConfig>
	declare private readonly valueType: TValue

	public constructor(name: string, config: TConfig) {
		if (typeof name !== 'string' || name.length === 0) {
			throw new TypeError('Database default name cannot be empty')
		}

		assertDatabaseDefaultConfig(config)

		this.name = name
		this.config = immutableRecord(config)

		// Database defaults are immutable values that adapters may safely inspect later.
		Object.freeze(this)
	}
}

/**
 * Represents static data, runtime behavior, or an adapter-owned database default.
 */
export type FieldDefault<TValue> =
	DatabaseDefault<TValue> | DefaultFactory<TValue> | TValue

/**
 * Narrows metadata to a static value without invoking executable defaults.
 */
export const isStaticDefault = <TValue>(
	value: FieldDefault<TValue>,
): value is TValue =>
	typeof value !== 'function' && !(value instanceof DatabaseDefault)

/**
 * Classifies default metadata without executing a runtime factory.
 */
export const getDefaultKind = (value: unknown): DefaultKind => {
	if (typeof value === 'function') {
		return 'runtime'
	}

	return value instanceof DatabaseDefault ? 'database' : 'static'
}
