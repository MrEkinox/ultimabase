import path from 'node:path'

import { UltimaBase } from '@ultimabase/core'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../../tooling/vitest/typescript-language-service.js'
import { generateApplicationTypes } from './generator.js'

const targetFieldsMarker = '/* relation-where-fields */'
const builderMarker = '/* relation-where-builder */'
const hoverMarker = '/* relation-where-hover */'

const createGeneratedRegistry = (): string => {
	const Target = UltimaBase.Schema.define({
		className: 'SemanticRelationWhereTarget',
		fields: (field) => ({
			related: field.relation({ target: 'SemanticRelationWhereTarget' }),
			status: field.enum({ values: ['draft', 'published'] }),
			title: field.string(),
		}),
	})
	const Source = UltimaBase.Schema.define({
		className: 'SemanticRelationWhereSource',
		fields: (field) => ({
			targets: field.relation({ target: 'SemanticRelationWhereTarget' }),
		}),
	})

	return generateApplicationTypes({
		ultimabase: new UltimaBase({ schemas: [Source, Target] }),
		applicationId: 'fixture.semantic-relation-where',
	}).contents.replaceAll('@ultimabase/core', '../../core/src/index.js')
}

const registry = createGeneratedRegistry()
const sourceWithMarkers = `${registry}
import { UltimaBase } from '../../core/src/index.js'

UltimaBase.Schema.define({
  className: 'SemanticRelationWhereTarget',
  fields: (field) => ({
    related: field.relation({ target: 'SemanticRelationWhereTarget' }),
    status: field.enum({ values: ['draft', 'published'] }),
    title: field.string(),
  }),
})

UltimaBase.Schema.define({
  className: 'SemanticRelationWhereSource',
  fields: (field) => ({
    targets: field.relation({ target: 'SemanticRelationWhereTarget' }),
    contextualTargets: field.relation({ target: 'SemanticRelationWhereTarget' }),
    invalidTargets: field.relation({ target: 'SemanticRelationWhereTarget' }),
    invalidAsyncTargets: field.relation({ target: 'SemanticRelationWhereTarget' }),
  }),
}).with({
  relations: {
    targets: { ${hoverMarker}where: { ${targetFieldsMarker} } },
    contextualTargets: {
      where: ({ context, where }) => {
        const requestId: string = context.requestId
        void requestId
        return where.${builderMarker}eq('status', 'draft').some('related', {
          title: { startsWith: 'Ultima' },
        })
      },
    },
    invalidTargets: {
      where: {
        // @ts-expect-error -- Generated declarations reject unknown target fields.
        missing: { eq: true },
      },
    },
    invalidAsyncTargets: {
      // @ts-expect-error -- Contextual relation filters are synchronous.
      where: async () => {
        await Promise.resolve()
        return { status: { eq: 'draft' } }
      },
    },
  },
})
`
const markerPositions = new Map(
	[targetFieldsMarker, builderMarker, hoverMarker].map((marker) => [
		marker,
		sourceWithMarkers.indexOf(marker),
	]),
)
const source = sourceWithMarkers.replace(
	/\/\* relation-where-(?:fields|builder|hover) \*\//gu,
	(marker) => ' '.repeat(marker.length),
)
const fileName = path.join(
	import.meta.dirname,
	'relation-where.semantic.fixture.ts',
)
const service = createLanguageService(fileName, source)

const readCompletions = (marker: string): readonly string[] => {
	const position = markerPositions.get(marker)
	if (position === undefined || position < 0) {
		throw new TypeError(`Missing relation where marker: ${marker}`)
	}

	return (
		service.getCompletionsAtPosition(fileName, position, {
			includeCompletionsWithInsertText: true,
		})?.entries ?? []
	).map(({ name }) => name)
}

describe('generated relation where declarations', () => {
	it('types target fields, nested predicates, context, and immutable builders', () => {
		expect(service.getSemanticDiagnostics(fileName)).toStrictEqual([])
		expect(readCompletions(targetFieldsMarker)).toEqual(
			expect.arrayContaining([
				'AND',
				'NOT',
				'OR',
				'related',
				'status',
				'title',
			]),
		)
		expect(readCompletions(builderMarker)).toEqual(
			expect.arrayContaining(['eq', 'some']),
		)
	})

	it('documents relation shaping at the generated authoring site', () => {
		const position = markerPositions.get(hoverMarker)
		if (position === undefined || position < 0) {
			throw new TypeError('Missing relation where hover marker')
		}
		const hover = service.getQuickInfoAtPosition(
			fileName,
			position + hoverMarker.length,
		)

		expect(ts.displayPartsToString(hover?.documentation)).toContain(
			'Narrows every read through this relation',
		)
	})
})
