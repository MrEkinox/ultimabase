import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
	FrameworkApplication,
	Schema,
	type FieldBuilder,
} from '@ultimabase/core'
import { generateApplicationTypes, typegenPlugin } from '@ultimabase/typegen'
import * as Typegen from '@ultimabase/typegen'
import {
	pgVectorPlugin,
	type VectorFieldBuilderMethod,
} from '@ultimabase/pg-vector-plugin'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { Todo, TodoUser } from '../../examples/todo-backend/src/schema.js'
import { createLanguageService } from '../../tooling/vitest/typescript-language-service.js'

type PackedFieldBuilder = FieldBuilder & {
	readonly vector: VectorFieldBuilderMethod
}

const selectMarker = '/* packed-generated-select */'
const publicSelectMarker = '/* packed-public-select */'
const accessMarker = '/* packed-access-item */'
const fieldHookMarker = '/* packed-field-hook */'
const schemaHookMarker = '/* packed-schema-hook */'
const schemaHookItemMarker = '/* packed-schema-hook-item */'
const pluginHookRegistryMarker = '/* packed-plugin-hook-registry */'
const pluginHookItemMarker = '/* packed-plugin-hook-item */'
const pointerMarker = '/* packed-pointer-where */'
const relationMarker = '/* packed-relation-where */'
const hoverMarker = '/* packed-generated-hover */'
const optionsMarker = '/* packed-typegen-options */'
const pluginOptionsMarker = '/* packed-typegen-plugin-options */'
const pluginHoverMarker = '/* packed-typegen-plugin-hover */'
const createOneOptionsMarker = '/* packed-create-one-options */'
const createManyOptionsMarker = '/* packed-create-many-options */'
const updateOneOptionsMarker = '/* packed-update-one-options */'
const updateManyOptionsMarker = '/* packed-update-many-options */'
const updateOneTargetMarker = '/* packed-update-one-target */'
const deleteOneTargetMarker = '/* packed-delete-one-target */'
const updateOneHoverMarker = '/* packed-update-one-hover */'

