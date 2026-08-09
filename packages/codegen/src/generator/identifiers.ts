import { immutableRecord } from '@ultimabase/shared'

import { SchemaTypegenError } from '../errors.js'
import type {
	TypegenApplicationSnapshot,
	TypegenFieldSnapshot,
	TypegenSchemaSnapshot,
} from '../snapshot.js'
import { fieldIdentifier, typeIdentifier } from './syntax.js'
import type {
	EnumDescriptor,
	ObjectDescriptor,
	ObjectOccurrence,
} from './types.js'

/** Assigns and validates every generated schema, enum, and object identity. */
export class GeneratedIdentifiers {
	readonly #owners = new Map<string, string>()
	readonly #objectsByField = new Map<TypegenFieldSnapshot, ObjectDescriptor>()
	readonly #objects: ObjectDescriptor[] = []
	readonly #objectOccurrences: ObjectOccurrence[] = []
	readonly #enumsByField = new Map<TypegenFieldSnapshot, EnumDescriptor>()
	readonly #enums: EnumDescriptor[] = []
	readonly #namedIdentities = new Map<
		string,
		Readonly<{
			descriptor: EnumDescriptor | ObjectDescriptor
			signature: string
		}>
	>()
	readonly #schemas = new Map<TypegenSchemaSnapshot, string>()

	constructor(snapshot: TypegenApplicationSnapshot) {
		for (const schema of snapshot.schemas) {
			const alias = typeIdentifier(schema.className)

			for (const suffix of [
				'Access',
				'CreateInput',
				'Hooks',
				'Include',
				'Item',
				'OrderByInput',
				'Select',
				'TypeInfo',
				'UpdateInput',
				'WhereInput',
			]) {
				this.#claim(`${alias}${suffix}`, `schema ${schema.className}`)
			}

			for (const suffix of [
				'Contract',
				'Fields',
				'Objects',
				'Pointers',
				'Relations',
			]) {
				this.#claim(`__${alias}${suffix}`, `schema ${schema.className}`)
			}

			this.#schemas.set(schema, alias)
			this.#collectNamedFields(schema, schema.fields, alias)
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

	#fieldSignature(field: TypegenFieldSnapshot): string {
		const value =
			field.value.kind === 'object'
				? {
						fields: field.value.fields.map((child) =>
							this.#fieldSignature(child),
						),
						kind: field.value.kind,
					}
				: field.value.kind === 'enum'
					? { kind: field.value.kind, values: field.value.values }
					: field.value

		return JSON.stringify({
			inference: field.inference,
			kind: field.kind,
			name: field.name,
			value,
		})
	}

	#namedSignature(field: TypegenFieldSnapshot): string {
		if (field.value.kind === 'enum') {
			return JSON.stringify({ kind: 'enum', values: field.value.values })
		}

		if (field.value.kind === 'object') {
			return JSON.stringify({
				fields: field.value.fields.map((child) => this.#fieldSignature(child)),
				kind: 'object',
			})
		}

		throw new TypeError(
			`Field ${field.path.join('.')} has no generated named identity`,
		)
	}

	#reuseNamedDescriptor(
		base: string,
		field: TypegenFieldSnapshot,
		ownerPath: string,
	): EnumDescriptor | ObjectDescriptor | undefined {
		const existing = this.#namedIdentities.get(base)

		if (existing === undefined) {
			return undefined
		}

		if (existing.signature !== this.#namedSignature(field)) {
			throw new SchemaTypegenError(
				'generated-identity-conflict',
				`Generated identity "${base}" from ${ownerPath} conflicts with ${existing.descriptor.ownerPath}`,
				{ owner: ownerPath, path: base },
			)
		}

		return existing.descriptor
	}

