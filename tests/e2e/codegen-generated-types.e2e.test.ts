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

const Owner = Schema.define({
	className: 'PackedGeneratedOwner',
	fields(field) {
		field.string('name', { validation: { required: true } })
		field.relation('documents', { target: () => Document })
	},
})
const Document = Schema.define({
	className: 'PackedGeneratedDocument',
	fields(field) {
		const generatedField = field as PackedFieldBuilder

		field.string('title', { validation: { required: true } })
		field.enum('status', {
			typeName: 'PackedDocumentStatus',
			values: ['draft', 'published'],
		})
		field.pointer('owner', {
			target: () => Owner,
			validation: { required: true },
		})
		field.relation('related', { target: () => Document })
		generatedField.vector('embedding', { dimensions: 3 })
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
declare const packedOwner: PointerValue

const PackedGeneratedOwner = Schema.define({
  className: 'PackedGeneratedOwner',
  fields(field) {
    field.string('name', { validation: { required: true } })
    field.relation('documents', { target: () => PackedGeneratedDocument })
  },
})
const PackedGeneratedDocument = Schema.define({
  className: 'PackedGeneratedDocument',
  fields(field) {
    field.string('title', { validation: { required: true } })
    field.enum('status', { values: ['draft', 'published'] })
    field.pointer('owner', {
      target: () => PackedGeneratedOwner,
      validation: { required: true },
    })
    field.relation('related', { target: () => PackedGeneratedDocument })
    field.vector('embedding', { dimensions: 3 })
  },
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
const where: ${hoverMarker}PackedGeneratedDocumentWhere = {
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
declare const packedItem: PackedGeneratedDocumentHooks['item']
const ownerRead = packedItem.owner.findOne({
  where: { ${pointerMarker}name: { startsWith: 'A' } },
})
type PackedLoadedDocument = NonNullable<Awaited<ReturnType<typeof PackedGeneratedDocument.findOne>>>
declare const packedLoadedDocument: PackedLoadedDocument
const relatedRead = packedLoadedDocument.relation('related').findMany({
  where: { ${relationMarker}status: { eq: 'published' } },
})

// @ts-expect-error -- The packed generator retains exact enum literals.
const invalidStatus: PackedDocumentStatusEnum = 'archived'

void create
void apiGenerated
void packedCompletionOptions
void invalidStatus
void ownerRead
void publicRead
void relatedRead
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
const source = sourceWithMarkers
	.replace(selectMarker, ' '.repeat(selectMarker.length))
	.replace(publicSelectMarker, ' '.repeat(publicSelectMarker.length))
	.replace(accessMarker, ' '.repeat(accessMarker.length))
	.replace(pointerMarker, ' '.repeat(pointerMarker.length))
	.replace(relationMarker, ' '.repeat(relationMarker.length))
	.replace(hoverMarker, ' '.repeat(hoverMarker.length))
	.replace(optionsMarker, ' '.repeat(optionsMarker.length))
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

		const hover = service.getQuickInfoAtPosition(
			fileName,
			hoverPosition + hoverMarker.length,
		)
		const display = ts.displayPartsToString(hover?.displayParts)

		expect(display).toContain('PackedGeneratedDocumentWhere')
		expect(display.length).toBeLessThan(500)

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
