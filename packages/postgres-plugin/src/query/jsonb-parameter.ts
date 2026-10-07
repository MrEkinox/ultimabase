/** Serializes one validated value without interpolating JSON into SQL text. */
export const stringifyPostgresJsonbParameter = (value: unknown): string => {
	const serialized: unknown = JSON.stringify(value)

	if (typeof serialized !== 'string') {
		throw new TypeError('PostgreSQL JSONB filter value must be serializable')
	}

	return serialized
}
