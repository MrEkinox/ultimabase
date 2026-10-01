import { describe, expect, it } from 'vitest'

import { QueryBuilder } from '../../query/query/query.js'
import { Schema } from './definition.js'
import {
	isSchemaModelInstance,
	materializePreparedSchemaDraft,
	materializeSchemaModel,
} from './model.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

const Post = UltimaBase.Schema.define({
	className: 'Post',
	fields: (field) => ({
		title: field.string({ required: true }),
		summary: field.string(),
		profile: field.object({
			fields: (field) => ({
				displayName: field.string({ required: true }),
			}),
		}),
	}),
})

/** Exercises JavaScript constructor validation beyond TypeScript's exact input. */
const constructUntrustedPost = (input: unknown): unknown => {
	return Reflect.construct(Post, [input]) as unknown
}

describe('schema model classes', () => {
	it('constructs immutable detached drafts without performing I/O', () => {
		const profile = { displayName: 'Initial' }
		const draft = new Post({
			profile,
			summary: null,
			title: 'Hello',
		})

		profile.displayName = 'Changed'

		expect(draft).toBeInstanceOf(Post)
		expect(draft.title).toBe('Hello')
		expect(draft.profile).toStrictEqual({ displayName: 'Initial' })
		expect(draft.get('summary')).toBeNull()
		expect(draft.toJSON()).toStrictEqual({
			profile: { displayName: 'Initial' },
			summary: null,
			title: 'Hello',
		})
		expect(Object.isFrozen(draft)).toBe(true)
		expect(Object.isFrozen(draft.profile)).toBe(true)
		expect(isSchemaModelInstance(Post, draft)).toBe(true)
		expect(isSchemaModelInstance(Post, draft.toJSON())).toBe(false)
		expect(isSchemaModelInstance(Post, 'not-a-model')).toBe(false)
		expect(Reflect.set(draft, 'title', 'Changed')).toBe(false)
		expect(() => draft.get('missing' as 'title')).toThrow(
			new TypeError('Schema model field is not visible: missing'),
		)

		const prototype = Reflect.getPrototypeOf(draft)

		if (prototype === null) {
			throw new TypeError('Schema model instance must have a prototype')
		}

		const detachedGet: unknown = Reflect.get(prototype, 'get')

		if (typeof detachedGet !== 'function') {
			throw new TypeError('Schema model prototype must expose get')
		}

		// Borrowed methods cannot turn structurally similar objects into trusted models.
		expect((): void => {
			Reflect.apply(detachedGet, {}, ['title'])
		}).toThrow(
			new TypeError('Schema model instance has no trusted model state'),
		)
	})

	it('rejects malformed drafts and public subclass construction', () => {
		expect(() => constructUntrustedPost(null)).toThrow(
			new TypeError('Schema model input must be a plain object'),
		)
		expect(() => constructUntrustedPost({})).toThrow(
			new TypeError('Schema model input field is required: title'),
		)
		expect(() =>
			constructUntrustedPost({ title: 'Hello', unknown: true }),
		).toThrow(
			new TypeError('Schema model input contains an unknown field: unknown'),
		)
		const symbolField = Symbol('unknown')
		const symbolInput = { [symbolField]: true, title: 'Hello' }

		expect(() => constructUntrustedPost(symbolInput)).toThrow(
			new TypeError(
				'Schema model input contains an unknown field: Symbol(unknown)',
			),
		)

		class ExtendedPost extends Post {}

		expect(() => new ExtendedPost({ title: 'Hello' })).toThrow(
			new TypeError('Schema model classes cannot be subclassed'),
		)
		expect(Schema.is(ExtendedPost)).toBe(false)
	})

	it('materializes complete prepared drafts without persistence capabilities', () => {
		const prepared = materializePreparedSchemaDraft(Post, {
			createdAt: '2026-08-08T00:00:00.000Z',
			id: '0198f090-2a50-7000-8000-000000000031',
			profile: null,
			summary: null,
			title: 'Prepared',
			updatedAt: '2026-08-08T00:00:00.000Z',
		})

		expect(prepared).toBeInstanceOf(Post)
		expect(prepared.get('title')).toBe('Prepared')
		expect(prepared.toJSON()).toStrictEqual({
			createdAt: '2026-08-08T00:00:00.000Z',
			id: '0198f090-2a50-7000-8000-000000000031',
			profile: null,
			summary: null,
			title: 'Prepared',
			updatedAt: '2026-08-08T00:00:00.000Z',
		})
		expect(Object.isFrozen(prepared)).toBe(true)
		expect(isSchemaModelInstance(Post, prepared)).toBe(true)
		expect(() => materializePreparedSchemaDraft(Post, [])).toThrow(
			new TypeError(
				'Prepared draft schema model values must be a plain object',
			),
		)

		const create: unknown = Reflect.get(prepared, 'create')

		if (typeof create !== 'function') {
			throw new TypeError(
				'Prepared draft prototype must expose guarded commands',
			)
		}

		expect((): void => {
			Reflect.apply(create, prepared, [{}])
		}).toThrow(new TypeError('Schema model create requires draft model state'))
	})

	it('materializes only visible Runtime values as persisted class instances', () => {
		const selected = materializeSchemaModel(Post, {
			id: '0198f090-2a50-7000-8000-000000000032',
			title: 'Selected',
		})

		expect(selected).toBeInstanceOf(Post)
		expect(selected.toJSON()).toStrictEqual({
			id: '0198f090-2a50-7000-8000-000000000032',
			title: 'Selected',
		})
		expect(selected).not.toHaveProperty('summary')
		expect(Object.keys(selected)).toStrictEqual(['id', 'title'])
		expect({ ...selected }).toStrictEqual({
			id: '0198f090-2a50-7000-8000-000000000032',
			title: 'Selected',
		})
		expect(JSON.stringify(selected)).toBe(
			'{"id":"0198f090-2a50-7000-8000-000000000032","title":"Selected"}',
		)
		expect(() => selected.get('summary' as 'title')).toThrow(
			new TypeError('Schema model field is not visible: summary'),
		)
		expect(() => materializeSchemaModel(Post, { unknown: true })).toThrow(
			new TypeError(
				'Persisted schema model contains an unknown field: unknown',
			),
		)
		expect(() => materializeSchemaModel(Post, [])).toThrow(
			new TypeError('Persisted schema model values must be a plain object'),
		)
		expect(() =>
			materializeSchemaModel(Post, { [Symbol('unknown')]: true }),
		).toThrow(
			new TypeError(
				'Persisted schema model contains an unknown field: Symbol(unknown)',
			),
		)

		const foreignSchema = (() => undefined) as unknown as typeof Post

		expect(() => materializeSchemaModel(foreignSchema, {})).toThrow(
			new TypeError('Schema model class was not created by App.Schema.define'),
		)
	})

	it('keeps construction provenance private and rejects mixed identities', async () => {
		const lookalikeConstructionKey = Symbol(
			'ultimabase.persisted-schema-model-construction',
		)
		const DynamicPost = Post as unknown as new (
			input: unknown,
			constructionKey: symbol,
			materialization: Readonly<{ objectId: string }>,
		) => object
		const forged = new DynamicPost(
			{ title: 'Still a draft' },
			lookalikeConstructionKey,
			{ objectId: '0198f090-2a50-7000-8000-000000000037' },
		)
		const toJSON: unknown = Reflect.get(forged, 'toJSON')
		const update: unknown = Reflect.get(forged, 'update')

		if (typeof toJSON !== 'function' || typeof update !== 'function') {
			throw new TypeError('Schema model prototype commands are unavailable')
		}

		expect(isSchemaModelInstance(Post, forged)).toBe(true)
		expect(Reflect.apply(toJSON, forged, [])).toStrictEqual({
			title: 'Still a draft',
		})
		await expect(
			Reflect.apply(update, forged, [{ data: { title: 'Forged' } }]),
		).rejects.toThrow(
			new TypeError('Schema model update requires persisted model state'),
		)

		expect(() =>
			materializeSchemaModel(
				Post,
				{
					id: '0198f090-2a50-7000-8000-000000000038',
					title: 'Visible identity',
				},
				{ objectId: '0198f090-2a50-7000-8000-000000000039' },
			),
		).toThrow(
			new TypeError(
				'Persisted schema model visible id does not match protected identity',
			),
		)
	})

	it('keeps lifecycle commands behind trusted draft and persisted state', async () => {
		const draft = new Post({ title: 'Draft' })
		const persisted = materializeSchemaModel(Post, {
			id: '0198f090-2a50-7000-8000-000000000033',
			title: 'Persisted',
		})
		const selected = materializeSchemaModel(
			Post,
			{ title: 'Selected' },
			{
				objectId: '0198f090-2a50-7000-8000-000000000034',
				selectedFields: ['title'],
			},
		)
		const missingIdentity = materializeSchemaModel(Post, { title: 'Missing' })

		await expect(
			Reflect.apply(Reflect.get(draft, 'update') as () => unknown, draft, [
				{ title: 'Forged' },
			]),
		).rejects.toThrow(
			new TypeError('Schema model update requires persisted model state'),
		)
		await expect(
			Reflect.apply(Reflect.get(draft, 'delete') as () => unknown, draft, []),
		).rejects.toThrow(
			new TypeError('Schema model delete requires persisted model state'),
		)
		await expect(
			Reflect.apply(Reflect.get(draft, 'fetch') as () => unknown, draft, [{}]),
		).rejects.toThrow(
			new TypeError('Schema model fetch requires persisted model state'),
		)
		expect((): void => {
			Reflect.apply(Reflect.get(draft, 'exists') as () => unknown, draft, [])
		}).toThrow(
			new TypeError('Schema model exists requires persisted model state'),
		)
		expect((): void => {
			Reflect.apply(Reflect.get(draft, 'toPointer') as () => unknown, draft, [])
		}).toThrow(
			new TypeError('Schema model toPointer requires persisted model state'),
		)
		expect((): void => {
			Reflect.apply(Reflect.get(draft, 'equals') as () => unknown, draft, [
				persisted,
			])
		}).toThrow(
			new TypeError('Schema model equals requires persisted model state'),
		)
		expect((): void => {
			Reflect.apply(
				Reflect.get(persisted, 'create') as () => unknown,
				persisted,
				[],
			)
		}).toThrow(new TypeError('Schema model create requires draft model state'))
		expect((): void => {
			Reflect.apply(
				Reflect.get(persisted, 'upsert') as () => unknown,
				persisted,
				[
					{
						update: { title: 'Forged' },
						where: { title: 'Persisted' },
					},
				],
			)
		}).toThrow(new TypeError('Schema model upsert requires draft model state'))
		await expect(
			Reflect.apply(
				Reflect.get(missingIdentity, 'delete') as () => unknown,
				missingIdentity,
				[],
			),
		).rejects.toThrow(
			new TypeError(
				'Schema model delete requires protected persisted identity',
			),
		)
		await expect(missingIdentity.fetch({})).rejects.toThrow(
			new TypeError('Schema model fetch requires protected persisted identity'),
		)
		expect(() => missingIdentity.toPointer()).toThrow(
			new TypeError(
				'Schema model toPointer requires protected persisted identity',
			),
		)
		expect(selected.toJSON()).toStrictEqual({ title: 'Selected' })
		await expect(selected.delete({})).rejects.toMatchObject({
			code: 'MISSING_EXECUTION_CONTEXT',
		})
	})

	it('compares and detaches protected persisted identities without I/O', () => {
		const objectId = '0198f090-2a50-7000-8000-000000000035'
		const selected = materializeSchemaModel(
			Post,
			{ title: 'Selected' },
			{ objectId, selectedFields: ['title'] },
		)
		const sameIdentity = materializeSchemaModel(
			Post,
			{ title: 'Fresh' },
			{ objectId, selectedFields: ['title'] },
		)
		const otherIdentity = materializeSchemaModel(
			Post,
			{ title: 'Other' },
			{
				objectId: '0198f090-2a50-7000-8000-000000000036',
				selectedFields: ['title'],
			},
		)
		const Other = UltimaBase.Schema.define({
			className: 'OtherIdentity',
			fields: () => ({}),
		})
		const otherSchema = materializeSchemaModel(
			Other,
			{},
			{ objectId, selectedFields: [] },
		)
		const pointer = selected.toPointer()

		expect(pointer.schema).toBe(Post)
		expect(pointer.id).toBe(objectId)
		expect(selected.equals(pointer)).toBe(true)
		expect(selected.equals(sameIdentity)).toBe(true)
		expect(selected.equals(otherIdentity)).toBe(false)
		expect(selected.equals(otherSchema)).toBe(false)
		expect(
			Reflect.apply(
				Reflect.get(selected, 'equals') as () => unknown,
				selected,
				[new Post({ title: 'Draft' })],
			),
		).toBe(false)
	})

	it('creates independent QueryBuilder branches for reusable object inputs', () => {
		const first = new QueryBuilder(Post).select({ id: true, title: true })
		const second = new QueryBuilder(Post).where((where) =>
			where.eq('title', 'Second'),
		)

		expect(first).toBeInstanceOf(QueryBuilder)
		expect(first.schema).toBe(Post)
		expect(first.ast.selection.fields).toStrictEqual([
			{ field: 'id', kind: 'selected-field' },
			{ field: 'title', kind: 'selected-field' },
		])
		expect(second.ast.selection.fields).toStrictEqual([])
		expect(first.ast.where).toBeUndefined()
	})

	it('attaches specialization commands only to trusted persisted models', () => {
		const Target = UltimaBase.Schema.define({
			className: 'CapabilityTarget',
			fields: () => ({}),
		})
		const Specialized = Schema.defineSpecialized(
			{ className: 'CapabilitySource', fields: () => ({}) },
			(context) => ({
				statics: { kind: 'specialized' as const },
				results: {
					targetId(
						this: object,
						target: Parameters<typeof context.toPointer<typeof Target>>[1],
					): string {
						context.assertPersisted(this, 'targetId')
						return context.toPointer(Target, target, 'targetId').id
					},
				},
			}),
		)
		const source = materializeSchemaModel(Specialized, {
			id: '0198f090-2a50-7000-8000-000000000041',
		})
		const target = materializeSchemaModel(Target, {
			id: '0198f090-2a50-7000-8000-000000000042',
		})
		const draft = new Specialized({})
		const targetId: unknown = Reflect.get(draft, 'targetId')

		if (typeof targetId !== 'function') {
			throw new TypeError('Specialized model must expose targetId at runtime')
		}
		const invokeTargetId = targetId as (
			this: object,
			target: unknown,
		) => unknown

		expect(Specialized.kind).toBe('specialized')
		expect(source.targetId(target)).toBe('0198f090-2a50-7000-8000-000000000042')
		expect(source.targetId(Target.pointer('target-pointer'))).toBe(
			'target-pointer',
		)
		expect(() => invokeTargetId.call(draft, target)).toThrow(
			new TypeError('Schema model targetId requires persisted model state'),
		)
		expect(Object.isFrozen(Reflect.getPrototypeOf(source))).toBe(true)
	})
})