	#rememberNamedDescriptor(
		base: string,
		field: TypegenFieldSnapshot,
		descriptor: EnumDescriptor | ObjectDescriptor,
	): void {
		this.#namedIdentities.set(
			base,
			immutableRecord({
				descriptor,
				signature: this.#namedSignature(field),
			}),
		)
	}

	#collectNamedFields(
		schema: TypegenSchemaSnapshot,
		fields: readonly TypegenFieldSnapshot[],
		schemaAlias: string,
	): void {
		for (const field of fields) {
			if (field.value.kind !== 'enum' && field.value.kind !== 'object') {
				continue
			}

			const ownerPath = `${schema.className}.${field.path.join('.')}`
			const explicitTypeName = field.value.typeName
			const base =
				explicitTypeName === undefined
					? `${schemaAlias}${field.path.map(fieldIdentifier).join('')}`
					: typeIdentifier(explicitTypeName)
			const reused =
				explicitTypeName === undefined
					? undefined
					: this.#reuseNamedDescriptor(base, field, ownerPath)

			if (field.value.kind === 'enum') {
				if (reused !== undefined) {
					const descriptor = reused

					this.#enumsByField.set(field, descriptor)
					continue
				}

				const alias = base

				this.#claim(alias, ownerPath)
				this.#claim(`${alias}Filter`, ownerPath)

				const descriptor = immutableRecord({ alias, field, ownerPath, schema })

				this.#enumsByField.set(field, descriptor)
				this.#enums.push(descriptor)

				if (explicitTypeName !== undefined) {
					this.#rememberNamedDescriptor(base, field, descriptor)
				}

				continue
			}

			if (reused !== undefined) {
				const descriptor = reused

				this.#objectsByField.set(field, descriptor)
				this.#objectOccurrences.push(
					immutableRecord({ descriptor, field, schema }),
				)
				this.#collectNamedFields(schema, field.value.fields, schemaAlias)
				continue
			}

			const alias = base

			this.#claim(alias, ownerPath)

			for (const suffix of [
				'CreateInput',
				'Filter',
				'PathFilter',
				'PathValueFilter',
				'UpdateInput',
			]) {
				this.#claim(`${alias}${suffix}`, ownerPath)
			}

			const descriptor = immutableRecord({ alias, field, ownerPath, schema })

			this.#objectsByField.set(field, descriptor)
			this.#objects.push(descriptor)
			this.#objectOccurrences.push(
				immutableRecord({ descriptor, field, schema }),
			)

			if (explicitTypeName !== undefined) {
				this.#rememberNamedDescriptor(base, field, descriptor)
			}

			this.#collectNamedFields(schema, field.value.fields, schemaAlias)
		}
	}

	enum(field: TypegenFieldSnapshot): EnumDescriptor {
		const descriptor = this.#enumsByField.get(field)

		if (descriptor === undefined) {
			throw new TypeError(`Missing enum identity for ${field.path.join('.')}`)
		}

		return descriptor
	}

	enumDefinitionsFor(schema: TypegenSchemaSnapshot): readonly EnumDescriptor[] {
		return this.#enums.filter((descriptor) => descriptor.schema === schema)
	}

	object(field: TypegenFieldSnapshot): ObjectDescriptor {
		const descriptor = this.#objectsByField.get(field)

		if (descriptor === undefined) {
			throw new TypeError(`Missing object identity for ${field.path.join('.')}`)
		}

		return descriptor
	}

	objectDefinitionsFor(
		schema: TypegenSchemaSnapshot,
	): readonly ObjectDescriptor[] {
		return this.#objects.filter((descriptor) => descriptor.schema === schema)
	}

	objectFieldsFor(schema: TypegenSchemaSnapshot): readonly ObjectOccurrence[] {
		return this.#objectOccurrences.filter(
			(occurrence) => occurrence.schema === schema,
		)
	}

	schema(schema: TypegenSchemaSnapshot): string {
		const alias = this.#schemas.get(schema)

		if (alias === undefined) {
			throw new TypeError(`Missing schema identity for ${schema.className}`)
		}

		return alias
	}
}
