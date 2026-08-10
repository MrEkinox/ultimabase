import path from 'node:path'

import {
	FrameworkApplication,
	Schema,
	type FieldBuilder,
} from '@ultimabase/core'
import { generateApplicationTypes } from '@ultimabase/codegen'
import {
	pgVectorPlugin,
	type VectorFieldBuilderMethod,
} from '@ultimabase/pg-vector-plugin'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../tooling/vitest/typescript-language-service.js'

type PackedFieldBuilder = FieldBuilder & {
	readonly vector: VectorFieldBuilderMethod
}

const selectMarker = '/* packed-generated-select */'
const publicSelectMarker = '/* packed-public-select */'
const accessMarker = '/* packed-access-item */'
const pointerMarker = '/* packed-pointer-where */'
const relationMarker = '/* packed-relation-where */'
const hoverMarker = '/* packed-generated-hover */'
const optionsMarker = '/* packed-codegen-options */'
const createOneOptionsMarker = '/* packed-create-one-options */'
const createManyOptionsMarker = '/* packed-create-many-options */'
const updateOneOptionsMarker = '/* packed-update-one-options */'
const updateManyOptionsMarker = '/* packed-update-many-options */'

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
	applicationId: 'fixture.packed-codegen',
})
const sourceWithMarkers = `${generated.contents}
import { generateApplicationTypes as generatePackedApplicationTypes } from '@ultimabase/codegen'
import { Schema } from '@ultimabase/core'
import type { FrameworkApplication, PluginDefinition, SchemaDefinition } from '@ultimabase/core'
import type { GenerateApplicationTypesOptions } from '@ultimabase/codegen'

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
    title: field.string({ validation: { required: true } }),
  }),
  access: {
    update: {
      item: ({ item }) => {
        item.${accessMarker}embedding
        return item.status === 'published'
      },
    },
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
declare const packedItem: PackedGeneratedDocumentHooks['item']
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
const projectedUpdate = PackedGeneratedDocument.updateOne({
  where: { id: { eq: 'document-1' } },
  data: { title: 'Updated projection' },
  select: { title: true },
  include: { owner: { select: { name: true } } },
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
  where: { id: { eq: 'document-1' } },
  data: { title: 'Update completion' },
  ${updateOneOptionsMarker}
})
PackedGeneratedDocument.updateMany({
  data: [{
    where: { id: { eq: 'document-1' } },
    data: { title: 'Update collection completion' },
  }],
  ${updateManyOptionsMarker}
})

// @ts-expect-error -- The packed generator retains exact enum literals.
const invalidStatus: PackedDocumentStatus = 'archived'

void create
void apiGenerated
void packedCompletionOptions
void invalidStatus
void invalidIdentifierSelection
void ownerRead
void publicRead
void relatedRead
void projectedCreate
void projectedCreates
void projectedUpdate
void projectedUpdates
void select
void where
`
const selectPosition = sourceWithMarkers.indexOf(selectMarker)
const publicSelectPosition = sourceWithMarkers.indexOf(publicSelectMarker)
const accessPosition = sourceWithMarkers.indexOf(accessMarker)
const pointerPosition = sourceWithMarkers.indexOf(pointerMarker)
const relationPosition = sourceWithMarkers.indexOf(relationMarker)
const hoverPosition = sourceWithMarkers.indexOf(hoverMarker)
const optionsPosition = sourceWithMarkers.indexOf(optionsMarker)
const mutationOptionPositions = [
	createOneOptionsMarker,
	createManyOptionsMarker,
	updateOneOptionsMarker,
	updateManyOptionsMarker,
].map((marker) => sourceWithMarkers.indexOf(marker))
const source = sourceWithMarkers
	.replace(selectMarker, ' '.repeat(selectMarker.length))
	.replace(publicSelectMarker, ' '.repeat(publicSelectMarker.length))
	.replace(accessMarker, ' '.repeat(accessMarker.length))
	.replace(pointerMarker, ' '.repeat(pointerMarker.length))
	.replace(relationMarker, ' '.repeat(relationMarker.length))
	.replace(hoverMarker, ' '.repeat(hoverMarker.length))
	.replace(optionsMarker, ' '.repeat(optionsMarker.length))
	.replace(createOneOptionsMarker, ' '.repeat(createOneOptionsMarker.length))
	.replace(createManyOptionsMarker, ' '.repeat(createManyOptionsMarker.length))
	.replace(updateOneOptionsMarker, ' '.repeat(updateOneOptionsMarker.length))
	.replace(updateManyOptionsMarker, ' '.repeat(updateManyOptionsMarker.length))
const fileName = path.join(
	import.meta.dirname,
	'codegen-generated-types.packed.fixture.ts',
)
const service = createLanguageService(fileName, source)

describe('packed @ultimabase/codegen generated contracts', () => {
	it('emits a stable registry that typechecks through package exports', () => {
		expect(generated.fingerprint).toMatch(/^[a-f0-9]{64}$/u)
		expect(generated.contents).not.toMatch(/\bany\b/u)
		expect(service.getSemanticDiagnostics(fileName)).toStrictEqual([])
	})

	it('preserves exact field completions and concise named hovers', () => {
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

		const hover = service.getQuickInfoAtPosition(
			fileName,
			hoverPosition + hoverMarker.length,
		)
		const display = ts.displayPartsToString(hover?.displayParts)

		expect(display).toContain('PackedGeneratedDocumentWhereInput')
		// The readable recursive declaration remains compact when consumed from
		// the packed package, without relying on source-only alias behavior.
		expect(display.length).toBeLessThan(1_000)

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
	})
})
