import {
	assertNonEmptyString,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { SchemaCompilerInput, SchemaCompilerOutput } from './contracts.js'
import { schemaCompilerProtocolVersion } from './contracts.js'
import type { SchemaCompilerArtifactSession } from './artifacts.js'
import { assertSchemaCompilerPatchOperation } from './operation-validation.js'
import { collectSchemaCompilerOwnerIdentities } from './provenance-validation.js'
import {
	assertUniqueSchemaIdentities,
	collectExpectedSchemas,
} from './graph-validation.js'
import { assertSchemaCompilerSchemaNode } from './node-validation.js'
import { assertExactKeys, readList } from './validation-helpers.js'
import {
	assertFrozenCallbackFreeValue,
	collectArtifactReferences,
} from './value-validation.js'

const inputKeys = new Set(['declarations', 'protocolVersion', 'schemas'])
const outputKeys = new Set(['protocolVersion', 'schemas'])
const declarationKeys = new Set([
	'additions',
	'optionDefinitions',
	'order',
	'owner',
	'patches',
])
const assertOwner = (value: unknown, path: string): void => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a plugin owner`)
	}
	assertExactKeys(
		value,
		new Set(['instanceId', 'kind', 'pluginId', 'version']),
		path,
	)
	if (value.kind !== 'plugin') {
		throw new TypeError(`${path}.kind must be plugin`)
	}
	assertNonEmptyString(value.pluginId, `${path}.pluginId`)
	assertNonEmptyString(value.version, `${path}.version`)
	if (value.instanceId !== undefined) {
		assertNonEmptyString(value.instanceId, `${path}.instanceId`)
	}
}

const assertOptionDefinition = (
	value: unknown,
	session: SchemaCompilerArtifactSession,
	path: string,
): void => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be an option definition node`)
	}
	assertExactKeys(
		value,
		new Set([
			'artifact',
			'contributionId',
			'name',
			'owner',
			'protocolVersion',
			'runtimeRequirement',
			'scope',
			'staticOptions',
			'typegen',
		]),
		path,
	)
	if (!session.owns(value.artifact, 'option-definition')) {
		throw new TypeError(
			`${path}.artifact must be an option-definition artifact`,
		)
	}
	assertNonEmptyString(value.contributionId, `${path}.contributionId`)
	assertNonEmptyString(value.name, `${path}.name`)
	assertOwner(value.owner, `${path}.owner`)
	if (
		!Number.isSafeInteger(value.protocolVersion) ||
		Number(value.protocolVersion) < 1
	) {
		throw new TypeError(
			`${path}.protocolVersion must be a positive safe integer`,
		)
	}
	if (value.scope !== 'field' && value.scope !== 'schema') {
		throw new TypeError(`${path}.scope must be field or schema`)
	}
	if (!isPlainRecord(value.staticOptions) || !isPlainRecord(value.typegen)) {
		throw new TypeError(`${path} must contain static options and typegen facts`)
	}
}

const assertPatch = (
	value: unknown,
	session: SchemaCompilerArtifactSession,
	path: string,
): void => {
	if (!isPlainRecord(value)) throw new TypeError(`${path} must be a patch node`)
	assertExactKeys(
		value,
		new Set([
			'operations',
			'owner',
			'selectionId',
			'selector',
			'staticOptions',
		]),
		path,
	)
	assertOwner(value.owner, `${path}.owner`)
	assertNonEmptyString(value.selectionId, `${path}.selectionId`)
	if (!isPlainRecord(value.selector) || !isPlainRecord(value.staticOptions)) {
		throw new TypeError(`${path} must contain selector and static option facts`)
	}
	for (const [index, operation] of readList(
		value,
		'operations',
		path,
	).entries()) {
		assertSchemaCompilerPatchOperation(
			operation,
			session,
			`${path}.operations[${String(index)}]`,
		)
	}
}