const Owner = Schema.define({
	className: 'PackedGeneratedOwner',
	fields: (field) => ({
		documents: field.relation({ target: 'PackedGeneratedDocument' }),
		name: field.string({ validation: { required: true } }),
	}),
})
const Document = Schema.define({
	className: 'PackedGeneratedDocument',
	fields: (field) => {
		const generatedField = field as PackedFieldBuilder
		return {
			embedding: generatedField.vector({ dimensions: 3 }),
			owner: field.pointer({
				target: 'PackedGeneratedOwner',
				validation: { required: true },
			}),
			related: field.relation({
				target: 'PackedGeneratedDocument',
			}),
			status: field.enum({
				typeName: 'PackedDocumentStatus',
				values: ['draft', 'published'],
			}),
			title: field.string({ validation: { required: true } }),
		}
	},
})
const application = new FrameworkApplication({
	plugins: [pgVectorPlugin()],
	schemas: [Owner, Document],
})
const generated = generateApplicationTypes({
	application,
	applicationId: 'fixture.packed-typegen',
})
const sourceWithMarkers = `${generated.contents}
import { generateApplicationTypes as generatePackedApplicationTypes, typegenPlugin as packedTypegenPlugin } from '@ultimabase/typegen'
import { Schema, definePlugin } from '@ultimabase/core'
import type { FrameworkApplication, PluginDefinition, SchemaDefinition } from '@ultimabase/core'
import type { GenerateApplicationTypesOptions, TypegenPluginOptions } from '@ultimabase/typegen'

declare const packedApplication: FrameworkApplication<readonly SchemaDefinition[], readonly PluginDefinition[]>
declare const packedOwner: Core.PointerValue

const PackedGeneratedOwner = Schema.define({
  className: 'PackedGeneratedOwner',
  fields: (field) => ({
    documents: field.relation({ target: 'PackedGeneratedDocument' }),
    name: field.string({ validation: { required: true } }),
  }),
})
const PackedGeneratedDocument = Schema.define({
  className: 'PackedGeneratedDocument',
  fields: (field) => ({
    embedding: field.vector({ dimensions: 3 }),
    owner: field.pointer({
      target: 'PackedGeneratedOwner',
      validation: { required: true },
    }),
    related: field.relation({ target: 'PackedGeneratedDocument' }),
    status: field.enum({ values: ['draft', 'published'] }),
    title: field.string({
      hooks: {
        ${fieldHookMarker}resolveInput: ({ value }) => value.trim(),
      },
      validation: { required: true },
    }),
  }),
  access: {
    update: {
      item: ({ item }) => {
        item.${accessMarker}embedding
        return item.status === 'published'
      },
    },
  },
  hooks: {
    ${schemaHookMarker}beforeOperation: {
      update: ({ item, originalItem }) => {
        item.${schemaHookItemMarker}embedding
        originalItem.status
      },
    },
  },
})
const packedHookPlugin = definePlugin({
  pluginId: 'fixture.packed-generated-hooks',
  version: '0.0.0',
  core: '^0.0.0',
  setup: ({ hooks }) => {
    hooks.${pluginHookRegistryMarker}schema(
      'document-update',
      PackedGeneratedDocument,
      {
        beforeOperation: {
          update: ({ item }) => {
            item.${pluginHookItemMarker}title
          },
        },
      },
    )
  },
})

// @ts-expect-error -- The intentionally incomplete object drives option completion.
const packedCompletionOptions: GenerateApplicationTypesOptions = {
  ${optionsMarker}
  application: packedApplication,
}
const apiGenerated = generatePackedApplicationTypes({
  application: packedApplication,
  applicationId: 'packed',
})
const packedPluginOptions: TypegenPluginOptions = {
  ${pluginOptionsMarker}
}
const packedTypegen = ${pluginHoverMarker}packedTypegenPlugin(packedPluginOptions)
const where: ${hoverMarker}PackedGeneratedDocumentWhereInput = {
  status: { eq: 'draft' },
  title: { contains: 'Generated' },
}
const select: PackedGeneratedDocumentSelect = { ${selectMarker} }
const create: PackedGeneratedDocumentCreateInput = {
  owner: packedOwner,
  title: 'Packed',
}
const publicRead = PackedGeneratedDocument.findMany({
  where: { status: { eq: 'draft' } },
  select: { ${publicSelectMarker}title: true },
})
publicRead.then((documents) => {
  const document = documents[0]
  if (document === undefined) return
  const id: string = document.id
  const title: string = document.title
  void id
  void title
})
const invalidIdentifierSelection: PackedGeneratedDocumentSelect = {
  // @ts-expect-error -- Stable model identifiers cannot be omitted.
  id: false,
}
declare const packedItem: PackedGeneratedDocumentItem
const ownerRead = packedItem.owner.findOne({
  where: { ${pointerMarker}name: { startsWith: 'A' } },
})
type PackedLoadedDocument = NonNullable<Awaited<ReturnType<typeof PackedGeneratedDocument.findOne>>>
declare const packedLoadedDocument: PackedLoadedDocument
const relatedRead = packedLoadedDocument.relation('related').findMany({
  where: { ${relationMarker}status: { eq: 'published' } },
})
const projectedCreate = PackedGeneratedDocument.createOne({
  data: { owner: packedOwner, title: 'Created projection' },
  select: { title: true },
  include: { owner: { select: { name: true } } },
})
const projectedCreates = PackedGeneratedDocument.createMany({
  data: [{ owner: packedOwner, title: 'Created collection projection' }],
  select: { title: true },
  include: { owner: { select: { name: true } } },
})
const projectedUpdate = PackedGeneratedDocument.${updateOneHoverMarker}updateOne({
  id: 'document-1',
  data: { title: 'Updated projection' },
  select: { title: true },
  include: { owner: { select: { name: true } } },
})
const projectedDelete = PackedGeneratedDocument.deleteOne({
  id: 'document-1',
  select: { title: true },
})
const projectedUpdates = PackedGeneratedDocument.updateMany({
  data: [{
    where: { id: { eq: 'document-1' } },
    data: { title: 'Updated collection projection' },
  }],
  include: { owner: { select: { name: true } } },
})
projectedCreate.then((document) => {
  if (document.owner === null) return
	const id: string = document.id
  const title: string = document.title
	const ownerId: string = document.owner.id
  const ownerName: string = document.owner.name
  // @ts-expect-error -- Packed mutation projections exclude unselected scalars.
  document.status
	void id
  void ownerName
	void ownerId
  void title
})
projectedCreates.then((documents) => {
  const document = documents[0]
  if (document === undefined || document.owner === null) return
	const id: string = document.id
  const title: string = document.title
	const ownerId: string = document.owner.id
  const ownerName: string = document.owner.name
	void id
  void ownerName
	void ownerId
  void title
})
projectedUpdate.then((document) => {
  if (document === null || document.owner === null) return
	const id: string = document.id
	const ownerId: string = document.owner.id
  const ownerName: string = document.owner.name
	void id
	void ownerId
  void ownerName
})
projectedUpdates.then((documents) => {
  const document = documents[0]
  if (document === undefined || document.owner === null) return
  const id: string = document.id
	const ownerId: string = document.owner.id
  const ownerName: string = document.owner.name
  // @ts-expect-error -- Packed updateMany keeps its default scalar id projection.
  document.title
  void id
	void ownerId
  void ownerName
})
PackedGeneratedDocument.createOne({
  data: { owner: packedOwner, title: 'Create completion' },
  ${createOneOptionsMarker}
})
PackedGeneratedDocument.createMany({
  data: [{ owner: packedOwner, title: 'Create collection completion' }],
  ${createManyOptionsMarker}
})
PackedGeneratedDocument.updateOne({
  id: 'document-1',
  data: { title: 'Update completion' },
  ${updateOneOptionsMarker}
})
// @ts-expect-error -- The incomplete target drives both singular target completions.
PackedGeneratedDocument.updateOne({
  ${updateOneTargetMarker}
  data: { title: 'Target completion' },
})
// @ts-expect-error -- The incomplete target drives both singular target completions.
PackedGeneratedDocument.deleteOne({ ${deleteOneTargetMarker} })
PackedGeneratedDocument.updateMany({
  data: [{
    where: { id: { eq: 'document-1' } },
    data: { title: 'Update collection completion' },
  }],
  ${updateManyOptionsMarker}
})

// @ts-expect-error -- Packed singular targets remain mutually exclusive.
PackedGeneratedDocument.updateOne({
  id: 'document-1',
  where: { id: { eq: 'document-1' } },
  data: { title: 'Invalid target' },
})
// @ts-expect-error -- Packed singular targets remain mutually exclusive.
PackedGeneratedDocument.deleteOne({
  id: 'document-1',
  where: { id: { eq: 'document-1' } },
})

// @ts-expect-error -- The packed generator retains exact enum literals.
const invalidStatus: PackedDocumentStatus = 'archived'

void create
void apiGenerated
void packedCompletionOptions
void packedTypegen
void invalidStatus
void invalidIdentifierSelection
void ownerRead
void packedHookPlugin
void publicRead
void relatedRead
void projectedCreate
void projectedCreates
void projectedUpdate
void projectedUpdates
void projectedDelete
void select
void where
`
const selectPosition = sourceWithMarkers.indexOf(selectMarker)
const publicSelectPosition = sourceWithMarkers.indexOf(publicSelectMarker)
const accessPosition = sourceWithMarkers.indexOf(accessMarker)
const fieldHookPosition = sourceWithMarkers.indexOf(fieldHookMarker)
const schemaHookPosition = sourceWithMarkers.indexOf(schemaHookMarker)
const schemaHookItemPosition = sourceWithMarkers.indexOf(schemaHookItemMarker)
const pluginHookRegistryPosition = sourceWithMarkers.indexOf(
	pluginHookRegistryMarker,
)
const pluginHookItemPosition = sourceWithMarkers.indexOf(pluginHookItemMarker)
const pointerPosition = sourceWithMarkers.indexOf(pointerMarker)
const relationPosition = sourceWithMarkers.indexOf(relationMarker)
const hoverPosition = sourceWithMarkers.indexOf(hoverMarker)
const optionsPosition = sourceWithMarkers.indexOf(optionsMarker)
const pluginOptionsPosition = sourceWithMarkers.indexOf(pluginOptionsMarker)
const pluginHoverPosition = sourceWithMarkers.indexOf(pluginHoverMarker)
const mutationOptionPositions = [
	createOneOptionsMarker,
	createManyOptionsMarker,
	updateOneOptionsMarker,
	updateManyOptionsMarker,
].map((marker) => sourceWithMarkers.indexOf(marker))
const mutationTargetPositions = [
	updateOneTargetMarker,
	deleteOneTargetMarker,
].map((marker) => sourceWithMarkers.indexOf(marker))
const updateOneHoverPosition = sourceWithMarkers.indexOf(updateOneHoverMarker)
const source = sourceWithMarkers
	.replace(selectMarker, ' '.repeat(selectMarker.length))
	.replace(publicSelectMarker, ' '.repeat(publicSelectMarker.length))
	.replace(accessMarker, ' '.repeat(accessMarker.length))
	.replace(fieldHookMarker, ' '.repeat(fieldHookMarker.length))
	.replace(schemaHookMarker, ' '.repeat(schemaHookMarker.length))
	.replace(schemaHookItemMarker, ' '.repeat(schemaHookItemMarker.length))
	.replace(
		pluginHookRegistryMarker,
		' '.repeat(pluginHookRegistryMarker.length),
	)
	.replace(pluginHookItemMarker, ' '.repeat(pluginHookItemMarker.length))
	.replace(pointerMarker, ' '.repeat(pointerMarker.length))
	.replace(relationMarker, ' '.repeat(relationMarker.length))
	.replace(hoverMarker, ' '.repeat(hoverMarker.length))
	.replace(optionsMarker, ' '.repeat(optionsMarker.length))
	.replace(pluginOptionsMarker, ' '.repeat(pluginOptionsMarker.length))
	.replace(pluginHoverMarker, ' '.repeat(pluginHoverMarker.length))
	.replace(createOneOptionsMarker, ' '.repeat(createOneOptionsMarker.length))
	.replace(createManyOptionsMarker, ' '.repeat(createManyOptionsMarker.length))
	.replace(updateOneOptionsMarker, ' '.repeat(updateOneOptionsMarker.length))
	.replace(updateManyOptionsMarker, ' '.repeat(updateManyOptionsMarker.length))
	.replace(updateOneTargetMarker, ' '.repeat(updateOneTargetMarker.length))
	.replace(deleteOneTargetMarker, ' '.repeat(deleteOneTargetMarker.length))
	.replace(updateOneHoverMarker, ' '.repeat(updateOneHoverMarker.length))
