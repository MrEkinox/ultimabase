import { isPlainRecord } from '@ultimabase/shared'

import { isSharedEnum } from '../fields/builtins/shared-enum.js'
import type { SchemaDefinition } from './definition.js'
import { readSchemaDeclaredFields } from './definition-compilation.js'

/** Visits declared fields, embedded object children and virtual outputs. */
const collectSharedEnums = (
	value: unknown,
	found: (shared: unknown, path: string) => void,
	path: string,
	seen: WeakSet<object>,
): void => {
	if (typeof value !== 'object' || value === null || seen.has(value)) return
	seen.add(value)
	const options: unknown = Reflect.get(value, 'options')
	if (isPlainRecord(options)) {
		if (isSharedEnum(options.sharedEnum)) found(options.sharedEnum, path)
		if (isPlainRecord(options.fields)) {
			for (const [name, child] of Object.entries(options.fields)) {
				collectSharedEnums(child, found, `${path}.${name}`, seen)
			}
		}
	}
	collectSharedEnums(Reflect.get(value, 'output'), found, path, seen)
}

/**
 * Rejects two different shared enums with the same name in one application
 * (ADR-0310): generators would emit two types under one name.
 */
export const assertUniqueSharedEnumNames = (
	schemas: readonly SchemaDefinition[],
): void => {
	const byName = new Map<string, Readonly<{ path: string; shared: unknown }>>()
	const seen = new WeakSet<object>()
	for (const schema of schemas) {
		for (const [name, field] of Object.entries(
			readSchemaDeclaredFields(schema),
		)) {
			collectSharedEnums(
				field,
				(shared, path) => {
					if (!isSharedEnum(shared)) return
					const existing = byName.get(shared.name)
					if (existing === undefined) {
						byName.set(shared.name, { path, shared })
					} else if (existing.shared !== shared) {
						throw new TypeError(
							`Two different shared enums are named ${shared.name} (${existing.path} and ${path}); declare it once with defineEnum and reuse it`,
						)
					}
				},
				`${schema.className}.${name}`,
				seen,
			)
		}
	}
}
