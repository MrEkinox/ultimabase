import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type { GenericField } from '../../schema/fields/base/contract.js'
import { assertOutputDescriptor } from '../../schema/output/descriptor.js'
import {
	assertFieldDefinition,
	replaceDeclaredFieldOptions,
} from '../../schema/fields/base/definition.js'
import type { SchemaConstraintDefinition } from '../../schema/schema/constraints.js'
import { isSchemaConstraintDefinition } from '../../schema/schema/constraints.js'
import {
	areSchemaDeclarationValuesCompatible,
	Schema,
	type PreparedSchemaCompilation,
	type SchemaDefinition,
	type SchemaMetadata,
} from '../../schema/schema/definition.js'
import {
	assertVirtualFieldDefinition,
	type GenericVirtualField,
} from '../../schema/schema/virtual-field.js'
import type { SchemaCompilerArtifactSession } from './artifacts.js'
import type {
	SchemaCompilerFieldNode,
	SchemaCompilerOptionValue,
	SchemaCompilerOutputNode,
	SchemaCompilerOutput,
	SchemaCompilerVirtualFieldNode,
} from './contracts.js'
import { isSchemaCompilerArtifactReference } from './artifacts.js'

const decodeOptionValue = (
	value: SchemaCompilerOptionValue,
	session: SchemaCompilerArtifactSession,
): unknown =>
	isSchemaCompilerArtifactReference(value)
		? session.resolve(value, 'option-value')
		: value

const decodeField = (
	node: SchemaCompilerFieldNode,
	session: SchemaCompilerArtifactSession,
	path: string,
): GenericField => {
	const artifact = session.resolve(node.artifact, 'field')
	assertFieldDefinition(artifact, path)
	if (artifact.kind !== node.kind) {
		throw new TypeError(`Schema compiler changed field kind: ${path}`)
	}

	const options: Record<string, unknown> = Object.fromEntries(
		node.options.map(({ name, value }) => [
			name,
			decodeOptionValue(value, session),
		]),
	)
	if (node.kind === 'object') {
		options.fields = immutableRecord(
			Object.fromEntries(
				node.fields.map((field) => [
					field.name,
					decodeField(field, session, `${path}.fields.${field.name}`),
				]),
			),
		)
	} else if (node.fields.length > 0) {
		throw new TypeError(`Only object fields may contain nested fields: ${path}`)
	}

	const decodedOptions = immutableRecord(options)
	return areSchemaDeclarationValuesCompatible(artifact.options, decodedOptions)
		? artifact
		: replaceDeclaredFieldOptions(artifact, decodedOptions)
}

const assertOutputNodeMatchesArtifact = (
	node: SchemaCompilerOutputNode,
	session: SchemaCompilerArtifactSession,
	path: string,
): void => {
	const descriptor = session.resolve(node.artifact, 'output')
	assertOutputDescriptor(descriptor, path)
	const options = immutableRecord(
		Object.fromEntries(
			node.options.map(({ name, value }) => [
				name,
				decodeOptionValue(value, session),
			]),
		),
	)
	const nestedFields: Readonly<Record<string, unknown>> | undefined =
		descriptor.kind === 'object' &&
		'fields' in descriptor.options &&
		isPlainRecord(descriptor.options.fields)
			? descriptor.options.fields
			: undefined

	if (
		descriptor.kind !== node.kind ||
		!areSchemaDeclarationValuesCompatible(
			Object.fromEntries(
				Object.entries(descriptor.options).filter(
					([name]) => name !== 'fields',
				),
			),
			options,
		) ||
		Object.keys(nestedFields ?? {}).length !== node.fields.length
	) {
		throw new TypeError(`Schema compiler changed virtual output: ${path}`)
	}
	for (const child of node.fields) {
		if (
			nestedFields?.[child.name] === undefined ||
			session.resolve(child.output.artifact, 'output') !==
				nestedFields[child.name]
		) {
			throw new TypeError(`Schema compiler changed virtual output: ${path}`)
		}
		assertOutputNodeMatchesArtifact(
			child.output,
			session,
			`${path}.${child.name}`,
		)
	}
}

