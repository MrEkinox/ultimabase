import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { applicationExample, landingCopy } from '../components/landing/content'
import { resolveDocumentationPage } from '../lib/docs-localization'
import { currentDocumentationVersion } from '../lib/docs-versions'
import { localizeNavigationLabel, localizePath } from '../lib/i18n'

const websiteRoot = fileURLToPath(new URL('..', import.meta.url))
const documentationRoot = path.join(websiteRoot, 'content/docs')
const version = currentDocumentationVersion.slug

const translatedPages = [
	{
		english: `en/${version}/index.mdx`,
		french: `fr/${version}/index.mdx`,
		source: `/docs/${version}`,
	},
	...[
		'first-application',
		'installation',
		'introduction',
		'project-structure',
	].map((slug) => ({
		english: `en/${version}/getting-started/${slug}.mdx`,
		french: `fr/${version}/getting-started/${slug}.mdx`,
		source: `/docs/${version}/getting-started/${slug}`,
	})),
] as const

const readDocumentation = (relativePath: string): Promise<string> =>
	readFile(path.join(documentationRoot, relativePath), 'utf8')

const readFrontmatterValue = (
	source: string,
	key: string,
): string | undefined =>
	new RegExp(`^  ${key}: (?<value>.+)$`, 'mu').exec(source)?.groups?.value

const fencedBlocks = (source: string): readonly string[] =>
	[...source.matchAll(/```(?<block>[\s\S]*?)```/gu)].flatMap((match) =>
		match.groups?.block === undefined ? [] : [match.groups.block.trim()],
	)

describe('French reader journey', () => {
	it('tracks every reviewed English source with an exact content fingerprint', async () => {
		for (const page of translatedPages) {
			const [english, french] = await Promise.all([
				readDocumentation(page.english),
				readDocumentation(page.french),
			])
			const translatableSource = english.replace(/^reviewedAt: .+\n/mu, '')
			const fingerprint = createHash('sha256')
				.update(translatableSource)
				.digest('hex')

			expect(readFrontmatterValue(french, 'source')).toBe(page.source)
			expect(readFrontmatterValue(french, 'sourceHash')).toBe(
				`sha256:${fingerprint}`,
			)
			expect(readFrontmatterValue(french, 'reviewedAt')).toMatch(
				/^\d{4}-\d{2}-\d{2}$/u,
			)
		}
	})

	it('keeps translated tutorial code byte-equivalent to the English source', async () => {
		for (const page of translatedPages) {
			const [english, french] = await Promise.all([
				readDocumentation(page.english),
				readDocumentation(page.french),
			])
			expect(fencedBlocks(french), page.french).toEqual(fencedBlocks(english))
		}
	})

	it('shares one landing example and preserves the same product evidence', () => {
		expect(applicationExample).toContain("from '@ultimabase/core'")
		expect(landingCopy.fr.features.map(({ href }) => href)).toEqual(
			landingCopy.en.features.map(({ href }) => href),
		)
		expect(landingCopy.fr.hero.status).toContain('préversion')
		expect(landingCopy.fr.hero.description).toContain('Runtime')
		expect(landingCopy.fr.hero.description).not.toContain('Direct calls')
	})

	it('localizes navigation while preserving explicit fallback routes', () => {
		expect(localizeNavigationLabel('fr', 'Docs')).toBe('Documentation')
		expect(localizeNavigationLabel('fr', 'Examples')).toBe('Exemples')
		expect(localizePath('fr', '/docs/1.0/getting-started/introduction')).toBe(
			'/fr/docs/1.0/getting-started/introduction',
		)
		expect(
			resolveDocumentationPage('fr', undefined, '/docs/1.0/querying/overview'),
		).toEqual({
			englishPage: '/docs/1.0/querying/overview',
			kind: 'translation-fallback',
		})
	})

	it('keeps the approved bilingual terminology guide available', async () => {
		const glossary = await readFile(
			path.join(websiteRoot, 'docs/editorial-contract.md'),
			'utf8',
		)
		for (const pair of [
			'Runtime',
			'graphe d’application',
			'contexte de requête',
			'autorité Master',
			'génération de types',
			'suppression logique',
		]) {
			expect(glossary).toContain(pair)
		}
	})
})
