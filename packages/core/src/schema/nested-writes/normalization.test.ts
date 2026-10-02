import { describe, expect, it } from 'vitest'

import { normalizeRuntimeValidationOptions } from '../../runtime/validation/runtime-validation.js'
import { SchemaRegistry } from '../schema/registry.js'
import { normalizeNestedWriteGraph } from './normalization.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

const Author = UltimaBase.Schema.define({
	className: 'NestedAuthor',
	fields: (field) => ({
		name: field.string({ required: true }),
		posts: field.relation({
			mappedBy: 'author',
			target: 'NestedPost',
		}),
	}),
})

const Post = UltimaBase.Schema.define({
	className: 'NestedPost',
	fields: (field) => ({
		author: field.pointer({ required: true, target: 'NestedAuthor' }),
		parent: field.pointer({ target: 'NestedPost' }),
		tags: field.relation({ target: 'NestedTag' }),
		title: field.string({ required: true }),
	}),
})

const Tag = UltimaBase.Schema.define({
	className: 'NestedTag',
	fields: (field) => ({ label: field.string({ required: true }) }),
})

const schemas = new SchemaRegistry([Author, Post, Tag])
schemas.resolveSchemaTargets()

/** Keeps malformed JavaScript inputs on the Runtime validation path. */
const normalizeUntrustedGraph = (
	schema: typeof Author | typeof Post,
	command: 'create' | 'update',
	input: unknown,
	options?: { readonly maxDepth?: number; readonly maxOperations?: number },
): unknown => {
	return Reflect.apply(normalizeNestedWriteGraph, undefined, [
		schemas,
		schema,
		command,
		input,
		options,
	]) as unknown
}

