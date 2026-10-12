import {
	readFieldTypeState,
	type GenericField,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	GraphQLID,
	GraphQLInputObjectType,
	GraphQLNonNull,
	type GraphQLInputFieldConfigMap,
} from 'graphql'

import {
	assertSchemaFieldName,
	fieldPathKey,
	memoize,
	nonNullList,
	readGraphqlDescription,
	type GraphqlCompileContext,
} from './compile-context.js'
import type { GraphqlFieldTypeCompiler } from './field-compiler.js'

type MutationInputMode = 'create' | 'update'

const numericKinds: ReadonlySet<string> = new Set([
	'bigint',
	'decimal',
	'float',
	'int',
])

const isRelationship = (field: GenericField): boolean =>
	field.kind === 'pointer' || field.kind === 'relation'

const isFieldAvailable = (
	field: GenericField,
	mode: MutationInputMode,
	relationships: boolean,
): boolean =>
	field.kind === 'relation'
		? relationships
		: readFieldTypeState(field)[mode] !== 'forbidden'

/** Generates recursive singular inputs and separate flat bulk/upsert inputs. */
export class GraphqlMutationInputCompiler {
	readonly #ctx: GraphqlCompileContext
	readonly #fieldTypes: GraphqlFieldTypeCompiler
	// Keyed by `${flat}:${mode}`; flat inputs omit pointer and relation fields.
	readonly #roots = new Map<
		string,
		Map<SchemaDefinition, GraphQLInputObjectType | undefined>
	>()
	readonly #nested = new Map<string, GraphQLInputObjectType>()

	constructor(
		ctx: GraphqlCompileContext,
		fieldTypes: GraphqlFieldTypeCompiler,
	) {
		this.#ctx = ctx
		this.#fieldTypes = fieldTypes
	}

