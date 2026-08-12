import { assertNonEmptyString, isPlainRecord } from '@ultimabase/shared'

import { areSchemaDeclarationValuesCompatible } from '../../schema/schema/definition.js'
import type { SchemaCompilerArtifactSession } from './artifacts.js'
import { isSchemaCompilerArtifactReference } from './artifacts.js'
import type { SchemaCompilerSchemaNode } from './contracts.js'
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
export function assertSchemaCompilerSchemaNode(
	value: unknown,
	session: SchemaCompilerArtifactSession,
	path: string,
	allowedOwners?: ReadonlySet<string>,
): asserts value is SchemaCompilerSchemaNode {
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

	const developerFieldNames = readList(value, 'developerFieldNames', path)
	const developerFields = new Set<string>()
	for (const [index, name] of developerFieldNames.entries()) {
		assertNonEmptyString(name, `${path}.developerFieldNames[${String(index)}]`)
		if (developerFields.has(name)) {
			throw new TypeError(`${path} contains duplicate developer field: ${name}`)
		}
		developerFields.add(name)
	}
	const fieldNames = new Set<string>()
	const fields = readList(value, 'fields', path)
	for (const [index, field] of fields.entries()) {
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
	for (const name of developerFields) {
		if (!fieldNames.has(name)) {
			throw new TypeError(`${path} is missing developer field: ${name}`)
		}
	}
	const provenanceFieldNames = Object.keys(value.provenance.fields)
	if (
		provenanceFieldNames.length !== fieldNames.size ||
		provenanceFieldNames.some((name) => !fieldNames.has(name))
	) {
		throw new TypeError(`${path}.provenance.fields must match schema fields`)
	}
	for (const field of fields) {
		if (
			isPlainRecord(field) &&
			typeof field.name === 'string' &&
			!areSchemaDeclarationValuesCompatible(
				field.provenance,
				value.provenance.fields[field.name],
			)
		) {
			throw new TypeError(
				`${path}.fields.${field.name} has inconsistent provenance`,
			)
		}
		if (!isPlainRecord(field) || typeof field.name !== 'string') continue
		const fieldOptions = value.provenance.fieldOptions[field.name]
		if (!isPlainRecord(fieldOptions)) {
			throw new TypeError(
				`${path}.provenance.fieldOptions.${field.name} must be a map`,
			)
		}
		const optionNames = new Set<string>()
		for (const option of readList(
			field,
			'options',
			`${path}.fields.${field.name}`,
		)) {
			if (!isPlainRecord(option) || typeof option.name !== 'string') continue
			if (optionNames.has(option.name)) {
				throw new TypeError(
					`${path}.fields.${field.name} contains duplicate option: ${option.name}`,
				)
			}
			optionNames.add(option.name)
			if (
				!areSchemaDeclarationValuesCompatible(
					option.provenance,
					fieldOptions[option.name],
				)
			) {
				throw new TypeError(
					`${path}.fields.${field.name}.options.${option.name} has inconsistent provenance`,
				)
			}
		}
		if (
			Object.keys(fieldOptions).length !== optionNames.size ||
			Object.keys(fieldOptions).some((name) => !optionNames.has(name))
		) {
			throw new TypeError(
				`${path}.provenance.fieldOptions.${field.name} must match field options`,
			)
		}
	}
	const options = readList(value, 'options', path)
	const optionNames = new Set<string>()
	for (const [index, option] of options.entries()) {
		assertOptionNode(
			option,
			session,
			`${path}.options[${String(index)}]`,
			allowedOwners,
		)
		if (isPlainRecord(option) && typeof option.name === 'string') {
			if (optionNames.has(option.name)) {
				throw new TypeError(`${path} contains duplicate option: ${option.name}`)
			}
			optionNames.add(option.name)
			if (
				!areSchemaDeclarationValuesCompatible(
					option.provenance,
					value.provenance.options[option.name],
				)
			) {
				throw new TypeError(
					`${path}.options.${option.name} has inconsistent provenance`,
				)
			}
		}
	}
	if (
		Object.keys(value.provenance.options).length !== optionNames.size ||
		Object.keys(value.provenance.options).some((name) => !optionNames.has(name))
	) {
		throw new TypeError(`${path}.provenance.options must match schema options`)
	}
	for (const key of ['constraints', 'indexes'] as const) {
		const nodes = readList(value, key, path)
		const provenance = value.provenance[key]
		if (nodes.length !== provenance.length) {
			throw new TypeError(`${path}.provenance.${key} must match ${key}`)
		}
		for (const [index, node] of nodes.entries()) {
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
			if (
				!areSchemaDeclarationValuesCompatible(
					node.provenance,
					provenance[index]?.provenance,
				) ||
				!areSchemaDeclarationValuesCompatible(
					node.definition,
					provenance[index]?.definition,
				)
			) {
				throw new TypeError(
					`${path}.${key}[${String(index)}] has inconsistent provenance`,
				)
			}
		}
	}
	const extensions = readList(value, 'extensions', path)
	if (extensions.length !== value.provenance.extensions.length) {
		throw new TypeError(`${path}.provenance.extensions must match extensions`)
	}
	for (const [index, extension] of extensions.entries()) {
		assertSchemaCompilerExtensionNode(
			extension,
			session,
			`${path}.extensions[${String(index)}]`,
			allowedOwners,
		)
		if (!isPlainRecord(extension)) continue
		const extensionProvenance = value.provenance.extensions[index]
		if (
			extensionProvenance === undefined ||
			extension.name !== extensionProvenance.name ||
			!areSchemaDeclarationValuesCompatible(
				extension.provenance,
				extensionProvenance.provenance,
			)
		) {
			throw new TypeError(
				`${path}.extensions[${String(index)}] has inconsistent provenance`,
			)
		}
	}
}