const fileName = path.join(
	import.meta.dirname,
	'typegen-generated-types.packed.fixture.ts',
)
const service = createLanguageService(fileName, source)

describe('packed @ultimabase/typegen generated contracts', () => {
	it('exports the Typegen identity and no former plugin alias', () => {
		expect(Typegen.typegenPlugin).toBe(typegenPlugin)
		expect(Typegen).not.toHaveProperty('codegenPlugin')
	})

	it('regenerates the Todo declaration during application startup', async () => {
		const directory = await mkdtemp(
			path.join(os.tmpdir(), 'ultimabase-packed-typegen-'),
		)
		const outputPath = path.join(
			directory,
			'.ultimabase',
			'schema.generated.d.ts',
		)
		const application = new FrameworkApplication({
			plugins: [
				typegenPlugin({
					applicationId: 'todo-backend',
					outputPath,
				}),
			],
			schemas: [TodoUser, Todo],
		})

		try {
			await application.start()

			const generatedTodo = await readFile(outputPath, 'utf8')
			const committedTodo = await readFile(
				new URL(
					'../../examples/todo-backend/.ultimabase/schema.generated.d.ts',
					import.meta.url,
				),
				'utf8',
			)

			expect(generatedTodo).toBe(committedTodo)
			expect(generatedTodo).toContain('Generated by @ultimabase/typegen')
		} finally {
			await application.dispose()
			await rm(directory, { force: true, recursive: true })
		}
	})

	it('emits a stable registry that typechecks through package exports', () => {
		expect(generated.fingerprint).toMatch(/^[a-f0-9]{64}$/u)
		expect(generated.contents).not.toMatch(/\bany\b/u)
		expect(generated.contents).not.toMatch(
			/^export type \w+(?:Access|Hooks) =/mu,
		)
		expect(
			service
				.getSemanticDiagnostics(fileName)
				.map(({ messageText }) =>
					ts.flattenDiagnosticMessageText(messageText, '\n'),
				),
		).toStrictEqual([])
	})

	it('preserves exact field completions and concise named hovers', () => {
		expect(
			service
				.getCompletionsAtPosition(
					fileName,
					fieldHookPosition + fieldHookMarker.length,
					{},
				)
				?.entries.map(({ name }) => name),
		).toContain('resolveInput')
		expect(
			service
				.getCompletionsAtPosition(
					fileName,
					schemaHookPosition + schemaHookMarker.length,
					{},
				)
				?.entries.map(({ name }) => name),
		).toEqual(
			expect.arrayContaining([
				'afterOperation',
				'beforeOperation',
				'resolveInput',
			]),
		)
		expect(
			service
				.getCompletionsAtPosition(fileName, schemaHookItemPosition, {})
				?.entries.map(({ name }) => name),
		).toEqual(expect.arrayContaining(['embedding', 'owner', 'status', 'title']))
		expect(
			service
				.getCompletionsAtPosition(fileName, pluginHookRegistryPosition, {})
				?.entries.map(({ name }) => name)
				.sort(),
		).toStrictEqual([
			'field',
			'fieldExtension',
			'fieldKind',
			'global',
			'schema',
			'schemaExtension',
		])
		expect(
			service
				.getCompletionsAtPosition(fileName, pluginHookItemPosition, {})
				?.entries.map(({ name }) => name),
		).toEqual(expect.arrayContaining(['embedding', 'owner', 'status', 'title']))
		expect(
			service
				.getCompletionsAtPosition(fileName, publicSelectPosition, {})
				?.entries.map(({ name }) => name),
		).toEqual(expect.arrayContaining(['embedding', 'owner', 'status']))
		expect(
			service
				.getCompletionsAtPosition(fileName, accessPosition, {})
				?.entries.map(({ name }) => name),
		).toEqual(expect.arrayContaining(['embedding', 'owner', 'status', 'title']))
		expect(
			service
				.getCompletionsAtPosition(fileName, pointerPosition, {})
				?.entries.map(({ name }) => name),
		).toEqual(expect.arrayContaining(['AND', 'documents']))
		expect(
			service
				.getCompletionsAtPosition(fileName, relationPosition, {})
				?.entries.map(({ name }) => name),
		).toEqual(expect.arrayContaining(['AND', 'owner', 'related']))

		expect(
			service
				.getCompletionsAtPosition(fileName, selectPosition, {})
				?.entries.map(({ name }) => name),
		).toEqual(expect.arrayContaining(['embedding', 'id', 'status', 'title']))
		for (const [index, position] of mutationOptionPositions.entries()) {
			const marker = [
				createOneOptionsMarker,
				createManyOptionsMarker,
				updateOneOptionsMarker,
				updateManyOptionsMarker,
			][index]

			if (marker === undefined) {
				throw new TypeError('Missing packed mutation completion marker')
			}
			expect(
				service
					.getCompletionsAtPosition(fileName, position + marker.length, {})
					?.entries.map(({ name }) => name),
			).toContain('include')
		}
		for (const position of mutationTargetPositions) {
			expect(
				service
					.getCompletionsAtPosition(fileName, position, {})
					?.entries.map(({ name }) => name),
			).toEqual(expect.arrayContaining(['id', 'where']))
		}

		const hover = service.getQuickInfoAtPosition(
			fileName,
			hoverPosition + hoverMarker.length,
		)
		const display = ts.displayPartsToString(hover?.displayParts)

		expect(display).toContain('PackedGeneratedDocumentWhereInput')
		// The readable recursive declaration remains compact when consumed from
		// the packed package, without relying on source-only alias behavior.
		expect(display.length).toBeLessThan(1_000)

		const updateOneHover = service.getQuickInfoAtPosition(
			fileName,
			updateOneHoverPosition + updateOneHoverMarker.length,
		)
		const updateOneDisplay = ts.displayPartsToString(
			updateOneHover?.displayParts,
		)

		expect(updateOneDisplay).toContain(
			'SchemaAPI<Schemas.PackedGeneratedDocument>',
		)
		expect(updateOneDisplay).not.toContain('NonDefaulted')

		const applicationId = service
			.getCompletionsAtPosition(fileName, optionsPosition, {})
			?.entries.find(({ name }) => name === 'applicationId')

		if (applicationId === undefined) {
			throw new TypeError('Missing packed applicationId completion')
		}

		const details = service.getCompletionEntryDetails(
			fileName,
			optionsPosition,
			applicationId.name,
			undefined,
			applicationId.source,
			undefined,
			applicationId.data,
		)

		expect(ts.displayPartsToString(details?.documentation)).toContain(
			'Isolates fingerprints',
		)

		expect(
			service
				.getCompletionsAtPosition(fileName, pluginOptionsPosition, {})
				?.entries.map(({ name }) => name),
		).toEqual(expect.arrayContaining(['applicationId', 'outputPath']))

		const pluginHover = service.getQuickInfoAtPosition(
			fileName,
			pluginHoverPosition + pluginHoverMarker.length,
		)

		expect(ts.displayPartsToString(pluginHover?.displayParts)).toContain(
			'TypegenPlugin',
		)
	})
})
