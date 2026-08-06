import type { SymbolDisplayPart } from 'typescript'
import { describe, expect, it } from 'vitest'

import {
	createLanguageService,
	readMarkedQuickInfo,
} from '../../../../tooling/vitest/typescript-language-service.js'

/** Joins TypeScript display parts exactly as an editor presents them. */
const readDisplay = (parts: readonly SymbolDisplayPart[] | undefined): string =>
	parts?.map(({ text }) => text).join('') ?? ''

describe('QueryBuilder IntelliSense', () => {
	it('documents the canonical where entry point without expanding internals', () => {
		const quickInfo = readMarkedQuickInfo(
			`${import.meta.dirname}/query-where-hover.fixture.ts`,
			`
import { Schema, stringField } from '../../src/index.js'
import { QueryBuilder } from '../../src/query/index.js'

const PostSchema = Schema.define({ className: 'Post', fields: { title: stringField() } })
const identified = new QueryBuilder(PostSchema)./* hover */where({ id: { eq: '0194f292-0dd9-7c2d-a0a3-a2f755a3d90a' } })
`,
		)
		const display = readDisplay(quickInfo.displayParts)
		const documentation = readDisplay(quickInfo.documentation)

		expect(display).toContain('.where(input: Readonly<{')
		expect(display).not.toContain('QueryFilterNode')
		expect(documentation).toContain(
			'schema-correlated object or builder filter',
		)
	})

	it('documents compact contextual terminals and every trusted authority option', () => {
		const marker = '/* completion */'
		const sourceWithMarker = `
import { Schema, UltimaBase, stringField } from '../../src/index.js'

const Post = Schema.define({ className: 'Post', fields: { title: stringField() } })
const ultimabase = new UltimaBase({ schemas: [Post], plugins: [] })
Post.findMany(undefined, { ${marker} })
void ultimabase
`
		const position = sourceWithMarker.indexOf(marker)
		const source = sourceWithMarker.replace(marker, ' '.repeat(marker.length))
		const fileName = `${import.meta.dirname}/query-terminal-options.fixture.ts`
		const service = createLanguageService(fileName, source)
		const completions = service.getCompletionsAtPosition(fileName, position, {})
		const readOptionDetails = (name: string) => {
			const completion = completions?.entries.find(
				(entry) => entry.name === name,
			)

			if (completion === undefined) {
				throw new TypeError(
					`Missing QueryBuilder terminal option completion: ${name}`,
				)
			}

			return service.getCompletionEntryDetails(
				fileName,
				position,
				completion.name,
				undefined,
				completion.source,
				undefined,
				completion.data,
			)
		}
		const owner = readOptionDetails('ultimabase')
		const context = readOptionDetails('context')
		const master = readOptionDetails('useMasterKey')

		expect(readDisplay(owner?.documentation)).toContain(
			'exact started application',
		)
		expect(readDisplay(context?.documentation)).toContain(
			'immutable plugin-derived context',
		)
		expect(readDisplay(master?.documentation)).toContain(
			'trusted backend code only',
		)
		expect(readDisplay(master?.documentation)).toContain('Transport input')
		for (const details of [owner, context, master]) {
			expect(details?.tags?.some(({ name }) => name === 'example')).toBe(true)
		}

		const terminal = readMarkedQuickInfo(
			`${import.meta.dirname}/query-terminal-hover.fixture.ts`,
			`
import { Schema, stringField } from '../../src/index.js'
const Post = Schema.define({ className: 'Post', fields: { title: stringField() } })
Post./* hover */findMany()
`,
		)
		const display = readDisplay(terminal.displayParts)

		expect(display).toContain(
			'findMany(input?: undefined, options?: QueryTerminalOptions)',
		)
		expect(display).not.toContain('SchemaDefinition<')
		expect(display.length).toBeLessThan(950)
	})

	it('keeps QueryBuilder read-only and documents schema mutation commands', () => {
		const marker = '/* completion */'
		const sourceWithMarker = `
import { QueryBuilder, Schema, stringField } from '../../src/index.js'
const Post = Schema.define({ className: 'Post', fields: { title: stringField() } })
new QueryBuilder(Post).${marker}
`
		const position = sourceWithMarker.indexOf(marker)
		const source = sourceWithMarker.replace(marker, ' '.repeat(marker.length))
		const fileName = `${import.meta.dirname}/query-singular-aliases.fixture.ts`
		const service = createLanguageService(fileName, source)
		const completions = service.getCompletionsAtPosition(fileName, position, {})
		const completionNames = new Set(
			completions?.entries.map(({ name }) => name) ?? [],
		)

		expect(completionNames.has('findMany')).toBe(false)
		expect(completionNames.has('findOne')).toBe(false)
		expect(completionNames.has('build')).toBe(true)
		expect(completionNames.has('find')).toBe(false)
		expect(completionNames.has('first')).toBe(false)
		expect(completionNames.has('where')).toBe(true)
		expect(completionNames.has('update')).toBe(false)
		expect(completionNames.has('delete')).toBe(false)
		for (const removedFilterMethod of [
			'byId',
			'equalTo',
			'greaterThan',
			'containedIn',
			'some',
			'and',
			'or',
			'not',
		]) {
			expect(completionNames.has(removedFilterMethod)).toBe(false)
		}

		const schemaSourceWithMarker = sourceWithMarker.replace(
			`new QueryBuilder(Post).${marker}`,
			`Post.${marker}`,
		)
		const schemaPosition = schemaSourceWithMarker.indexOf(marker)
		const schemaSource = schemaSourceWithMarker.replace(
			marker,
			' '.repeat(marker.length),
		)
		const schemaFileName = `${import.meta.dirname}/schema-cardinality-commands.fixture.ts`
		const schemaService = createLanguageService(schemaFileName, schemaSource)
		const schemaCompletions = schemaService.getCompletionsAtPosition(
			schemaFileName,
			schemaPosition,
			{},
		)
		const schemaCompletionNames = new Set(
			schemaCompletions?.entries.map(({ name }) => name) ?? [],
		)

		expect(schemaCompletionNames.has('createOne')).toBe(true)
		expect(schemaCompletionNames.has('createMany')).toBe(true)
		expect(schemaCompletionNames.has('upsertOne')).toBe(true)
		expect(schemaCompletionNames.has('upsertMany')).toBe(true)
		expect(schemaCompletionNames.has('create')).toBe(false)
		expect(schemaCompletionNames.has('upsert')).toBe(false)

		const update = readMarkedQuickInfo(
			`${import.meta.dirname}/query-update-alias-hover.fixture.ts`,
			`
import { Schema, increment, intField } from '../../src/index.js'
const Post = Schema.define({ className: 'Post', fields: { views: intField() } })
Post./* hover */updateOne({ where: (where) => where.eq('id', 'post-1'), data: { views: increment(1) } })
`,
		)
		const deletion = readMarkedQuickInfo(
			`${import.meta.dirname}/query-delete-alias-hover.fixture.ts`,
			`
import { Schema, stringField } from '../../src/index.js'
const Post = Schema.define({ className: 'Post', fields: { title: stringField() } })
Post./* hover */deleteOne({ where: (where) => where.eq('id', 'post-1') })
`,
		)

		expect(readDisplay(update.displayParts)).toContain('.updateOne(input:')
		expect(readDisplay(update.documentation)).toContain(
			'Updates one unique target',
		)
		expect(update.tags?.some(({ name }) => name === 'example')).toBe(true)
		expect(readDisplay(deletion.displayParts)).toContain('.deleteOne(input:')
		expect(readDisplay(deletion.documentation)).toContain(
			'Deletes one uniquely identified row',
		)
		expect(deletion.tags?.some(({ name }) => name === 'example')).toBe(true)
	})

	it('completes every mutation selection with only correlated schema fields', () => {
		const marker = '/* completion */'
		const readMutationSelectionCompletions = (
			body: string,
			fixtureName: string,
		): Set<string> => {
			const sourceWithMarker = `
import { Schema, intField, stringField } from '../../src/index.js'
const Post = Schema.define({ className: 'Post', fields: { title: stringField(), views: intField() } })
${body}
`
			const position = sourceWithMarker.indexOf(marker)
			const source = sourceWithMarker.replace(marker, ' '.repeat(marker.length))
			const fileName = `${import.meta.dirname}/${fixtureName}.fixture.ts`
			const service = createLanguageService(fileName, source)
			const completions = service.getCompletionsAtPosition(
				fileName,
				position,
				{},
			)

			return new Set(completions?.entries.map(({ name }) => name) ?? [])
		}
		const updateCompletions = readMutationSelectionCompletions(
			`Post.updateOne({
  where: { id: { eq: 'post-1' } },
  data: { title: 'Updated' },
  select: { ${marker} },
			})`,
			'update-one-selection-completion',
		)
		const createCompletions = readMutationSelectionCompletions(
			`Post.createOne({
  data: { title: 'Created' },
  select: { ${marker} },
})`,
			'create-one-selection-completion',
		)
		const deleteCompletions = readMutationSelectionCompletions(
			`Post.deleteOne({
  where: { id: { eq: 'post-1' } },
  select: { ${marker} },
})`,
			'delete-one-selection-completion',
		)
		const updateManyCompletions = readMutationSelectionCompletions(
			`Post.updateMany({
  where: { views: { gt: 0 } },
  data: { views: 1 },
  select: { ${marker} },
})`,
			'update-many-selection-completion',
		)
		const deleteManyCompletions = readMutationSelectionCompletions(
			`Post.deleteMany({
  where: { views: { gt: 0 } },
  select: { ${marker} },
})`,
			'delete-many-selection-completion',
		)
		const createManyCompletions = readMutationSelectionCompletions(
			`Post.createMany({
  data: [{ title: 'Created' }],
  select: { ${marker} },
})`,
			'create-many-selection-completion',
		)
		const upsertCompletions = readMutationSelectionCompletions(
			`Post.upsertOne({
  where: { id: { eq: 'post-1' } },
  create: { title: 'Created' },
  update: { views: 1 },
  select: { ${marker} },
})`,
			'upsert-one-selection-completion',
		)
		const upsertManyCompletions = readMutationSelectionCompletions(
			`Post.upsertMany({
  data: [{
    where: { id: { eq: 'post-1' } },
    create: { title: 'Created' },
    update: { views: 1 },
  }],
  select: { ${marker} },
})`,
			'upsert-many-selection-completion',
		)

		for (const completionNames of [
			updateCompletions,
			createCompletions,
			deleteCompletions,
			updateManyCompletions,
			deleteManyCompletions,
			createManyCompletions,
			upsertCompletions,
			upsertManyCompletions,
		]) {
			expect(completionNames.has('id')).toBe(true)
			expect(completionNames.has('title')).toBe(true)
			expect(completionNames.has('views')).toBe(true)
			expect(completionNames.has('missing')).toBe(false)
		}
	})

	it('documents flat selection and completes only correlated schema fields', () => {
		const selection = readMarkedQuickInfo(
			`${import.meta.dirname}/query-selection-hover.fixture.ts`,
			`
import { QueryBuilder, Schema, stringField } from '../../src/index.js'
const Post = Schema.define({ className: 'Post', fields: { title: stringField(), secret: stringField() } })
new QueryBuilder(Post)./* hover */select({ title: true })
`,
		)
		const display = readDisplay(selection.displayParts)
		const documentation = readDisplay(selection.documentation)

		expect(display).toContain('select<')
		expect(display).toContain('title: true')
		expect(documentation).toContain('Replaces the current flat projection')
		expect(documentation).toContain('Any `true` enables inclusion mode')
		expect(
			selection.tags?.filter(({ name }) => name === 'example'),
		).toHaveLength(2)

		const marker = '/* completion */'
		const sourceWithMarker = `
import { QueryBuilder, Schema, stringField } from '../../src/index.js'
const Post = Schema.define({ className: 'Post', fields: { title: stringField(), secret: stringField() } })
new QueryBuilder(Post).select({ ${marker} })
`
		const position = sourceWithMarker.indexOf(marker)
		const source = sourceWithMarker.replace(marker, ' '.repeat(marker.length))
		const fileName = `${import.meta.dirname}/query-selection-completion.fixture.ts`
		const service = createLanguageService(fileName, source)
		const completions = service.getCompletionsAtPosition(fileName, position, {})
		const completionNames = new Set(
			completions?.entries.map(({ name }) => name) ?? [],
		)

		expect(completionNames.has('title')).toBe(true)
		expect(completionNames.has('secret')).toBe(true)
		expect(completionNames.has('id')).toBe(true)
		expect(completionNames.has('missing')).toBe(false)

		const canonicalSourceWithMarker = `
import { Schema, stringField } from '../../src/index.js'
const Post = Schema.define({ className: 'Post', fields: { title: stringField(), secret: stringField() } })
Post.findMany({ select: { ${marker} } })
`
		const canonicalPosition = canonicalSourceWithMarker.indexOf(marker)
		const canonicalSource = canonicalSourceWithMarker.replace(
			marker,
			' '.repeat(marker.length),
		)
		const canonicalFileName = `${import.meta.dirname}/query-canonical-selection-completion.fixture.ts`
		const canonicalService = createLanguageService(
			canonicalFileName,
			canonicalSource,
		)
		const canonicalCompletions = canonicalService.getCompletionsAtPosition(
			canonicalFileName,
			canonicalPosition,
			{},
		)
		const canonicalCompletionNames = new Set(
			canonicalCompletions?.entries.map(({ name }) => name) ?? [],
		)

		expect(canonicalCompletionNames.has('title')).toBe(true)
		expect(canonicalCompletionNames.has('secret')).toBe(true)
		expect(canonicalCompletionNames.has('id')).toBe(true)
		expect(canonicalCompletionNames.has('missing')).toBe(false)

		const continuedSourceWithMarker = `
import { QueryBuilder, Schema, stringField } from '../../src/index.js'
const Post = Schema.define({ className: 'Post', fields: { title: stringField(), secret: stringField() } })
new QueryBuilder(Post).select({ title: true, ${marker} })
`
		const continuedPosition = continuedSourceWithMarker.indexOf(marker)
		const continuedSource = continuedSourceWithMarker.replace(
			marker,
			' '.repeat(marker.length),
		)
		const continuedFileName = `${import.meta.dirname}/query-selection-continued-completion.fixture.ts`
		const continuedService = createLanguageService(
			continuedFileName,
			continuedSource,
		)
		const continuedCompletions = continuedService.getCompletionsAtPosition(
			continuedFileName,
			continuedPosition,
			{},
		)
		const continuedCompletionNames = new Set(
			continuedCompletions?.entries.map(({ name }) => name) ?? [],
		)

		expect(continuedCompletionNames.has('secret')).toBe(true)
		expect(continuedCompletionNames.has('id')).toBe(true)
		expect(continuedCompletionNames.has('missing')).toBe(false)
	})

	it('completes where fields and only field-compatible operators', () => {
		const marker = '/* completion */'
		const readCompletions = (
			body: string,
			fixtureName: string,
		): Set<string> => {
			const sourceWithMarker = `
import { Schema, booleanField, intField } from '../../src/index.js'
const Post = Schema.define({ className: 'Post', fields: { published: booleanField(), views: intField() } })
${body}
`
			const position = sourceWithMarker.indexOf(marker)
			const source = sourceWithMarker.replace(marker, ' '.repeat(marker.length))
			const fileName = `${import.meta.dirname}/${fixtureName}.fixture.ts`
			const service = createLanguageService(fileName, source)
			const completions = service.getCompletionsAtPosition(
				fileName,
				position,
				{},
			)

			return new Set(completions?.entries.map(({ name }) => name) ?? [])
		}

		const fields = readCompletions(
			`Post.findMany({ where: { ${marker} } })`,
			'query-where-field-completion',
		)
		const booleanOperators = readCompletions(
			`Post.findMany({ where: { published: { ${marker} } } })`,
			'query-where-boolean-completion',
		)
		const numericOperators = readCompletions(
			`Post.findMany({ where: { views: { ${marker} } } })`,
			'query-where-number-completion',
		)

		expect(fields.has('published')).toBe(true)
		expect(fields.has('views')).toBe(true)
		expect(fields.has('AND')).toBe(true)
		expect(fields.has('eq')).toBe(false)
		expect(booleanOperators.has('eq')).toBe(true)
		expect(booleanOperators.has('gte')).toBe(false)
		expect(numericOperators.has('eq')).toBe(true)
		expect(numericOperators.has('gte')).toBe(true)
		expect(numericOperators.has('contains')).toBe(false)
	})

	it('completes canonical read clauses, ordering, and pointer inclusion', () => {
		const marker = '/* completion */'
		const readCompletions = (
			body: string,
			fixtureName: string,
		): Set<string> => {
			const sourceWithMarker = `
import { Schema, pointerField, stringField } from '../../src/index.js'
const Author = Schema.define({ className: 'Author', fields: { name: stringField() } })
const Post = Schema.define({
  className: 'Post',
  fields: {
    author: pointerField({ target: () => Author }),
    title: stringField(),
  },
})
${body}
`
			const position = sourceWithMarker.indexOf(marker)
			const source = sourceWithMarker.replace(marker, ' '.repeat(marker.length))
			const fileName = `${import.meta.dirname}/${fixtureName}.fixture.ts`
			const service = createLanguageService(fileName, source)
			const completions = service.getCompletionsAtPosition(
				fileName,
				position,
				{},
			)

			return new Set(completions?.entries.map(({ name }) => name) ?? [])
		}

		const clauses = readCompletions(
			`Post.findMany({ ${marker} })`,
			'query-canonical-clause-completion',
		)
		const includeFields = readCompletions(
			`Post.findMany({ include: { ${marker} } })`,
			'query-canonical-include-field-completion',
		)
		const targetClauses = readCompletions(
			`Post.findMany({ include: { author: { ${marker} } } })`,
			'query-canonical-include-target-completion',
		)
		const orderingFields = readCompletions(
			`Post.findMany({ orderBy: [{ ${marker} }] })`,
			'query-canonical-ordering-completion',
		)

		for (const clause of [
			'cursor',
			'include',
			'limit',
			'orderBy',
			'select',
			'skip',
			'where',
		]) {
			expect(clauses.has(clause)).toBe(true)
		}
		expect(clauses.has('data')).toBe(false)
		expect(includeFields.has('author')).toBe(true)
		expect(includeFields.has('title')).toBe(false)
		expect(targetClauses.has('include')).toBe(true)
		expect(targetClauses.has('select')).toBe(true)
		expect(targetClauses.has('where')).toBe(true)
		expect(targetClauses.has('orderBy')).toBe(false)
		expect(orderingFields.has('author')).toBe(true)
		expect(orderingFields.has('title')).toBe(true)
		expect(orderingFields.has('id')).toBe(true)
	})

	it('documents explicit non-atomic bulk behavior at the option boundary', () => {
		const marker = '/* completion */'
		const sourceWithMarker = `
import { Schema, stringField } from '../../src/index.js'
const Post = Schema.define({ className: 'Post', fields: { title: stringField() } })
Post.createMany({ data: [{ title: 'First' }] }, { ${marker} })
`
		const position = sourceWithMarker.indexOf(marker)
		const source = sourceWithMarker.replace(marker, ' '.repeat(marker.length))
		const fileName = `${import.meta.dirname}/query-bulk-options.fixture.ts`
		const service = createLanguageService(fileName, source)
		const completions = service.getCompletionsAtPosition(fileName, position, {})
		const atomic = completions?.entries.find(({ name }) => name === 'atomic')

		if (atomic === undefined) {
			throw new TypeError('Missing QueryBuilder bulk atomic completion')
		}

		const details = service.getCompletionEntryDetails(
			fileName,
			position,
			atomic.name,
			undefined,
			atomic.source,
			undefined,
			atomic.data,
		)
		const documentation = readDisplay(details?.documentation)

		expect(documentation).toContain('all-or-nothing')

		const terminal = readMarkedQuickInfo(
			`${import.meta.dirname}/query-create-many-hover.fixture.ts`,
			`
import { Schema, stringField } from '../../src/index.js'
const Post = Schema.define({ className: 'Post', fields: { title: stringField() } })
Post./* hover */createMany({ data: [{ title: 'First' }] }, { atomic: false })
`,
		)
		const terminalDisplay = readDisplay(terminal.displayParts)

		expect(terminalDisplay).toContain('NonAtomicBulkResult<')
		expect(terminalDisplay).not.toContain('SchemaDefinition<')
		expect(terminalDisplay.length).toBeLessThan(1_200)
		expect(readDisplay(terminal.documentation)).toContain(
			'discriminated result',
		)
		expect(terminal.tags?.some(({ name }) => name === 'example')).toBe(true)
	})

	it('documents pointer inclusion and keeps target-field autocomplete exact', () => {
		const inclusion = readMarkedQuickInfo(
			`${import.meta.dirname}/query-pointer-include-hover.fixture.ts`,
			`
import { QueryBuilder, Schema, pointerField, stringField } from '../../src/index.js'
const User = Schema.define({ className: 'User', fields: { name: stringField(), email: stringField() } })
const Post = Schema.define({ className: 'Post', fields: { author: pointerField({ target: () => User }), title: stringField() } })
new QueryBuilder(Post)./* hover */include('author', (query) => query.select({ name: true }))
`,
		)
		const display = readDisplay(inclusion.displayParts)

		expect(display).toContain('include<')
		expect(display).toContain('"author"')
		expect(display).not.toContain('authorId')
		expect(readDisplay(inclusion.documentation)).toContain(
			'Loads one pointer through an exact',
		)
		expect(inclusion.tags?.some(({ name }) => name === 'example')).toBe(true)

		const marker = '/* completion */'
		const sourceWithMarker = `
import { QueryBuilder, Schema, pointerField, stringField } from '../../src/index.js'
const User = Schema.define({ className: 'User', fields: { name: stringField(), email: stringField() } })
const Post = Schema.define({ className: 'Post', fields: { author: pointerField({ target: () => User }), title: stringField() } })
new QueryBuilder(Post).include('author', (query) => query.select({ ${marker}: true }))
`
		const position = sourceWithMarker.indexOf(marker)
		const source = sourceWithMarker.replace(marker, ' '.repeat(marker.length))
		const fileName = `${import.meta.dirname}/query-pointer-include-completion.fixture.ts`
		const service = createLanguageService(fileName, source)
		const completions = service.getCompletionsAtPosition(fileName, position, {})
		const completionNames = new Set(
			completions?.entries.map(({ name }) => name) ?? [],
		)

		expect(completionNames.has('name')).toBe(true)
		expect(completionNames.has('email')).toBe(true)
		expect(completionNames.has('title')).toBe(false)
	})
})
