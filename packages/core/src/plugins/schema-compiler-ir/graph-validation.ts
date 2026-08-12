import { isPlainRecord } from '@ultimabase/shared'

import type { SchemaCompilerArtifactSession } from './artifacts.js'
import type {
	SchemaCompilerInput,
	SchemaCompilerSchemaNode,
} from './contracts.js'

/** Returns every schema identity that one complete output must preserve. */
export const collectExpectedSchemas = (
	input: SchemaCompilerInput,
): readonly SchemaCompilerSchemaNode[] => [
	...input.schemas,
	...input.declarations.flatMap(({ additions }) =>
		additions.map(({ schema }) => schema),
	),
]

/** Rejects ambiguous class names and repeated nominal schema identities. */
export const assertUniqueSchemaIdentities = (
	schemas: readonly unknown[],
	session: SchemaCompilerArtifactSession,
	path: string,
): void => {
	const references = new Set<object>()
	const classNames = new Set<string>()
	for (const [index, value] of schemas.entries()) {
		if (!isPlainRecord(value)) {
			throw new TypeError(
				`${path}.schemas[${String(index)}] must be a schema node`,
			)
		}
		if (!session.owns(value.artifact, 'schema')) {
			throw new TypeError(
				`${path}.schemas[${String(index)}].artifact must belong to this compilation`,
			)
		}
		if (typeof value.className !== 'string' || value.className.trim() === '') {
			throw new TypeError(
				`${path}.schemas[${String(index)}].className must be a non-empty string`,
			)
		}
		if (references.has(value.artifact) || classNames.has(value.className)) {
			throw new TypeError(
				`Duplicate schema compiler identity: ${value.className}`,
			)
		}
		references.add(value.artifact)
		classNames.add(value.className)
	}
}