describe('normalizeNestedWriteGraph', () => {
	it('normalizes application limits and rejects unsafe values', () => {
		const options = normalizeRuntimeValidationOptions({
			nestedWrites: { maxOperations: 250 },
		})

		expect(options.nestedWrites).toEqual({
			maxDepth: 5,
			maxOperations: 250,
		})
		expect(Object.isFrozen(options.nestedWrites)).toBe(true)
		expect(() =>
			normalizeRuntimeValidationOptions({ nestedWrites: { maxDepth: -1 } }),
		).toThrow('Nested-write maxDepth must be a non-negative safe integer')
		expect(() =>
			normalizeRuntimeValidationOptions({
				nestedWrites: { maxOperations: 0 },
			}),
		).toThrow('Nested-write maxOperations must be a positive safe integer')
	})

	it('separates scalar data from one deterministic immutable relationship graph', () => {
		const graph = normalizeNestedWriteGraph(schemas, Post, 'create', {
			author: { connect: 'author-1' },
			tags: {
				connect: ['tag-1'],
				create: [{ label: 'new' }],
			},
			title: 'Hello',
		})

		expect(graph).toMatchObject({
			kind: 'nested-write-graph',
			limits: { maxDepth: 5, maxOperations: 100 },
			operationCount: 5,
			root: {
				command: 'create',
				data: { title: 'Hello' },
				depth: 0,
				kind: 'object',
				schema: Post,
			},
		})
		expect(
			graph.root.relationships.map(({ fieldName, command }) => [
				fieldName,
				command,
			]),
		).toEqual([
			['author', 'connect'],
			['tags', 'create'],
			['tags', 'connect'],
		])
		const relationCreate = graph.root.relationships[1]
		expect(relationCreate).toMatchObject({
			actionOperationIndexes: [3],
			command: 'create',
			dependency: 'after-source',
			input: [{ label: 'new' }],
			kind: 'relation',
			source: Post,
			target: Tag,
		})
		expect(relationCreate?.provenance).toMatchObject({
			declarationIndex: 2,
			inputPath: ['data', 'tags', 'create'],
			sourcePath: ['tags'],
		})
		expect(relationCreate?.provenance.contribution).toBe(
			Post.provenance.fields.tags,
		)
		expect(Object.isFrozen(graph)).toBe(true)
		expect(Object.isFrozen(graph.root)).toBe(true)
		expect(Object.isFrozen(graph.root.data)).toBe(true)
		expect(Object.isFrozen(graph.root.relationships)).toBe(true)
		expect(Object.isFrozen(relationCreate?.input)).toBe(true)
	})

	it('normalizes pointer updates and relation commands in fixed command order', () => {
		const graph = normalizeNestedWriteGraph(schemas, Post, 'update', {
			author: { update: { name: 'Renamed' } },
			tags: {
				disconnect: ['tag-3'],
				update: [{ data: { label: 'Updated' }, id: 'tag-2' }],
				connect: ['tag-1'],
				create: [{ label: 'Created' }],
			},
		})

		expect(
			graph.root.relationships.map(({ fieldName, command }) => [
				fieldName,
				command,
			]),
		).toEqual([
			['author', 'update'],
			['tags', 'create'],
			['tags', 'connect'],
			['tags', 'update'],
			['tags', 'disconnect'],
		])
		expect(graph.operationCount).toBe(7)
		expect(graph.root.relationships[0]).toMatchObject({
			actionOperationIndexes: [],
			child: { command: 'update', data: { name: 'Renamed' } },
			command: 'update',
			dependency: 'before-source',
		})
	})

	it('keeps schema declaration indexes when earlier fields are omitted', () => {
		const graph = normalizeNestedWriteGraph(schemas, Post, 'update', {
			tags: { connect: ['tag-1'] },
			parent: { connect: 'post-1' },
		})

		expect(
			graph.root.relationships.map(({ fieldName, provenance }) => [
				fieldName,
				provenance.declarationIndex,
			]),
		).toStrictEqual([
			['parent', 1],
			['tags', 2],
		])
	})

	it('supports inverse contextual creates but rejects caller ownership injection', () => {
		const graph = normalizeNestedWriteGraph(schemas, Author, 'create', {
			name: 'Ada',
			posts: { create: [{ title: 'First' }] },
		})

		expect(graph.root.relationships[0]).toMatchObject({
			children: [{ data: { title: 'First' }, schema: Post }],
			command: 'create',
			fieldName: 'posts',
		})
		expect(() =>
			normalizeNestedWriteGraph(schemas, Author, 'create', {
				name: 'Ada',
				posts: {
					create: [
						{
							author: { connect: 'other-author' },
							title: 'Invalid',
						},
					],
				},
			}),
		).toThrow('data.posts.create[0].author is injected by the inverse relation')
	})

	it('rejects unavailable, exclusive, duplicate, and contradictory commands', () => {
		expect(() =>
			normalizeUntrustedGraph(Post, 'create', {
				author: { disconnect: true },
				title: 'Invalid',
			}),
		).toThrow('data.author.disconnect is not available')
		expect(() =>
			normalizeUntrustedGraph(Post, 'update', {
				author: { connect: 'one', update: { name: 'Ada' } },
			}),
		).toThrow('data.author must contain one pointer command')
		expect(() =>
			normalizeUntrustedGraph(Post, 'update', {
				tags: { clear: true, connect: ['tag-1'] },
			}),
		).toThrow('data.tags replacement command must be exclusive')
		expect(() =>
			normalizeUntrustedGraph(Post, 'update', {
				tags: { set: ['tag-1', 'tag-1'] },
			}),
		).toThrow('data.tags.set contains duplicate object IDs')
		expect(() =>
			normalizeUntrustedGraph(Post, 'update', {
				tags: { connect: ['tag-1'], disconnect: ['tag-1'] },
			}),
		).toThrow('contradicts another command for object ID "tag-1"')
		expect(() =>
			normalizeUntrustedGraph(Author, 'update', {
				posts: { disconnect: ['post-1'] },
			}),
		).toThrow('data.posts.disconnect is not available')
	})

	it('rejects malformed, cyclic, too-deep, and oversized inputs', () => {
		const unknown = { title: 'Hello', unknown: true }
		expect(() => normalizeUntrustedGraph(Post, 'create', unknown)).toThrow(
			'data.unknown is unknown',
		)

		const symbol = Symbol('hidden')
		const symbolic = { title: 'Hello', [symbol]: true }
		expect(() => normalizeUntrustedGraph(Post, 'create', symbolic)).toThrow(
			'data cannot contain symbol keys',
		)

		const cyclic: Record<string, unknown> = { title: 'Root' }
		cyclic.parent = { create: cyclic }
		expect(() => normalizeUntrustedGraph(Post, 'create', cyclic)).toThrow(
			'data.parent.create contains cyclic input',
		)

		expect(() =>
			normalizeUntrustedGraph(
				Post,
				'create',
				{
					parent: {
						create: {
							parent: { create: { title: 'Too deep' } },
							title: 'Child',
						},
					},
					title: 'Root',
				},
				{ maxDepth: 1 },
			),
		).toThrow('Nested write exceeds maxDepth 1')

		expect(() =>
			normalizeUntrustedGraph(
				Post,
				'create',
				{ author: { connect: 'author-1' }, title: 'Root' },
				{ maxOperations: 1 },
			),
		).toThrow('Nested write exceeds maxOperations 1')
	})

	it('rejects roots owned by another compiled application', () => {
		const otherSchemas = new SchemaRegistry([Tag])
		otherSchemas.resolveSchemaTargets()

		expect(() =>
			Reflect.apply(normalizeNestedWriteGraph, undefined, [
				otherSchemas,
				Post,
				'create',
				{ title: 'Foreign' },
			]),
		).toThrow('Nested-write root schema must belong to the application')
	})
})
