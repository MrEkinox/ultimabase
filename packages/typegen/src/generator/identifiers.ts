import { immutableRecord } from '@ultimabase/shared'

import { SchemaTypegenError } from '../errors.js'
import type {
	TypegenApplicationSnapshot,
	TypegenFieldSnapshot,
	TypegenSchemaSnapshot,
	TypegenValueNode,
} from '../snapshot.js'
import { fieldIdentifier, typeIdentifier } from './syntax.js'
import type { NamedDescriptor } from './types.js'

type NamedValue = Extract<
	TypegenValueNode,
	{ readonly kind: 'enum' | 'object' }
>

const schemaSuffixes = [
	'Access',
	'CreateInput',
	'DependencySelect',
	'Hooks',
	'Include',
	'Item',
	'OrderByInput',
	'Output',
	'Select',
	'UpdateInput',
	'WhereInput',
]
const privateSchemaSuffixes = [
	'Contract',
	'Fields',
	'Objects',
	'Pointers',
	'Relations',
]
const namedSuffixes = {
	enum: ['Filter'],
	object: [
		'CreateInput',
		'Filter',
		'PathFilter',
		'PathValueFilter',
		'UpdateInput',
	],
} as const

const isNamedValue = (value: TypegenValueNode): value is NamedValue =>
	value.kind === 'enum' || value.kind === 'object'

/** Describes a named value structurally, ignoring descriptions and type names. */
const namedShape = (value: NamedValue): object =>
	value.kind === 'enum'
		? { kind: value.kind, values: value.values }
		: { fields: value.fields.map(fieldSignature), kind: value.kind }

const fieldSignature = (field: TypegenFieldSnapshot): string =>
	JSON.stringify({
		typegen: field.typegen,
		kind: field.kind,
		name: field.name,
		value: isNamedValue(field.value) ? namedShape(field.value) : field.value,
	})

/** Assigns and validates every generated schema, enum, and object identity. */
export class GeneratedIdentifiers {
	readonly #owners = new Map<string, string>()
	readonly #descriptors = new Map<TypegenFieldSnapshot, NamedDescriptor>()
	readonly #definitions: NamedDescriptor[] = []
	/** Explicit type names shared by structurally identical declarations. */
	readonly #namedIdentities = new Map<
		string,
		Readonly<{ descriptor: NamedDescriptor; signature: string }>
	>()
	readonly #schemas = new Map<TypegenSchemaSnapshot, string>()

	constructor(snapshot: TypegenApplicationSnapshot) {
		for (const schema of snapshot.schemas) {
			const alias = typeIdentifier(schema.className)
			const owner = `schema ${schema.className}`

			for (const suffix of schemaSuffixes) {
				this.#claim(`${alias}${suffix}`, owner)
			}

			for (const suffix of privateSchemaSuffixes) {
				this.#claim(`__${alias}${suffix}`, owner)
			}

			this.#schemas.set(schema, alias)
			this.#collectNamedFields(schema, schema.fields, alias)
			this.#collectNamedFields(schema, schema.virtualFields, alias)
		}
	}

	#claim(identifier: string, owner: string): void {
		const existing = this.#owners.get(identifier)

		if (existing !== undefined && existing !== owner) {
			throw new SchemaTypegenError(
				'generated-identity-conflict',
				`Generated identifier "${identifier}" from ${owner} conflicts with ${existing}`,
				{ owner, path: identifier },
			)
		}

		this.#owners.set(identifier, owner)
	}

	/** Returns the descriptor already declared under one explicit type name. */
	#reuseNamedDescriptor(
		base: string,
		value: NamedValue,
		ownerPath: string,
	): NamedDescriptor | undefined {
		const existing = this.#namedIdentities.get(base)

		if (existing === undefined) {
			return undefined
		}

		if (existing.signature !== JSON.stringify(namedShape(value))) {
			throw new SchemaTypegenError(
				'generated-identity-conflict',
				`Generated identity "${base}" from ${ownerPath} conflicts with ${existing.descriptor.ownerPath}`,
				{ owner: ownerPath, path: base },
			)
		}

		return existing.descriptor
	}

	#collectNamedFields(
		schema: TypegenSchemaSnapshot,
		fields: readonly TypegenFieldSnapshot[],
		schemaAlias: string,
	): void {
		for (const field of fields) {
			const value = field.value

			if (!isNamedValue(value)) {
				continue
			}

			const ownerPath = `${schema.className}.${field.path.join('.')}`
			const explicitTypeName = value.typeName
			const base =
				explicitTypeName === undefined
					? `${schemaAlias}${field.path.map(fieldIdentifier).join('')}`
					: typeIdentifier(explicitTypeName)
			const reused =
				explicitTypeName === undefined
					? undefined
					: this.#reuseNamedDescriptor(base, value, ownerPath)

			if (reused === undefined) {
				this.#claim(base, ownerPath)

				for (const suffix of namedSuffixes[value.kind]) {
					this.#claim(`${base}${suffix}`, ownerPath)
				}

				const descriptor = immutableRecord({
					alias: base,
					field,
					ownerPath,
					schema,
				})

				this.#descriptors.set(field, descriptor)
				this.#definitions.push(descriptor)

				if (explicitTypeName !== undefined) {
					this.#namedIdentities.set(
						base,
						immutableRecord({
							descriptor,
							signature: JSON.stringify(namedShape(value)),
						}),
					)
				}
			} else {
				this.#descriptors.set(field, reused)
			}

			if (value.kind === 'object') {
				this.#collectNamedFields(schema, value.fields, schemaAlias)
			}
		}
	}

	#descriptor(field: TypegenFieldSnapshot, label: string): NamedDescriptor {
		const descriptor = this.#descriptors.get(field)

		if (descriptor === undefined) {
			throw new TypeError(
				`Missing ${label} identity for ${field.path.join('.')}`,
			)
		}

		return descriptor
	}

	#definitionsFor(
		schema: TypegenSchemaSnapshot,
		kind: NamedValue['kind'],
	): readonly NamedDescriptor[] {
		return this.#definitions.filter(
			(descriptor) =>
				descriptor.schema === schema && descriptor.field.value.kind === kind,
		)
	}

	enum(field: TypegenFieldSnapshot): NamedDescriptor {
		return this.#descriptor(field, 'enum')
	}

	enumDefinitionsFor(
		schema: TypegenSchemaSnapshot,
	): readonly NamedDescriptor[] {
		return this.#definitionsFor(schema, 'enum')
	}

	object(field: TypegenFieldSnapshot): NamedDescriptor {
		return this.#descriptor(field, 'object')
	}

	objectDefinitionsFor(
		schema: TypegenSchemaSnapshot,
	): readonly NamedDescriptor[] {
		return this.#definitionsFor(schema, 'object')
	}

	schema(schema: TypegenSchemaSnapshot): string {
		const alias = this.#schemas.get(schema)

		if (alias === undefined) {
			throw new TypeError(`Missing schema identity for ${schema.className}`)
		}

		return alias
	}
}
