import {
	getFieldListDepth,
	getFieldSchemaTarget,
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
	mode: 'input' | 'output',
): JsonSchema => {
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
					children.map(([name, child]) => [name, describeValue(child, mode)]),
				),
				additionalProperties: false,
			}
			break
		}
		case 'pointer':
			scalar =
				mode === 'input'
					? {
							type: 'object',
							description:
								'`{ "connect": id }` or `{ "create": data }`, and `{ "update": data }` in an update.',
						}
					: {
							oneOf: [
								schemaRef('Pointer'),
								...(target === undefined ? [] : [schemaRef(target.className)]),
							],
						}
			break
		case 'relation':
			return mode === 'input'
				? {
						type: 'object',
						description:
							'Link commands: `create`, `connect`, and in an update `update`, `disconnect`, `set`.',
					}
				: {
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

const isNullable = (field: GenericField): boolean =>
	readOption(field, 'required') !== true &&
	readOption(field, 'autoNow') !== true &&
	readOption(field, 'autoIncrement') !== true &&
	!Object.hasOwn(field.options, 'generatedOn')

/** Describes one field value as its wire JSON Schema, constraints included. */
const describeValue = (
	field: GenericField,
	mode: 'input' | 'output',
): JsonSchema => {
	const base = describeField(field, mode)
	const constraints = mode === 'input' ? readConstraints(field) : []
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

/** Describes the result model, create input and update input of one schema. */
export const describeSchemaComponents = (
	schema: SchemaDefinition,
): Readonly<Record<string, JsonSchema>> => {
	const persisted = Object.entries(schema.persistedFields)
	const writable = persisted.filter(
		([name, field]) => !systemFields.has(name) && !isGenerated(field),
	)
	const createRequired = writable
		.filter(
			([, field]) =>
				readOption(field, 'required') === true &&
				!Object.hasOwn(field.options, 'default'),
		)
		.map(([name]) => name)
	const updatable = writable.filter(
		([, field]) => readOption(field, 'immutable') !== true,
	)
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
				writable.map(([name, field]) => [name, describeValue(field, 'input')]),
			),
			...(createRequired.length === 0 ? {} : { required: createRequired }),
			additionalProperties: false,
		},
		[`${schema.className}UpdateInput`]: {
			type: 'object',
			properties: Object.fromEntries(
				updatable.map(([name, field]) => {
					const value = describeValue(field, 'input')
					return [
						name,
						numericKinds.has(field.kind) &&
						getFieldListDepth(field.options) === 0
							? {
									anyOf: [
										value,
										{
											type: 'object',
											description:
												'`{ "increment": n }` or `{ "decrement": n }`.',
											minProperties: 1,
											maxProperties: 1,
										},
									],
								}
							: value,
					]
				}),
			),
			additionalProperties: false,
		},
	}
}
