import {
	getFieldListDepth,
	getFieldSchemaTarget,
	readFieldTypeState,
	type GenericField,
	type GenericOutputDescriptor,
	type SchemaDefinition,
} from '@ultimabase/core'
import { readStandardJsonSchema } from '@ultimabase/plugin-kit'
import { isPlainRecord } from '@ultimabase/shared'

/** One JSON Schema (draft 2020-12, the OpenAPI 3.1 dialect). */
export type JsonSchema = Readonly<Record<string, unknown>>

const systemFields: ReadonlySet<string> = new Set([
	'createdAt',
	'id',
	'updatedAt',
])
const numericKinds: ReadonlySet<string> = new Set([
	'bigint',
	'decimal',
	'float',
	'int',
])

/** A component reference: `#/components/schemas/<name>`. */
export const schemaRef = (name: string): JsonSchema => ({
	$ref: `#/components/schemas/${name}`,
})

/** Where a field value is described: a result, or a create or update input. */
type DescriptionMode = 'create' | 'output' | 'update'

const identity: JsonSchema = { type: 'string', format: 'uuid' }
const identities: JsonSchema = { type: 'array', items: identity }

/** An object with exactly the one command `name`. */
const linkCommand = (name: string, schema: JsonSchema): JsonSchema => ({
	type: 'object',
	properties: { [name]: schema },
	required: [name],
	additionalProperties: false,
})

// The link commands of the REST decoder (ADR-0308): one pointer command, or
// relation commands whose payload Core validates against the target.
const describeLinks = (
	field: GenericField,
	mode: 'create' | 'update',
): JsonSchema => {
	const target = getFieldSchemaTarget(field)?.()
	const data = (input: 'CreateInput' | 'UpdateInput'): JsonSchema =>
		target === undefined ? {} : schemaRef(`${target.className}${input}`)
	if (field.kind === 'pointer') {
		return {
			oneOf: [
				linkCommand('connect', identity),
				linkCommand('create', data('CreateInput')),
				...(mode === 'update'
					? [linkCommand('update', data('UpdateInput'))]
					: []),
			],
		}
	}
	return {
		type: 'object',
		properties: {
			create: { type: 'array', items: data('CreateInput') },
			connect: identities,
			...(mode === 'update'
				? {
						update: {
							type: 'array',
							items: {
								type: 'object',
								properties: { id: identity, data: data('UpdateInput') },
								required: ['id', 'data'],
								additionalProperties: false,
							},
						},
						disconnect: identities,
						set: identities,
					}
				: {}),
		},
		minProperties: 1,
		additionalProperties: false,
		...(mode === 'update'
			? { description: '`set` replaces every link and stands alone.' }
			: {}),
	}
}

const isLink = (field: GenericField): boolean =>
	field.kind === 'pointer' || field.kind === 'relation'

const readOption = (
	field: { readonly options: object },
	key: string,
): unknown => Reflect.get(field.options, key)

// Wire representations of the built-in scalars (README, "HTTP responses").
const scalarSchemas: Readonly<Record<string, JsonSchema>> = {
	bigint: { type: 'string', pattern: '^(0|-?[1-9][0-9]*)$' },
	binary: {
		type: 'object',
		properties: {
			type: { const: 'binary' },
			encoding: { const: 'base64' },
			data: { type: 'string', contentEncoding: 'base64' },
		},
		required: ['type', 'encoding', 'data'],
		additionalProperties: false,
	},
	boolean: { type: 'boolean' },
	date: { type: 'string', format: 'date' },
	dateTime: { type: 'string', format: 'date-time' },
	decimal: { type: 'string', pattern: '^-?[0-9]+(\\.[0-9]+)?$' },
	float: { type: 'number' },
	int: { type: 'integer' },
	json: {},
	string: { type: 'string' },
	time: { type: 'string', format: 'time' },
	uuid: { type: 'string', format: 'uuid' },
}

const nestedFields = (options: object): Readonly<Record<string, unknown>> => {
	const fields: unknown = Reflect.get(options, 'fields')
	return isPlainRecord(fields) ? fields : {}
}

const isField = (value: unknown): value is GenericField =>
	isPlainRecord(value) &&
	typeof value.kind === 'string' &&
	typeof value.options === 'object' &&
	value.options !== null

/** Reads the constraints a field's Standard JSON Schema validators describe. */
const readConstraints = (field: GenericField): readonly JsonSchema[] =>
	Object.values(field.options).flatMap((option): JsonSchema[] => {
		const schema = readStandardJsonSchema(option, 'input')
		return schema === undefined ? [] : [schema]
	})

/** Wraps one scalar schema in the field's declared list levels. */
const wrapList = (schema: JsonSchema, depth: number): JsonSchema =>
	depth <= 0 ? schema : { type: 'array', items: wrapList(schema, depth - 1) }

const describeField = (
	field: GenericField,
	mode: DescriptionMode,
): JsonSchema => {
	if (mode !== 'output' && isLink(field)) return describeLinks(field, mode)
	const target = getFieldSchemaTarget(field)?.()
	let scalar: JsonSchema
	switch (field.kind) {
		case 'enum': {
			const values: unknown = readOption(field, 'values')
			scalar = {
				type: 'string',
				...(Array.isArray(values) ? { enum: values } : {}),
			}
			break
		}
		case 'object': {
			const children = Object.entries(nestedFields(field.options)).filter(
				(entry): entry is [string, GenericField] => isField(entry[1]),
			)
			scalar = {
				type: 'object',
				properties: Object.fromEntries(
					children.map(([name, child]) => [
						name,
						// Embedded values have no update operators.
						describeValue(child, mode === 'output' ? 'output' : 'create'),
					]),
				),
				additionalProperties: false,
			}
			break
		}
		case 'pointer':
			scalar = {
				oneOf: [
					schemaRef('Pointer'),
					...(target === undefined ? [] : [schemaRef(target.className)]),
				],
			}
			break
		case 'relation':
			return {
				type: 'array',
				description: 'Present when included.',
				items: target === undefined ? {} : schemaRef(target.className),
			}
		default:
			scalar = scalarSchemas[field.kind] ?? {
				description: `Plugin value of kind ${field.kind}.`,
			}
	}
	return wrapList(scalar, getFieldListDepth(field.options))
}

