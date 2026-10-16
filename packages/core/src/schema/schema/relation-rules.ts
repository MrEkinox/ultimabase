import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import { attachRelationWhereDeclaration } from '../fields/base/definition.js'
import {
	normalizeRelationWhereDeclaration,
	type RelationField,
	type RelationWhere,
	type RelationWhereDeclaration,
} from '../fields/builtins/relation.js'
import type { SchemaDeclaredFields, SchemaDefinition } from './definition.js'
import type { ResolveSchemaTarget } from './deferred-targets.js'
import { isDeclaredRelationField } from './field-builder.js'
import type { SchemaRulesTarget } from './registered-schemas.js'

type DeclaredRelationFieldName<TFields> = {
	[TName in keyof TFields]: TFields[TName] extends RelationField ? TName : never
}[keyof TFields] &
	string

type DeclaredRelationTarget<TField> =
	TField extends RelationField<infer TTarget>
		? Extract<SchemaRulesTarget<ResolveSchemaTarget<TTarget>>, SchemaDefinition>
		: never

/**
 * The rules of one relation field in the final `plugins.relations(…)`.
 *
 * @example
 * ```ts
 * const publishedOnly: RelationRule<typeof Article> = {
 *   where: { published: { eq: true } },
 * }
 * ```
 */
export interface RelationRule<
	TTarget extends SchemaDefinition = SchemaDefinition,
> {
	/**
	 * Narrows every read through this relation without replacing caller filters.
	 * It limits reads, never linking or unlinking.
	 * @example `where: { published: { eq: true } }`
	 * @example `where: ({ where }) => where.eq('published', true)`
	 */
	readonly where?: RelationWhere<TTarget>
}

/**
 * Core rules of the final `.with(...)` for the relation fields of a schema,
 * typed against their complete targets, so two schemas may filter each
 * other's relations (ADR-0328). Absent when the schema has no relation field.
 */
export type ConfiguredSchemaRelationRules<TFields> = [
	DeclaredRelationFieldName<TFields>,
] extends [never]
	? unknown
	: Readonly<{
			/**
			 * Declares relation filters by relation field name.
			 *
			 * @example `.with((plugins) => plugins.relations({ articles: { where: { published: { eq: true } } } }))`
			 */
			readonly relations?: {
				readonly [TName in DeclaredRelationFieldName<TFields>]?: RelationRule<
					DeclaredRelationTarget<TFields[TName]>
				>
			}
		}>

/**
 * @internal Validates the `relations` rules of one `.with(...)` against the
 * captured fields of its schema and normalizes each filter.
 */
export const readRelationRules = (
	value: unknown,
	fields: Readonly<Record<string, unknown>>,
): ReadonlyMap<string, RelationWhereDeclaration> => {
	if (value === undefined) return new Map()
	if (!isPlainRecord(value)) {
		throw new TypeError('relations must be a plain object')
	}
	const filters = new Map<string, RelationWhereDeclaration>()
	for (const [name, rule] of Object.entries(value)) {
		if (
			!Object.hasOwn(fields, name) ||
			!isDeclaredRelationField(fields[name])
		) {
			throw new TypeError(
				`relations.${name} must name a relation field of this schema`,
			)
		}
		if (!isPlainRecord(rule)) {
			throw new TypeError(`relations.${name} must be a plain object`)
		}
		const unknownKey = Object.keys(rule).find((key) => key !== 'where')
		if (unknownKey !== undefined) {
			throw new TypeError(
				`Unknown relation rule: relations.${name}.${unknownKey}`,
			)
		}
		if (rule.where !== undefined) {
			filters.set(
				name,
				normalizeRelationWhereDeclaration(
					rule.where,
					`relations.${name}.where`,
				),
			)
		}
	}
	return filters
}

/** @internal Attaches the filters of `plugins.relations(…)` to the resolved relation fields. */
export const applyRelationRules = (
	fields: SchemaDeclaredFields,
	filters: ReadonlyMap<string, RelationWhereDeclaration> | undefined,
): SchemaDeclaredFields =>
	filters === undefined || filters.size === 0
		? fields
		: immutableRecord(
				Object.fromEntries(
					Object.entries(fields).map(([name, field]) => {
						const where = filters.get(name)
						return [
							name,
							where === undefined || field.kind === 'virtual'
								? field
								: attachRelationWhereDeclaration(field, where),
						]
					}),
				),
			)
