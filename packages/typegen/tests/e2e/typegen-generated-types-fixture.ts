import path from 'node:path'

import {
	definePluginFieldFamily,
	plugin,
	contributeDeclarations,
	definePluginField,
	UltimaBase,
} from '@ultimabase/core'
import { accessPlugin } from '@ultimabase/access-plugin'

import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { generateApplicationTypes } from '@ultimabase/typegen'

import { validationPlugin } from '@ultimabase/validation-plugin'
import {
	pgVectorPlugin,
	type VectorFieldOptions,
	type VectorValue,
} from '@ultimabase/pg-vector-plugin'

import { createLanguageService } from '../../../../tooling/vitest/typescript-language-service.js'

export const selectMarker = '/* packed-generated-select */'
export const publicSelectMarker = '/* packed-public-select */'
export const accessMarker = '/* packed-access-item */'
export const fieldHookMarker = '/* packed-field-hook */'
export const schemaHookMarker = '/* packed-schema-hook */'
export const schemaHookItemMarker = '/* packed-schema-hook-item */'
export const schemaAfterItemMarker = '/* packed-schema-after-item */'
export const pluginHookRegistryMarker = '/* packed-plugin-hook-registry */'
export const pluginHookItemMarker = '/* packed-plugin-hook-item */'
export const pointerMarker = '/* packed-pointer-where */'
export const relationMarker = '/* packed-relation-where */'
export const hoverMarker = '/* packed-generated-hover */'
export const optionsMarker = '/* packed-typegen-options */'
export const pluginOptionsMarker = '/* packed-typegen-plugin-options */'
export const pluginHoverMarker = '/* packed-typegen-plugin-hover */'
export const createOneOptionsMarker = '/* packed-create-one-options */'
export const createManyOptionsMarker = '/* packed-create-many-options */'
export const updateOneOptionsMarker = '/* packed-update-one-options */'
export const updateManyOptionsMarker = '/* packed-update-many-options */'
export const updateOneTargetMarker = '/* packed-update-one-target */'
export const deleteOneTargetMarker = '/* packed-delete-one-target */'
export const updateOneHoverMarker = '/* packed-update-one-hover */'
export const containmentMarker = '/* packed-containment-operand */'
export const validationMarker = '/* packed-validation-option */'

export const snapshotPackedVector = (value: unknown): VectorValue => {
	if (!Array.isArray(value)) throw new TypeError('vector must be an array')
	return Object.freeze(
		value.map((item) => {
			if (typeof item !== 'number') {
				throw new TypeError('vector items must be numbers')
			}
			return item
		}),
	)
}
export const containedVectorField = (options: VectorFieldOptions) =>
	definePluginField('fixture.packed.contained-vector', options, {
		snapshotValue: snapshotPackedVector,
		storageCodec: {
			decode: snapshotPackedVector,
			encode: (value) => value,
			format: 'json',
			version: 1,
		},
		structuralContains: {
			snapshotOperand: (value: unknown): VectorFieldOptions => {
				if (
					typeof value !== 'object' ||
					value === null ||
					!('dimensions' in value) ||
					typeof value.dimensions !== 'number'
				) {
					throw new TypeError('operand must contain dimensions')
				}
				return { dimensions: value.dimensions }
			},
		},
	})
export const containedVectorMethod = definePluginFieldFamily({
	fieldKind: 'fixture.packed.contained-vector',
	typegen: {
		module: '@ultimabase/pg-vector-plugin',
		structuralContainsType: 'VectorFieldOptions',
		valueType: 'VectorValue',
	},
	builder: {
		name: 'contained',
		contexts: {
			stored: {
				factory: containedVectorField,
				methodType: 'VectorFieldBuilderMethod',
			},
		},
	},
})
export const containedVectorPlugin = plugin({
	core: '^0.0.0',
	id: 'fixture.packed-contained-vector-plugin',
	permissions: { 'schema:declare': 'Declares packed containment types.' },
	version: '0.0.0',
	contributions: [
		contributeDeclarations({
			schema: ({ fields }) => fields.register(containedVectorMethod),
		}),
	],
})

