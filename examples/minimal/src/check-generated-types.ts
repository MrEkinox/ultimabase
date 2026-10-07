import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { generateApplicationTypes } from '@ultimabase/typegen'

import type {
	ExampleArticleCreateInput,
	ExampleArticleItem,
	ExampleArticleNestedCreateInput,
	ExampleArticleNestedUpdateData,
	ExampleArticleOrderByInput,
	ExampleArticleOutput,
	ExampleArticleSelect,
	ExampleArticleWhereInput,
} from '../.ultimabase/schema.generated.js'
import { createMinimalApplication } from './create-application.ts'

const nestedCreate = {
	author: { connect: '0199b4f0-5a31-7000-8000-000000000001' },
	contributors: {
		connect: ['0199b4f0-5a31-7000-8000-000000000002'],
		create: [{ name: 'Grace' }],
	},
	presentation: {
		subtitle: 'A generated virtual-field fixture',
		tags: ['public', 'typed'],
	},
	slug: 'typed-nested-write',
	title: 'Typed nested write',
} satisfies ExampleArticleNestedCreateInput

const nestedUpdate = {
	contributors: {
		disconnect: ['0199b4f0-5a31-7000-8000-000000000002'],
		update: [
			{
				data: { name: 'Grace Hopper' },
				id: '0199b4f0-5a31-7000-8000-000000000003',
			},
		],
	},
} satisfies ExampleArticleNestedUpdateData

void nestedCreate
void nestedUpdate

const assertGeneratedVirtualTypes = (): void => {
	const output = null as unknown as Pick<
		ExampleArticleOutput,
		| 'authenticatedTitle'
		| 'displayTitle'
		| 'labels'
		| 'optionalSubtitle'
		| 'summary'
		| 'viewerLabel'
	>
	const expected: Readonly<{
		readonly authenticatedTitle: string
		readonly displayTitle: string
		readonly labels: readonly string[]
		readonly optionalSubtitle: string | null
		readonly summary: Readonly<{
			readonly labels: readonly string[]
			readonly subtitle: string | null
			readonly title: string
		}>
		readonly viewerLabel: string
	}> = output
	const roundTrip: typeof output = expected
	const select: ExampleArticleSelect = {
		displayTitle: true,
		labels: true,
		summary: true,
	}
	const item = null as unknown as ExampleArticleItem
	const create = null as unknown as ExampleArticleCreateInput
	const where = null as unknown as ExampleArticleWhereInput
	const orderBy = null as unknown as ExampleArticleOrderByInput

	// @ts-expect-error -- Persisted items never contain virtual outputs.
	void item.displayTitle
	// @ts-expect-error -- Mutation inputs never accept virtual outputs.
	void create.summary
	// @ts-expect-error -- Virtual fields cannot be filtered.
	void where.viewerLabel
	// @ts-expect-error -- Virtual fields cannot be ordered.
	void orderBy.labels
	void [roundTrip, select]
}

void assertGeneratedVirtualTypes

const outputPath = fileURLToPath(
	new URL('../.ultimabase/schema.generated.d.ts', import.meta.url),
)
const ultimabase = createMinimalApplication({
	databaseUrl: 'postgres://typegen.invalid/ultimabase',
	masterKey: 'typegen-static-key',
	onMasterUse: () => undefined,
})

try {
	const generated = generateApplicationTypes({
		ultimabase,
		applicationId: 'minimal',
	}).contents
	const committed = await readFile(outputPath, 'utf8')
	if (generated !== committed) {
		throw new TypeError('Minimal generated declarations are stale')
	}
} finally {
	await ultimabase.dispose()
}