	#input(
		name: string,
		schema: SchemaDefinition,
		path: readonly string[] | undefined,
		fields: () => GraphQLInputFieldConfigMap,
	): GraphQLInputObjectType {
		this.#ctx.claim(name, schema, path)
		return this.#ctx.add(
			'mutationInputs',
			new GraphQLInputObjectType({ name, fields }),
		)
	}

	#nestedInput(
		schema: SchemaDefinition,
		fieldName: string,
		suffix: string,
		fields: () => GraphQLInputFieldConfigMap,
	): GraphQLInputObjectType {
		const path = [fieldName]
		return memoize(
			this.#nested,
			`${fieldPathKey(schema, path)}\0${suffix}`,
			() =>
				this.#input(
					`${this.#ctx.typeName(schema, path)}${suffix}`,
					schema,
					path,
					fields,
				),
		)
	}

	#isApplicationOwned(schema: SchemaDefinition): boolean {
		return this.#ctx.surface(schema).owner.kind === 'application'
	}

	// The inverse pointer of a relation decides whether members may be detached.
	#mappedPointer(schema: SchemaDefinition, fieldName: string) {
		const mappedBy = this.#ctx.schemas.schemaTargets.getRelation(schema, [
			fieldName,
		])?.mappedBy
		return mappedBy?.kind === 'pointer' ? mappedBy : undefined
	}

	#updateWrapper(
		field: GenericField,
		schema: SchemaDefinition,
		path: readonly string[],
	): GraphQLInputObjectType {
		const key = `${fieldPathKey(schema, path)}\0value-update`
		return memoize(this.#nested, key, () =>
			this.#input(
				`${this.#ctx.typeName(schema, path)}Update`,
				schema,
				path,
				() => {
					const type = this.#fieldTypes.inputType(field, schema, path)
					const numeric =
						!readFieldTypeState(field).list && numericKinds.has(field.kind)
					return {
						set: { type },
						...(numeric ? { increment: { type }, decrement: { type } } : {}),
					}
				},
			),
		)
	}

	#targetCreateInput(
		source: SchemaDefinition,
		fieldName: string,
		target: SchemaDefinition,
	): GraphQLInputObjectType | undefined {
		if (!this.#isApplicationOwned(target)) return undefined
		const omitted = this.#mappedPointer(source, fieldName)?.fieldPath[0]
		if (omitted === undefined) return this.createInput(target)
		const eligible = Object.entries(target.persistedFields).some(
			([name, field]) =>
				name !== omitted && isFieldAvailable(field, 'create', true),
		)
		if (!eligible) return undefined
		return this.#nestedInput(source, fieldName, 'NestedCreateTargetInput', () =>
			this.#fields(target, 'create', true, omitted),
		)
	}

	#pointerInput(
		schema: SchemaDefinition,
		fieldName: string,
		mode: MutationInputMode,
	): GraphQLInputObjectType {
		const target = this.#ctx.target(schema, [fieldName])
		const suffix = `Nested${mode === 'create' ? 'Create' : 'Update'}Input`
		return this.#nestedInput(schema, fieldName, suffix, () => {
			const owned = this.#isApplicationOwned(target)
			const create = owned ? this.createInput(target) : undefined
			const update =
				mode === 'update' && owned ? this.updateInput(target) : undefined
			// An optional pointer unlinks with `null` (ADR-0308).
			return {
				connect: { type: GraphQLID },
				...(create === undefined ? {} : { create: { type: create } }),
				...(update === undefined ? {} : { update: { type: update } }),
			}
		})
	}

	#relationInput(
		schema: SchemaDefinition,
		fieldName: string,
		mode: MutationInputMode,
	): GraphQLInputObjectType {
		const target = this.#ctx.target(schema, [fieldName])
		const suffix = `Nested${mode === 'create' ? 'Create' : 'Update'}Input`
		return this.#nestedInput(schema, fieldName, suffix, () => {
			const create = this.#targetCreateInput(schema, fieldName, target)
			const update =
				mode === 'update' && this.#isApplicationOwned(target)
					? this.updateInput(target)
					: undefined
			const ids = nonNullList(GraphQLID)
			const updateItem =
				update === undefined
					? undefined
					: this.#nestedInput(
							schema,
							fieldName,
							'NestedUpdateItemInput',
							() => ({
								data: { type: new GraphQLNonNull(update) },
								id: { type: new GraphQLNonNull(GraphQLID) },
							}),
						)
			const mapped = this.#mappedPointer(schema, fieldName)
			const mappedField =
				mapped?.schema.persistedFields[mapped.fieldPath[0] ?? '']
			// A required inverse pointer cannot be cleared, so members stay attached.
			const canDisconnect =
				mappedField === undefined || readFieldTypeState(mappedField).nullable
			return {
				...(create === undefined
					? {}
					: { create: { type: nonNullList(create) } }),
				connect: { type: ids },
				...(updateItem === undefined
					? {}
					: { update: { type: nonNullList(updateItem) } }),
				// `{ set: [] }` removes every visible member (ADR-0308).
				...(mode === 'update' && canDisconnect
					? { disconnect: { type: ids }, set: { type: ids } }
					: {}),
			}
		})
	}

	#fields(
		schema: SchemaDefinition,
		mode: MutationInputMode,
		relationships: boolean,
		omitted?: string,
	): GraphQLInputFieldConfigMap {
		const compiled: [string, GraphQLInputFieldConfigMap[string]][] = []
		for (const [fieldName, field] of Object.entries(schema.persistedFields)) {
			if (
				fieldName === omitted ||
				!isFieldAvailable(field, mode, relationships) ||
				(!relationships && isRelationship(field))
			) {
				continue
			}
			const path = [fieldName]
			assertSchemaFieldName(schema, path)
			const type =
				field.kind === 'pointer'
					? this.#pointerInput(schema, fieldName, mode)
					: field.kind === 'relation'
						? this.#relationInput(schema, fieldName, mode)
						: mode === 'create'
							? this.#fieldTypes.inputType(field, schema, path)
							: this.#updateWrapper(field, schema, path)
			const required =
				mode === 'create' && readFieldTypeState(field).create === 'required'
			compiled.push([
				fieldName,
				{
					description: readGraphqlDescription(field),
					type: required ? new GraphQLNonNull(type) : type,
				},
			])
		}
		return Object.fromEntries(compiled)
	}

	// Inputs exist only when at least one field may be written in that mode.
	#root(
		schema: SchemaDefinition,
		mode: MutationInputMode,
		flat: boolean,
	): GraphQLInputObjectType | undefined {
		const key = `${String(flat)}:${mode}`
		const cache = memoize(
			this.#roots,
			key,
			() => new Map<SchemaDefinition, GraphQLInputObjectType | undefined>(),
		)
		return memoize(cache, schema, () => {
			const relationships = !flat
			const eligible = Object.values(schema.persistedFields).some(
				(field) =>
					isFieldAvailable(field, mode, relationships) &&
					(!flat || !isRelationship(field)),
			)
			if (!eligible) return undefined
			const name = `${this.#ctx.typeName(schema)}${flat ? 'Flat' : ''}${mode === 'create' ? 'Create' : 'Update'}Input`
			return this.#input(name, schema, undefined, () =>
				this.#fields(schema, mode, relationships),
			)
		})
	}

	createInput(schema: SchemaDefinition): GraphQLInputObjectType | undefined {
		return this.#root(schema, 'create', false)
	}

	flatCreateInput(
		schema: SchemaDefinition,
	): GraphQLInputObjectType | undefined {
		return this.#root(schema, 'create', true)
	}

	updateInput(schema: SchemaDefinition): GraphQLInputObjectType | undefined {
		return this.#root(schema, 'update', false)
	}

	flatUpdateInput(
		schema: SchemaDefinition,
	): GraphQLInputObjectType | undefined {
		return this.#root(schema, 'update', true)
	}
}