const PackedApplication = UltimaBase.use(
	accessPlugin(),
	containedVectorPlugin,
	hooksPlugin(),
	pgVectorPlugin(),
	validationPlugin(),
)
export const Owner = PackedApplication.Schema.define({
	className: 'PackedGeneratedOwner',
	fields: (field) => ({
		documents: field.relation({ target: 'PackedGeneratedDocument' }),
		name: field.string({ required: true }),
	}),
})
export const Document = PackedApplication.Schema.define({
	className: 'PackedGeneratedDocument',
	fields: (field) => ({
		contained: containedVectorField({ dimensions: 3 }),
		embedding: field.vector({ dimensions: 3 }),
		owner: field.pointer({
			target: 'PackedGeneratedOwner',
			required: true,
		}),
		related: field.relation({
			target: 'PackedGeneratedDocument',
		}),
		status: field.enum({
			typeName: 'PackedDocumentStatus',
			values: ['draft', 'published'],
		}),
		summary: field.string(),
		title: field.string({ required: true }),
	}),
})
export const application = new PackedApplication({ schemas: [Owner, Document] })
export const generated = generateApplicationTypes({
	ultimabase: application,
	applicationId: 'fixture.packed-typegen',
})
export const sourceWithMarkers = `${generated.contents}
import { generateApplicationTypes as generatePackedApplicationTypes, typegenPlugin as packedTypegenPlugin } from '@ultimabase/typegen'
import { UltimaBase, plugin } from '@ultimabase/core'
import { accessPlugin } from '@ultimabase/access-plugin'
import * as Hooks from '@ultimabase/hooks-plugin'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { pgVectorPlugin } from '@ultimabase/pg-vector-plugin'
import { validationPlugin } from '@ultimabase/validation-plugin'
import type { PluginDefinition, SchemaDefinition } from '@ultimabase/core'
import type { GenerateApplicationTypesOptions, TypegenPluginOptions } from '@ultimabase/typegen'
import { containedVectorPlugin as packedContainedVectorPlugin } from './typegen-generated-types-fixture.js'

declare const packedApplication: UltimaBase<readonly SchemaDefinition[], readonly PluginDefinition[]>
declare const packedOwner: Core.PointerValue
declare const packedTitleValidator: import('@standard-schema/spec').StandardSchemaV1<string>

const PackedSchemaApplication = UltimaBase.use(accessPlugin())
  .use(hooksPlugin())
  .use(packedContainedVectorPlugin)
  .use(pgVectorPlugin())
  .use(validationPlugin())

const PackedGeneratedOwner = PackedSchemaApplication.Schema.define({
  className: 'PackedGeneratedOwner',
  fields: (field) => ({
    documents: field.relation({ target: 'PackedGeneratedDocument' }),
    name: field.string({ required: true }),
  }),
})
const PackedGeneratedDocument = PackedSchemaApplication.Schema.define({
  className: 'PackedGeneratedDocument',
  fields: (field) => ({
    contained: field.contained({ dimensions: 3 }),
    embedding: field.vector({ dimensions: 3 }),
    owner: field.pointer({
      target: 'PackedGeneratedOwner',
      required: true,
    }),
    related: field.relation({ target: 'PackedGeneratedDocument' }),
    status: field.enum({ values: ['draft', 'published'] }),
		summary: field.string({ ${validationMarker} }),
    title: field.string({
      hooks: {
        ${fieldHookMarker}resolveInput: ({ value }) => value?.trim() ?? null,
      },
      required: true,
      validation: packedTitleValidator,
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
const packedHookPlugin = plugin({
  id: 'fixture.packed-generated-hooks',
  version: '0.0.0',
  core: '^0.0.0',
  peers: [{ pluginId: '@ultimabase/hooks-plugin', version: '^0.0.0' }],
  permissions: {
    'runtime:intercept': 'Contributes the packed Hook type fixture.',
  },
  contributions: [Hooks.provideHookContributions('document-update', () =>
      Hooks.${pluginHookRegistryMarker}schemaHooks(
      PackedGeneratedDocument,
      {
        afterOperation: {
          update: ({ item }) => { void ${schemaAfterItemMarker}item.title },
          delete: ({ item }) => { const deleted: null = item; void deleted },
        },
        beforeOperation: {
          update: ({ item }) => {
            item.${pluginHookItemMarker}title
          },
        },
      },
    ))],
})

// @ts-expect-error -- The intentionally incomplete object drives option completion.
const packedCompletionOptions: GenerateApplicationTypesOptions = {
  ${optionsMarker}
  ultimabase: packedApplication,
}
const apiGenerated = generatePackedApplicationTypes({
  ultimabase: packedApplication,
  applicationId: 'packed',
})
const packedPluginOptions: TypegenPluginOptions = {
  ${pluginOptionsMarker}
}
const packedTypegen = ${pluginHoverMarker}packedTypegenPlugin(packedPluginOptions)
const where: ${hoverMarker}PackedGeneratedDocumentWhereInput = {
  contained: {
    // @ts-expect-error -- The incomplete operand drives packed completion.
    contains: { ${containmentMarker} },
  },
	status: { eq: 'draft' },
  title: { contains: 'Generated' },
}
const invalidContainment: PackedGeneratedDocumentWhereInput = {
  contained: {
    // @ts-expect-error -- Packed containment retains the owner operand type.
    contains: [1, 2, 3],
  },
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
  data: { owner: { connect: 'owner-1' }, title: 'Created projection' },
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
  data: { owner: { connect: 'owner-1' }, title: 'Create completion' },
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
void invalidContainment
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
export const selectPosition = sourceWithMarkers.indexOf(selectMarker)
export const publicSelectPosition =
	sourceWithMarkers.indexOf(publicSelectMarker)
export const accessPosition = sourceWithMarkers.indexOf(accessMarker)
export const fieldHookPosition = sourceWithMarkers.indexOf(fieldHookMarker)
export const schemaHookPosition = sourceWithMarkers.indexOf(schemaHookMarker)
export const schemaHookItemPosition =
	sourceWithMarkers.indexOf(schemaHookItemMarker)
export const schemaAfterItemPosition = sourceWithMarkers.indexOf(
	schemaAfterItemMarker,
)
export const pluginHookRegistryPosition = sourceWithMarkers.indexOf(
	pluginHookRegistryMarker,
)
export const pluginHookItemPosition =
	sourceWithMarkers.indexOf(pluginHookItemMarker)
export const pointerPosition = sourceWithMarkers.indexOf(pointerMarker)
export const relationPosition = sourceWithMarkers.indexOf(relationMarker)
export const hoverPosition = sourceWithMarkers.indexOf(hoverMarker)
export const optionsPosition = sourceWithMarkers.indexOf(optionsMarker)
export const pluginOptionsPosition =
	sourceWithMarkers.indexOf(pluginOptionsMarker)
export const pluginHoverPosition = sourceWithMarkers.indexOf(pluginHoverMarker)
export const mutationOptionPositions = [
	createOneOptionsMarker,
	createManyOptionsMarker,
	updateOneOptionsMarker,
	updateManyOptionsMarker,
].map((marker) => sourceWithMarkers.indexOf(marker))
export const mutationTargetPositions = [
	updateOneTargetMarker,
	deleteOneTargetMarker,
].map((marker) => sourceWithMarkers.indexOf(marker))
export const updateOneHoverPosition =
	sourceWithMarkers.indexOf(updateOneHoverMarker)
export const containmentPosition = sourceWithMarkers.indexOf(containmentMarker)
export const validationPosition = sourceWithMarkers.indexOf(validationMarker)
export const source = sourceWithMarkers
	.replace(selectMarker, ' '.repeat(selectMarker.length))
	.replace(publicSelectMarker, ' '.repeat(publicSelectMarker.length))
	.replace(accessMarker, ' '.repeat(accessMarker.length))
	.replace(fieldHookMarker, ' '.repeat(fieldHookMarker.length))
	.replace(schemaHookMarker, ' '.repeat(schemaHookMarker.length))
	.replace(schemaHookItemMarker, ' '.repeat(schemaHookItemMarker.length))
	.replace(schemaAfterItemMarker, ' '.repeat(schemaAfterItemMarker.length))
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
	.replace(containmentMarker, ' '.repeat(containmentMarker.length))
	.replace(validationMarker, ' '.repeat(validationMarker.length))
export const fileName = path.join(
	import.meta.dirname,
	'typegen-generated-types.packed.fixture.ts',
)
export const service = createLanguageService(fileName, source)