const assertDeclaration = (
	value: unknown,
	session: SchemaCompilerArtifactSession,
	path: string,
): void => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a plugin declaration node`)
	}
	assertExactKeys(value, declarationKeys, path)
	assertOwner(value.owner, `${path}.owner`)
	if (!Number.isSafeInteger(value.order) || Number(value.order) < 0) {
		throw new TypeError(`${path}.order must be a non-negative safe integer`)
	}
	for (const [index, addition] of readList(
		value,
		'additions',
		path,
	).entries()) {
		if (!isPlainRecord(addition)) {
			throw new TypeError(
				`${path}.additions[${String(index)}] must be an addition`,
			)
		}
		assertExactKeys(
			addition,
			new Set(['contributionId', 'schema', 'staticOptions']),
			`${path}.additions[${String(index)}]`,
		)
		assertNonEmptyString(
			addition.contributionId,
			`${path}.additions[${String(index)}].contributionId`,
		)
		if (!isPlainRecord(addition.staticOptions)) {
			throw new TypeError(
				`${path}.additions[${String(index)}].staticOptions must be portable facts`,
			)
		}
		assertSchemaCompilerSchemaNode(
			addition.schema,
			session,
			`${path}.additions[${String(index)}].schema`,
		)
	}
	for (const [index, definition] of readList(
		value,
		'optionDefinitions',
		path,
	).entries()) {
		assertOptionDefinition(
			definition,
			session,
			`${path}.optionDefinitions[${String(index)}]`,
		)
	}
	for (const [index, patch] of readList(value, 'patches', path).entries()) {
		assertPatch(patch, session, `${path}.patches[${String(index)}]`)
	}
}

/** Protects compiler execution from mutable, executable, or foreign input data. */
export function assertSchemaCompilerInput(
	input: unknown,
	session: SchemaCompilerArtifactSession,
): asserts input is SchemaCompilerInput {
	assertFrozenCallbackFreeValue(
		input,
		session,
		'schema compiler input',
		new WeakSet(),
	)
	if (!isPlainRecord(input)) {
		throw new TypeError('schema compiler input must be a plain object')
	}
	assertExactKeys(input, inputKeys, 'schema compiler input')
	if (input.protocolVersion !== schemaCompilerProtocolVersion) {
		throw new TypeError('Unsupported schema compiler input protocol version')
	}
	if (!isUnknownArray(input.schemas) || !isUnknownArray(input.declarations)) {
		throw new TypeError(
			'schema compiler input must contain schema and declaration lists',
		)
	}

	for (const [index, schema] of input.schemas.entries()) {
		assertSchemaCompilerSchemaNode(
			schema,
			session,
			`schema compiler input.schemas[${String(index)}]`,
		)
	}
	for (const [index, declaration] of input.declarations.entries()) {
		assertDeclaration(
			declaration,
			session,
			`schema compiler input.declarations[${String(index)}]`,
		)
	}
	const expectedSchemas: unknown[] = [...input.schemas]
	for (const declaration of input.declarations) {
		if (isPlainRecord(declaration) && isUnknownArray(declaration.additions)) {
			for (const addition of declaration.additions) {
				if (isPlainRecord(addition)) expectedSchemas.push(addition.schema)
			}
		}
	}
	assertUniqueSchemaIdentities(
		expectedSchemas,
		session,
		'schema compiler input',
	)
}

/** Revalidates completeness and application ownership before Core decodes output. */
export function assertSchemaCompilerOutput(
	input: SchemaCompilerInput,
	output: unknown,
	session: SchemaCompilerArtifactSession,
): asserts output is SchemaCompilerOutput {
	const inputReferences = new Set<object>()
	collectArtifactReferences(input, inputReferences, new WeakSet())
	const allowedOwners = collectSchemaCompilerOwnerIdentities(input)
	assertFrozenCallbackFreeValue(
		output,
		session,
		'schema compiler output',
		new WeakSet(),
		inputReferences,
	)
	if (!isPlainRecord(output)) {
		throw new TypeError('schema compiler output must be a plain object')
	}
	assertExactKeys(output, outputKeys, 'schema compiler output')
	if (output.protocolVersion !== input.protocolVersion) {
		throw new TypeError('Schema compiler output protocol version mismatch')
	}
	if (!isUnknownArray(output.schemas)) {
		throw new TypeError('schema compiler output.schemas must be a list')
	}

	for (const [index, schema] of output.schemas.entries()) {
		assertSchemaCompilerSchemaNode(
			schema,
			session,
			`schema compiler output.schemas[${String(index)}]`,
			allowedOwners,
		)
	}
	assertUniqueSchemaIdentities(
		output.schemas,
		session,
		'schema compiler output',
	)
	const expected = collectExpectedSchemas(input)
	if (output.schemas.length !== expected.length) {
		throw new TypeError(
			'Schema compiler output must contain the complete schema graph',
		)
	}
	const expectedByReference = new Map(
		expected.map((schema) => [schema.artifact, schema.className]),
	)
	for (const candidate of output.schemas) {
		if (
			!isPlainRecord(candidate) ||
			!session.owns(candidate.artifact, 'schema')
		) {
			continue
		}
		const expectedClassName = expectedByReference.get(candidate.artifact)
		if (expectedClassName !== candidate.className) {
			throw new TypeError(
				'Schema compiler output changed stable schema identity',
			)
		}
	}
}
