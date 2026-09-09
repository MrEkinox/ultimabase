import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { generateApplicationTypes } from '@ultimabase/typegen'

import type {
	ExampleArticleNestedCreateInput,
	ExampleArticleNestedUpdateData,
} from '../.ultimabase/schema.generated.js'
import { createMinimalApplication } from './create-application.ts'

const nestedCreate = {
	author: { connect: '0199b4f0-5a31-7000-8000-000000000001' },
	contributors: {
		connect: ['0199b4f0-5a31-7000-8000-000000000002'],
		create: [{ name: 'Grace' }],
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
		application: ultimabase.application,
		applicationId: 'minimal',
	}).contents
	const committed = await readFile(outputPath, 'utf8')
	if (generated !== committed) {
		throw new TypeError('Minimal generated declarations are stale')
	}
} finally {
	await ultimabase.dispose()
}