const decodeVirtualField = (
	node: SchemaCompilerVirtualFieldNode,
	session: SchemaCompilerArtifactSession,
	path: string,
): GenericVirtualField => {
	const field = session.resolve(node.artifact, 'virtual-field')
	assertVirtualFieldDefinition(field, path)
	assertOutputNodeMatchesArtifact(node.output, session, `${path}.output`)
	const options = immutableRecord(
		Object.fromEntries(
			node.options.map(({ name, value }) => [
				name,
				decodeOptionValue(value, session),
			]),
		),
	)
	if (
		session.resolve(node.output.artifact, 'output') !== field.output ||
		!areSchemaDeclarationValuesCompatible(node.select, field.select) ||
		!areSchemaDeclarationValuesCompatible(options, field.options)
	) {
		throw new TypeError(`Schema compiler changed virtual field: ${path}`)
	}
	return field
}

const resolveSchema = (
	session: SchemaCompilerArtifactSession,
	artifact: Parameters<SchemaCompilerArtifactSession['resolve']>[0],
): SchemaDefinition => {
	const schema = session.resolve(artifact, 'schema')
	if (!Schema.is(schema)) {
		throw new TypeError('Schema compiler schema artifact is invalid')
	}
	return schema
}

const resolveConstraint = (
	session: SchemaCompilerArtifactSession,
	artifact: Parameters<SchemaCompilerArtifactSession['resolve']>[0],
): SchemaConstraintDefinition => {
	const constraint = session.resolve(artifact, 'constraint')
	if (
		typeof constraint !== 'object' ||
		constraint === null ||
		!isSchemaConstraintDefinition(constraint)
	) {
		throw new TypeError('Schema compiler constraint artifact is invalid')
	}
	return constraint
}

/** Decodes one revalidated compiler graph through its private artifact session. */
export const decodeSchemaCompilerOutput = (
	output: SchemaCompilerOutput,
	session: SchemaCompilerArtifactSession,
): readonly PreparedSchemaCompilation[] =>
	immutableArray(
		output.schemas.map((node) => {
			const schema = resolveSchema(session, node.artifact)
			const persistedFields = immutableRecord(
				Object.fromEntries(
					node.fields.map((field) => [
						field.name,
						decodeField(
							field,
							session,
							`${node.className}.fields.${field.name}`,
						),
					]),
				),
			) as SchemaMetadata['persistedFields']
			const virtualFields = immutableRecord(
				Object.fromEntries(
					node.virtualFields.map((field) => [
						field.name,
						decodeVirtualField(
							field,
							session,
							`${node.className}.fields.${field.name}`,
						),
					]),
				),
			)
			const fields = immutableRecord({ ...persistedFields, ...virtualFields })
			const developerFields = immutableRecord(
				Object.fromEntries(
					node.developerFieldNames.map((name) => {
						const field = fields[name]
						if (field === undefined) {
							throw new TypeError(
								`Missing developer field in compiler output: ${node.className}.${name}`,
							)
						}
						return [name, field]
					}),
				),
			)
			const schemaOptions = Object.fromEntries(
				node.options.map(({ name, value }) => [
					name,
					decodeOptionValue(value, session),
				]),
			)

			return immutableRecord({
				definition: immutableRecord({
					...schemaOptions,
					className: node.className,
					constraints: immutableArray(
						node.constraints.map(({ artifact }) =>
							resolveConstraint(session, artifact),
						),
					),
					fields,
					indexes: immutableArray(
						node.indexes.map(({ definition }) => definition),
					),
					persistedFields,
					provenance: node.provenance,
					virtualFields,
				}),
				developerFields,
				schema,
			})
		}),
	)
