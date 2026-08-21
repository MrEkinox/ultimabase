import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { GenericField } from '../../schema/fields/base/contract.js'
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
import type { SchemaCompilerArtifactSession } from './artifacts.js'
import type {
	SchemaCompilerFieldNode,
	SchemaCompilerOptionValue,
	SchemaCompilerOutput,
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
			const fields = immutableRecord(
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
			) as SchemaMetadata['fields']
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
					provenance: node.provenance,
				}),
				developerFields,
				schema,
			})
		}),
	)
