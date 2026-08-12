import { assertNonEmptyString, isPlainRecord } from '@ultimabase/shared'

import type { SchemaCompilerArtifactSession } from './artifacts.js'
import { isSchemaCompilerArtifactReference } from './artifacts.js'
import {
	assertSchemaCompilationProvenance,
	assertSchemaContributionProvenance,
	assertSchemaOptionProvenance,
} from './provenance-validation.js'
import { assertExactKeys, readList } from './validation-helpers.js'

const schemaKeys = new Set([
	'artifact',
	'className',
	'constraints',
	'developerFieldNames',
	'extensions',
	'fields',
	'indexes',
	'options',
	'provenance',
])

const assertOptionNode = (
	value: unknown,
	session: SchemaCompilerArtifactSession,
	path: string,
	allowedOwners?: ReadonlySet<string>,
): void => {
	if (!isPlainRecord(value))
		throw new TypeError(`${path} must be an option node`)
	assertExactKeys(value, new Set(['name', 'provenance', 'value']), path)
	assertNonEmptyString(value.name, `${path}.name`)
	assertSchemaOptionProvenance(
		value.provenance,
		`${path}.provenance`,
		allowedOwners,
	)
	if (
		isSchemaCompilerArtifactReference(value.value) &&
		!session.owns(value.value, 'option-value')
	) {
		throw new TypeError(`${path}.value must be a portable value artifact`)
	}
}

/** Validates one extension node, including the fields needed for IR transforms. */
export const assertSchemaCompilerExtensionNode = (
	value: unknown,
	session: SchemaCompilerArtifactSession,
	path: string,
	allowedOwners?: ReadonlySet<string>,
): void => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be an extension node`)
	}
	assertExactKeys(
		value,
		new Set(['artifact', 'fields', 'name', 'provenance']),
		path,
	)
	if (!session.owns(value.artifact, 'extension')) {
		throw new TypeError(`${path}.artifact must be an extension artifact`)
	}
	assertNonEmptyString(value.name, `${path}.name`)
	assertSchemaContributionProvenance(
		value.provenance,
		`${path}.provenance`,
		allowedOwners,
	)
	const fieldNames = new Set<string>()
	for (const [index, field] of readList(value, 'fields', path).entries()) {
		assertFieldNode(
			field,
			session,
			`${path}.fields[${String(index)}]`,
			allowedOwners,
		)
		if (isPlainRecord(field) && typeof field.name === 'string') {
			if (fieldNames.has(field.name)) {
				throw new TypeError(`${path} contains duplicate field: ${field.name}`)
			}
			fieldNames.add(field.name)
		}
	}
}

const assertFieldNode = (
	value: unknown,
	session: SchemaCompilerArtifactSession,
	path: string,
	allowedOwners?: ReadonlySet<string>,
): void => {
	if (!isPlainRecord(value)) throw new TypeError(`${path} must be a field node`)
	assertExactKeys(
		value,
		new Set(['artifact', 'fields', 'kind', 'name', 'options', 'provenance']),
		path,
	)
	if (!session.owns(value.artifact, 'field')) {
		throw new TypeError(`${path}.artifact must be a field artifact`)
	}
	assertNonEmptyString(value.kind, `${path}.kind`)
	assertNonEmptyString(value.name, `${path}.name`)
	assertSchemaContributionProvenance(
		value.provenance,
		`${path}.provenance`,
		allowedOwners,
	)
	const nestedFieldNames = new Set<string>()
	for (const [index, field] of readList(value, 'fields', path).entries()) {
		assertFieldNode(
			field,
			session,
			`${path}.fields[${String(index)}]`,
			allowedOwners,
		)
		if (isPlainRecord(field) && typeof field.name === 'string') {
			if (nestedFieldNames.has(field.name)) {
				throw new TypeError(`${path} contains duplicate field: ${field.name}`)
			}
			nestedFieldNames.add(field.name)
		}
	}
	for (const [index, option] of readList(value, 'options', path).entries()) {
		assertOptionNode(
			option,
			session,
			`${path}.options[${String(index)}]`,
			allowedOwners,
		)
	}
}

/** Validates one field node used either by a schema or a patch operation. */
export const assertSchemaCompilerFieldNode = (
	value: unknown,
	session: SchemaCompilerArtifactSession,
	path: string,
	allowedOwners?: ReadonlySet<string>,
): void => {
	assertFieldNode(value, session, path, allowedOwners)
}

/** Validates one complete logical schema node and its nominal artifacts. */
export const assertSchemaCompilerSchemaNode = (
	value: unknown,
	session: SchemaCompilerArtifactSession,
	path: string,
	allowedOwners?: ReadonlySet<string>,
): void => {
	if (!isPlainRecord(value))
		throw new TypeError(`${path} must be a schema node`)
	assertExactKeys(value, schemaKeys, path)
	if (!session.owns(value.artifact, 'schema')) {
		throw new TypeError(`${path}.artifact must belong to this compilation`)
	}
	assertNonEmptyString(value.className, `${path}.className`)
	assertSchemaCompilationProvenance(
		value.provenance,
		`${path}.provenance`,
		allowedOwners,
	)

	for (const [index, name] of readList(
		value,
		'developerFieldNames',
		path,
	).entries()) {
		assertNonEmptyString(name, `${path}.developerFieldNames[${String(index)}]`)
	}
	const fieldNames = new Set<string>()
	for (const [index, field] of readList(value, 'fields', path).entries()) {
		assertFieldNode(
			field,
			session,
			`${path}.fields[${String(index)}]`,
			allowedOwners,
		)
		if (isPlainRecord(field) && typeof field.name === 'string') {
			if (fieldNames.has(field.name)) {
				throw new TypeError(`${path} contains duplicate field: ${field.name}`)
			}
			fieldNames.add(field.name)
		}
	}
	for (const [index, option] of readList(value, 'options', path).entries()) {
		assertOptionNode(
			option,
			session,
			`${path}.options[${String(index)}]`,
			allowedOwners,
		)
	}
	for (const key of ['constraints', 'indexes'] as const) {
		for (const [index, node] of readList(value, key, path).entries()) {
			if (!isPlainRecord(node)) {
				throw new TypeError(`${path}.${key}[${String(index)}] must be a node`)
			}
			assertSchemaContributionProvenance(
				node.provenance,
				`${path}.${key}[${String(index)}].provenance`,
				allowedOwners,
			)
			if (key === 'constraints' && !session.owns(node.artifact, 'constraint')) {
				throw new TypeError(
					`${path}.constraints[${String(index)}] has an invalid artifact`,
				)
			}
		}
	}
	for (const [index, extension] of readList(
		value,
		'extensions',
		path,
	).entries()) {
		assertSchemaCompilerExtensionNode(
			extension,
			session,
			`${path}.extensions[${String(index)}]`,
			allowedOwners,
		)
	}
}
