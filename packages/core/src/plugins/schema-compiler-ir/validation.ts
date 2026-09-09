import {
	assertNonEmptyString,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import type { SchemaCompilerInput, SchemaCompilerOutput } from './contracts.js'
import type { SchemaCompilerSchemaNode } from './contracts.js'
import { schemaCompilerProtocolVersion } from './contracts.js'
import { areSchemaDeclarationValuesCompatible } from '../../schema/schema/definition.js'
import type { SchemaCompilerArtifactSession } from './artifacts.js'
import { assertSchemaCompilerPatchOperation } from './operation-validation.js'
import { normalizeSelector } from '../schema-selectors.js'
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
import { normalizeFieldDeclarationContexts } from '../../schema/schema/field-contexts.js'

const inputKeys = new Set(['declarations', 'protocolVersion', 'schemas'])
const outputKeys = new Set(['protocolVersion', 'schemas', 'selections'])
const coreSystemFieldNames = new Set(['id', 'createdAt', 'updatedAt'])
const declarationKeys = new Set([
	'additions',
	'optionDefinitions',
	'order',
	'owner',
	'patches',
	'selections',
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
			'contexts',
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
	if (value.scope === 'field') {
		normalizeFieldDeclarationContexts(value.contexts, `${path}.contexts`)
	} else if (value.contexts !== undefined) {
		throw new TypeError(`${path}.contexts is valid only for field options`)
	}
	if (
		!isPlainRecord(value.staticOptions) ||
		(value.typegen !== false && !isPlainRecord(value.typegen))
	) {
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
	normalizeSelector(value.selector)
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

const assertSelection = (value: unknown, path: string): void => {
	if (!isPlainRecord(value)) {
		throw new TypeError(`${path} must be a selection node`)
	}
	assertExactKeys(value, new Set(['selectionId', 'selector']), path)
	assertNonEmptyString(value.selectionId, `${path}.selectionId`)
	if (!isPlainRecord(value.selector)) {
		throw new TypeError(`${path}.selector must be portable selector facts`)
	}
	normalizeSelector(value.selector)
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
	const selectionIds = new Set<string>()
	for (const [index, selection] of readList(
		value,
		'selections',
		path,
	).entries()) {
		assertSelection(selection, `${path}.selections[${String(index)}]`)
		if (isPlainRecord(selection) && typeof selection.selectionId === 'string') {
			if (selectionIds.has(selection.selectionId)) {
				throw new TypeError(
					`${path} contains duplicate selection: ${selection.selectionId}`,
				)
			}
			selectionIds.add(selection.selectionId)
		}
	}
	for (const patch of readList(value, 'patches', path)) {
		if (
			isPlainRecord(patch) &&
			typeof patch.selectionId === 'string' &&
			!selectionIds.has(patch.selectionId)
		) {
			throw new TypeError(
				`${path} patch references undeclared selection: ${patch.selectionId}`,
			)
		}
	}
}

const assertProtectedSchemaFacts = (
	expected: SchemaCompilerSchemaNode,
	candidate: SchemaCompilerSchemaNode,
): void => {
	if (
		!areSchemaDeclarationValuesCompatible(
			expected.provenance.schema,
			candidate.provenance.schema,
		)
	) {
		throw new TypeError(
			`Schema compiler output changed schema ownership: ${expected.className}`,
		)
	}

	for (const name of coreSystemFieldNames) {
		const expectedField = expected.fields.find((field) => field.name === name)
		const expectedProvenance = expected.provenance.fields[name]
		if (
			expectedField === undefined ||
			expectedProvenance?.owner.kind !== 'core'
		) {
			continue
		}
		const candidateField = candidate.fields.find((field) => field.name === name)
		if (
			candidateField?.artifact !== expectedField.artifact ||
			candidateField.kind !== expectedField.kind ||
			!areSchemaDeclarationValuesCompatible(
				candidateField.fields,
				expectedField.fields,
			) ||
			!areSchemaDeclarationValuesCompatible(
				candidateField.options,
				expectedField.options,
			) ||
			!areSchemaDeclarationValuesCompatible(
				candidateField.provenance,
				expectedField.provenance,
			)
		) {
			throw new TypeError(
				`Schema compiler output changed protected Core field: ${expected.className}.${name}`,
			)
		}
	}

	if (
		expected.virtualFields.length !== candidate.virtualFields.length ||
		expected.virtualFields.some((field, index) => {
			const replacement = candidate.virtualFields[index]
			return (
				replacement?.artifact !== field.artifact ||
				!areSchemaDeclarationValuesCompatible(replacement, field)
			)
		})
	) {
		throw new TypeError(
			`Schema compiler output changed a protected virtual field: ${expected.className}`,
		)
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
	const selectionIds = new Set<string>()
	for (const declaration of input.declarations) {
		if (!isPlainRecord(declaration)) continue
		for (const selection of readList(
			declaration,
			'selections',
			'schema compiler input declaration',
		)) {
			if (
				!isPlainRecord(selection) ||
				typeof selection.selectionId !== 'string'
			) {
				continue
			}
			if (selectionIds.has(selection.selectionId)) {
				throw new TypeError(
					`schema compiler input contains duplicate selection: ${selection.selectionId}`,
				)
			}
			selectionIds.add(selection.selectionId)
		}
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
	if (!isUnknownArray(output.schemas) || !isUnknownArray(output.selections)) {
		throw new TypeError(
			'schema compiler output must contain schema and selection lists',
		)
	}

	const candidateSchemas: SchemaCompilerSchemaNode[] = []
	for (const [index, schema] of output.schemas.entries()) {
		assertSchemaCompilerSchemaNode(
			schema,
			session,
			`schema compiler output.schemas[${String(index)}]`,
			allowedOwners,
		)
		candidateSchemas.push(schema)
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
	for (const candidate of candidateSchemas) {
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
		const expectedSchema = expected.find(
			(schema) => schema.artifact === candidate.artifact,
		)
		if (expectedSchema !== undefined) {
			assertProtectedSchemaFacts(expectedSchema, candidate)
		}
	}

	const expectedSelectionIds = input.declarations.flatMap((declaration) =>
		declaration.selections.map(({ selectionId }) => selectionId),
	)
	const finalClassNames = new Set(
		candidateSchemas.map(({ className }) => className),
	)
	const returnedSelectionIds = new Set<string>()
	for (const [index, selection] of output.selections.entries()) {
		const path = `schema compiler output.selections[${String(index)}]`
		if (!isPlainRecord(selection)) {
			throw new TypeError(`${path} must be a selection result`)
		}
		assertExactKeys(selection, new Set(['classNames', 'selectionId']), path)
		assertNonEmptyString(selection.selectionId, `${path}.selectionId`)
		if (
			!expectedSelectionIds.includes(selection.selectionId) ||
			returnedSelectionIds.has(selection.selectionId)
		) {
			throw new TypeError(`${path} must resolve one exact declared selection`)
		}
		returnedSelectionIds.add(selection.selectionId)
		const selectedClassNames = new Set<string>()
		for (const [classNameIndex, className] of readList(
			selection,
			'classNames',
			path,
		).entries()) {
			assertNonEmptyString(
				className,
				`${path}.classNames[${String(classNameIndex)}]`,
			)
			if (
				!finalClassNames.has(className) ||
				selectedClassNames.has(className)
			) {
				throw new TypeError(
					`${path} contains an invalid schema target: ${className}`,
				)
			}
			selectedClassNames.add(className)
		}
	}
	if (returnedSelectionIds.size !== expectedSelectionIds.length) {
		throw new TypeError(
			'Schema compiler output must resolve every declared selection',
		)
	}
}
