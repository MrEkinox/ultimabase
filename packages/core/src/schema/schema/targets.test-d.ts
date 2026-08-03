import { expectTypeOf, test } from 'vitest'

import {
	FrameworkApplication,
	Schema,
	SchemaRegistry,
	SchemaTargetResolutionError,
	stringField,
	type FieldDefinition,
	type SchemaClass,
	type SchemaDefinition,
	type SchemaTarget,
	type SchemaTargetGraph,
} from '../../index.js'
import { createFieldDefinition } from '../fields/base/definition.js'

const userSchema = Schema.define({
	className: 'User',
	fields: { name: stringField() },
})
const postSchema = Schema.define({
	className: 'Post',
	fields: { title: stringField() },
})

declare const relationshipTargetMarker: unique symbol

type FixtureRelationshipField<TTarget extends SchemaDefinition> =
	FieldDefinition<'fixture.relationship', string, Readonly<object>> & {
		readonly [relationshipTargetMarker]?: TTarget
	}

/** Mirrors the private capability seam consumed by pointerField in issue 702. */
const fixtureRelationshipField = <TTarget extends SchemaDefinition>(
	target: SchemaTarget<TTarget>,
): FixtureRelationshipField<TTarget> =>
	createFieldDefinition(
		'fixture.relationship',
		{},
		(value: unknown): string => String(value),
		undefined,
		undefined,
		{ schemaTarget: target },
	)

type RecursiveUserSchema = SchemaClass<
	'RecursiveUser',
	Readonly<{
		readonly posts: FixtureRelationshipField<RecursivePostSchema>
	}>
>

type RecursivePostSchema = SchemaClass<
	'RecursivePost',
	Readonly<{
		readonly author: FixtureRelationshipField<RecursiveUserSchema>
	}>
>

test('preserves one exact schema through a lazy target callback', () => {
	const userTarget: SchemaTarget<typeof userSchema> = () => userSchema

	expectTypeOf(userTarget()).toEqualTypeOf<typeof userSchema>()
	expectTypeOf<ReturnType<typeof userTarget>>().toEqualTypeOf<
		typeof userSchema
	>()

	// @ts-expect-error -- One target cannot silently change schema identity.
	const invalidTarget: SchemaTarget<typeof userSchema> = () => postSchema
	void invalidTarget
})

test('supports exact mutually recursive target contracts', () => {
	function resolveRecursivePost(): RecursivePostSchema {
		return recursivePost
	}

	const recursiveUser: RecursiveUserSchema = Schema.define({
		className: 'RecursiveUser',
		fields: {
			posts: fixtureRelationshipField(resolveRecursivePost),
		},
	})
	const recursivePost: RecursivePostSchema = Schema.define({
		className: 'RecursivePost',
		fields: {
			author: fixtureRelationshipField(
				(): RecursiveUserSchema => recursiveUser,
			),
		},
	})

	expectTypeOf(recursiveUser.fields.posts).toEqualTypeOf<
		FixtureRelationshipField<RecursivePostSchema>
	>()
	expectTypeOf(recursivePost.fields.author).toEqualTypeOf<
		FixtureRelationshipField<RecursiveUserSchema>
	>()
})

test('exposes the immutable graph through registries and applications', () => {
	const registry = new SchemaRegistry([userSchema])
	const application = new FrameworkApplication({
		schemas: [userSchema],
		plugins: [],
	})

	expectTypeOf(
		registry.resolveSchemaTargets(),
	).toEqualTypeOf<SchemaTargetGraph>()
	expectTypeOf(registry.schemaTargets).toEqualTypeOf<SchemaTargetGraph>()
	expectTypeOf(application.schemaTargets).toEqualTypeOf<SchemaTargetGraph>()
	expectTypeOf(
		registry.resolveSchemaTargets().get(userSchema, ['friend']),
	).toEqualTypeOf<SchemaDefinition | undefined>()
	expectTypeOf(registry.resolveSchemaTargets().values()).toEqualTypeOf<
		readonly {
			readonly fieldPath: readonly string[]
			readonly source: SchemaDefinition
			readonly target: SchemaDefinition
		}[]
	>()
})

test('exports precise target resolution diagnostics', () => {
	const error = new SchemaTargetResolutionError(
		'invalid-target',
		'Post',
		['author'],
		'Invalid target',
	)

	expectTypeOf(error.code).toEqualTypeOf<'SCHEMA_TARGET_RESOLUTION_FAILED'>()
	expectTypeOf(error.reason).toEqualTypeOf<
		| 'callback-threw'
		| 'foreign-target'
		| 'invalid-target'
		| 'unregistered-target'
	>()
	expectTypeOf(error.fieldPath).toEqualTypeOf<readonly string[]>()
	expectTypeOf(error.targetClassName).toEqualTypeOf<string | undefined>()
})