// Core derives nullability: a default makes a field required (ADR-0340).
const isNullable = (field: GenericField): boolean =>
	readFieldTypeState(field).nullable

/** Describes one field value as its wire JSON Schema, constraints included. */
const describeValue = (
	field: GenericField,
	mode: DescriptionMode,
): JsonSchema => {
	const base = describeField(field, mode)
	const constraints = mode === 'output' ? [] : readConstraints(field)
	const constrained =
		constraints.length === 0 ? base : { allOf: [base, ...constraints] }
	const described: unknown = readOption(field, 'description')
	const value =
		isNullable(field) && field.kind !== 'relation'
			? { anyOf: [constrained, { type: 'null' }] }
			: constrained
	return typeof described === 'string'
		? { ...value, description: described }
		: value
}

const isOutputDescriptor = (value: unknown): value is GenericOutputDescriptor =>
	isPlainRecord(value) &&
	typeof value.kind === 'string' &&
	typeof value.options === 'object' &&
	value.options !== null

const describeOutput = (output: GenericOutputDescriptor): JsonSchema => {
	const scalar =
		output.kind === 'object'
			? {
					type: 'object',
					properties: Object.fromEntries(
						Object.entries(nestedFields(output.options)).flatMap(
							([name, child]) =>
								isOutputDescriptor(child)
									? [[name, describeOutput(child)]]
									: [],
						),
					),
				}
			: output.kind === 'enum'
				? { type: 'string' }
				: (scalarSchemas[output.kind] ?? {})
	return {
		...wrapList(scalar, getFieldListDepth(output.options)),
		readOnly: true,
	}
}

const isGenerated = (field: GenericField): boolean =>
	readOption(field, 'autoNow') === true ||
	readOption(field, 'autoIncrement') === true ||
	Object.hasOwn(field.options, 'generatedOn')

// Relations accept link commands although no scalar value is writable.
const acceptsInput = (
	field: GenericField,
	mode: 'create' | 'update',
): boolean =>
	field.kind === 'relation' || readFieldTypeState(field)[mode] !== 'forbidden'

/** The fields a create and an update input accept. */
const readInputFields = (schema: SchemaDefinition) => {
	// Plugin-written fields (forbidden mutation input) accept no client input.
	const create = Object.entries(schema.persistedFields).filter(
		([name, field]) =>
			!systemFields.has(name) &&
			!isGenerated(field) &&
			acceptsInput(field, 'create'),
	)
	const update = create.filter(
		([, field]) =>
			readOption(field, 'immutable') !== true && acceptsInput(field, 'update'),
	)
	return { create, update }
}

/** An atomic numeric update names exactly one operator (ADR-0307). */
const describeNumericOperation = (field: GenericField): JsonSchema => {
	const operand = describeField(field, 'update')
	return {
		type: 'object',
		properties: { increment: operand, decrement: operand },
		minProperties: 1,
		maxProperties: 1,
		additionalProperties: false,
	}
}

/**
 * References a create or update input in a body that cannot link
 * relationships (upsert and bulk, ADR-0243): its link fields are refused.
 */
export const describeUnlinkedInput = (
	schema: SchemaDefinition,
	input: 'CreateInput' | 'UpdateInput',
): JsonSchema => {
	const fields =
		readInputFields(schema)[input === 'CreateInput' ? 'create' : 'update']
	const links = fields.filter(([, field]) => isLink(field))
	const reference = schemaRef(`${schema.className}${input}`)
	return links.length === 0
		? reference
		: {
				allOf: [
					reference,
					{
						properties: Object.fromEntries(
							links.map(([name]) => [name, false]),
						),
					},
				],
			}
}

/** Describes the result model, create input and update input of one schema. */
export const describeSchemaComponents = (
	schema: SchemaDefinition,
): Readonly<Record<string, JsonSchema>> => {
	const persisted = Object.entries(schema.persistedFields)
	const { create, update } = readInputFields(schema)
	const createRequired = create
		.filter(
			([, field]) =>
				readOption(field, 'required') === true &&
				!Object.hasOwn(field.options, 'default'),
		)
		.map(([name]) => name)
	return {
		[schema.className]: {
			type: 'object',
			properties: Object.fromEntries([
				...persisted.map(([name, field]) => [
					name,
					describeValue(field, 'output'),
				]),
				...Object.entries(schema.virtualFields).map(([name, field]) => [
					name,
					describeOutput(field.output),
				]),
			]),
			required: ['id'],
		},
		[`${schema.className}CreateInput`]: {
			type: 'object',
			properties: Object.fromEntries(
				create.map(([name, field]) => [name, describeValue(field, 'create')]),
			),
			...(createRequired.length === 0 ? {} : { required: createRequired }),
			additionalProperties: false,
		},
		[`${schema.className}UpdateInput`]: {
			type: 'object',
			properties: Object.fromEntries(
				update.map(([name, field]) => {
					const value = describeValue(field, 'update')
					return [
						name,
						numericKinds.has(field.kind) &&
						getFieldListDepth(field.options) === 0
							? { anyOf: [value, describeNumericOperation(field)] }
							: value,
					]
				}),
			),
			additionalProperties: false,
		},
	}
}
