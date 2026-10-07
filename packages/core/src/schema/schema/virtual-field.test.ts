import { describe, expect, it } from 'vitest'

import {
	definePluginFieldFamily,
	plugin as createPlugin,
	contributeDeclarations,
	definePluginOutputDescriptor,
	type OutputBuilder,
} from '../../index.js'
import { createApplication } from '../../application/framework-application.js'
import { normalizeQueryOrdering } from '../../query/clauses/ordering.js'
import { normalizeQuerySelection } from '../../query/clauses/selection.js'
import { Schema } from './definition.js'
import { SchemaCompilationError } from './definition-compilation.js'
import { SchemaRegistry } from './registry.js'
import { getVirtualFieldResolver } from './virtual-field.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

const compile = (schema: unknown): void => {
	if (!Schema.is(schema)) {
		throw new TypeError('Expected a schema')
	}
	new SchemaRegistry([schema]).compileSchemas()
}

const deepestMessage = (operation: () => unknown): string => {
	try {
		operation()
	} catch (error: unknown) {
		if (!(error instanceof Error)) throw error
		let current = error
		while (current.cause instanceof Error) current = current.cause
		return current.message
	}
	throw new TypeError('Expected operation to throw')
}

describe('virtual schema fields', () => {
	it('resolves plugin output descriptors once for each compatible application graph', async () => {
		let outputCallbacks = 0
		const slugOutput = () =>
			definePluginOutputDescriptor(
				'fixture.virtual-slug',
				{ list: false, nullable: false },
				(value, path) => {
					if (typeof value !== 'string') {
						throw new TypeError(`${path} must be a string`)
					}
					return value
				},
			)
		type SlugOutputMethod = typeof slugOutput
		const method = definePluginFieldFamily({
			fieldKind: 'fixture.virtual-slug',
			typegen: {
				module: '@fixture/virtual-slug-plugin',
				valueType: 'VirtualSlugValue',
			},
			builder: {
				name: 'virtualSlug',
				contexts: {
					output: {
						factory: slugOutput,
						methodType: 'VirtualSlugOutputBuilderMethod',
					},
				},
			},
		})
		const plugin = () =>
			createPlugin({
				core: '^0.0.0',
				id: 'fixture.virtual-slug-plugin',
				permissions: { 'schema:declare': 'Declares a fixture virtual output.' },
				version: '1.0.0',
				contributions: [
					contributeDeclarations({
						schema: ({ fields }) => {
							fields.register(method)

							return undefined
						},
					}),
				],
			})
		const Shared = UltimaBase.Schema.define({
			className: 'SharedPluginVirtual',
			fields: (field) => ({
				slug: field.virtual({
					output: (output) => {
						outputCallbacks += 1
						return (
							output as OutputBuilder & {
								readonly virtualSlug: SlugOutputMethod
							}
						).virtualSlug()
					},
					resolve: ({ item }) => item.id,
					select: { id: true },
				}),
			}),
		})

		await (
			await createApplication({ plugins: [plugin()], schemas: [Shared] })
		).dispose()
		const firstField = Shared.virtualFields.slug
		if (firstField === undefined) throw new TypeError('Expected virtual slug')
		const firstResolver = getVirtualFieldResolver(firstField)
		await (
			await createApplication({ plugins: [plugin()], schemas: [Shared] })
		).dispose()
		const secondField = Shared.virtualFields.slug
		if (secondField === undefined) throw new TypeError('Expected virtual slug')

		expect(outputCallbacks).toBe(1)
		expect(Shared.virtualFields.slug?.output.kind).toBe('fixture.virtual-slug')
		expect(getVirtualFieldResolver(secondField)).toBe(firstResolver)
	})

	it('rejects stale plugin output declarations before setup', async () => {
		const Stale = UltimaBase.Schema.define({
			className: 'StalePluginVirtual',
			fields: (field) => ({
				slug: field.virtual({
					output: (output) =>
						(
							output as OutputBuilder & {
								readonly missingOutput: () => ReturnType<
									typeof definePluginOutputDescriptor
								>
							}
						).missingOutput(),
					resolve: ({ item }) => item.id,
					select: { id: true },
				}),
			}),
		})

		await expect(
			createApplication({ plugins: [], schemas: [Stale] }),
		).rejects.toMatchObject({
			code: 'PLUGIN_DECLARATION_INVALID',
			cause: {
				cause: new TypeError(
					'StalePluginVirtual.fields.slug.virtual.output OutputBuilder method "missingOutput" is unavailable; configure the plugin that declares it',
				),
				code: 'SCHEMA_COMPILATION_FAILED',
			},
		})
	})

	it('captures output once and separates logical from persisted metadata', () => {
		let outputCalls = 0
		const resolver = ({ item }: { readonly item: object }) =>
			Promise.resolve('name' in item ? String(item.name) : '')
		const User = UltimaBase.Schema.define({
			className: 'VirtualUser',
			fields: (field) => ({
				name: field.string({ required: true }),
				posts: field.relation({ target: 'VirtualUser' }),
				displayName: field.virtual({
					description: 'Public display name',
					output: (output) => {
						outputCalls += 1
						return output.string({ nullable: false })
					},
					resolve: resolver,
					select: { name: true },
				}),
			}),
		})

		compile(User)

		expect(outputCalls).toBe(1)
		expect(User.fields.displayName?.kind).toBe('virtual')
		expect(User.persistedFields).not.toHaveProperty('displayName')
		expect(User.virtualFields.displayName?.select).toStrictEqual(['id', 'name'])
		expect(User.virtualFields.displayName?.options).toStrictEqual({
			description: 'Public display name',
		})
		const displayName = User.virtualFields.displayName
		if (displayName === undefined) throw new TypeError('Expected displayName')
		expect(getVirtualFieldResolver(displayName)).toBe(resolver)
		expect(JSON.stringify(User.virtualFields.displayName)).not.toContain(
			'resolve',
		)
		expect(
			normalizeQuerySelection(User, { displayName: true }).fields,
		).toStrictEqual([
			{ field: 'displayName', kind: 'selected-field' },
			{ field: 'id', kind: 'selected-field' },
		])
		expect(() =>
			normalizeQueryOrdering(User, [
				{ direction: 'ascending', field: 'displayName' },
			]),
		).toThrow('must reference a schema field')
	})

	it('normalizes exclusion dependencies and rejects non-persisted targets', () => {
		const Exclusion = UltimaBase.Schema.define({
			className: 'VirtualExclusion',
			fields: (field) => ({
				first: field.string(),
				second: field.string(),
				summary: field.virtual({
					output: (output) => output.string(),
					resolve: () => null,
					select: { second: false },
				}),
			}),
		})
		compile(Exclusion)
		expect(Exclusion.virtualFields.summary?.select).toStrictEqual([
			'id',
			'first',
			'createdAt',
			'updatedAt',
		])

		const invalidCases = [
			{
				className: 'VirtualUnknownDependency',
				select: { missing: true },
			},
			{
				className: 'VirtualSelfDependency',
				select: { summary: true },
			},
			{
				className: 'VirtualFalseId',
				select: { id: false },
			},
		] as const

		for (const invalid of invalidCases) {
			expect(() =>
				UltimaBase.Schema.define({
					className: invalid.className,
					fields: (field) => ({
						summary: field.virtual({
							output: (output) => output.string(),
							resolve: () => null,
							select: invalid.select as never,
						}),
					}),
				}),
			).toThrow(SchemaCompilationError)
		}
	})

	it('rejects relation dependencies and malformed resolver declarations', () => {
		expect(
			deepestMessage(() => {
				const Invalid = UltimaBase.Schema.define({
					className: 'VirtualRelationDependency',
					fields: (field) => ({
						children: field.relation({ target: 'VirtualRelationDependency' }),
						summary: field.virtual({
							output: (output) => output.int(),
							resolve: () => 1,
							select: { children: true },
						}),
					}),
				})
				compile(Invalid)
			}),
		).toContain('cannot reference a relation field')

		expect(
			deepestMessage(() =>
				UltimaBase.Schema.define({
					className: 'VirtualMissingResolver',
					fields: (field) => ({
						summary: field.virtual({
							output: (output) => output.string(),
							// @ts-expect-error -- Runtime protects untyped JavaScript callers.
							resolve: 'not-a-function',
							select: { id: true },
						}),
					}),
				}),
			),
		).toContain('virtual.resolve must be a function')
	})
})
