// `.with({ access: { … }, rest: { … } })` (spike/with-object): one entry per
// rules key of the installed plugins plus Core's `relations`, checked against
// the rule names declared when each plugin was created, without naming one.

/**
 * The parameter of `.with({ … })`: one entry per rule, typed against the
 * complete schema. The rules in `TRequired` (`acl` once `acl: true`) are
 * required properties.
 */
export type SchemaRulesObject<TRules, TRequired extends PropertyKey> = [
	keyof TRules,
] extends [never]
	? // No rule at all: an empty type would accept any key.
		Readonly<Record<string, never>>
	: [TRequired] extends [never]
		? TRules
		: TRules & {
				readonly [TName in TRequired & keyof TRules]-?: Exclude<
					TRules[TName],
					undefined
				>
			}

/**
 * @internal Reads the object form of `.with({ … })`: every key must be a rule
 * name declared by an installed plugin (or Core's `relations`); `undefined`
 * entries count as absent.
 */
export const readSchemaRulesObject = (
	input: object,
	names: readonly string[],
	className: string,
): Readonly<Record<string, unknown>> => {
	const entries: [string, unknown][] = []
	for (const key of Reflect.ownKeys(input)) {
		if (typeof key !== 'string' || !names.includes(key)) {
			throw new TypeError(
				`${className}.with({ ${String(key)} }): ${String(key)} is not a rule of an installed plugin; .with accepts ${names.join(', ')}`,
			)
		}
		const value: unknown = Reflect.get(input, key)
		if (value !== undefined) entries.push([key, value])
	}
	// Rule names come from installed plugins; entries are copied as entries.
	return Object.fromEntries(entries)
}
