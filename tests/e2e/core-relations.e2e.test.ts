import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { createPackedCoreLanguageFixture } from './packed-core-language-service.js'

const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const sourceFixtureFile = path.join(
	repositoryRoot,
	'packages/core/tests/schema/relation.prototype.ts',
)
const languageFixture = await createPackedCoreLanguageFixture(
	sourceFixtureFile,
	'core-relations.packed.fixture.ts',
)

describe('packed @ultimabase/core relation contracts', () => {
	it('type-checks the complete public relation prototype', () => {
		expect(languageFixture.diagnostics()).toStrictEqual([])
	})

	it('keeps Relation and target Query hovers exact and adapter-neutral', () => {
		const handle = languageFixture.readHover('relation-handle').display
		const query = languageFixture.readHover('relation-query').display

		expect(handle).toContain('Relation<')
		expect(handle).toContain('"PackedRelationArticle"')
		expect(handle).toContain('"PackedRelationTag"')
		expect(query).toContain('Query<')
		expect(query).toContain('"PackedRelationTag"')
		for (const display of [handle, query]) {
			expect(display).not.toContain('RelationFieldOptions')
			expect(display).not.toMatch(/Drizzle|Postgres|DatabaseRelation/u)
			expect(display).not.toContain('any')
		}
	})

	it('documents concise mutation and predicate methods through the package', () => {
		const connect = languageFixture.readHover('relation-connect')
		const predicate = languageFixture.readHover('relation-predicate')

		expect(connect.display).toContain('connect(targets:')
		expect(connect.display).toContain('Promise<void>')
		expect(connect.documentation).toContain('single transaction')
		expect(connect.hasExample).toBe(true)
		expect(predicate.display).toContain('some<"tags">')
		expect(predicate.display).toContain('RelationPredicate<')
		expect(predicate.documentation).toContain('related object')
		expect(predicate.hasExample).toBe(true)
		for (const display of [connect.display, predicate.display]) {
			expect(display.length).toBeLessThan(1_600)
			expect(display).not.toMatch(/Drizzle|Postgres|DatabaseRelation/u)
		}
	})
})
