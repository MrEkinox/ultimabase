import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { generateApplicationTypes } from '@ultimabase/typegen'

import { createMinimalRestApplication } from './create-application.ts'

const outputPath = fileURLToPath(
	new URL('../.ultimabase/schema.generated.d.ts', import.meta.url),
)
const ultimabase = createMinimalRestApplication({
	databaseUrl: 'postgres://typegen.invalid/ultimabase',
	masterKey: 'typegen-static-key',
	onMasterUse: () => undefined,
})

try {
	const generated = generateApplicationTypes({
		application: ultimabase.application,
		applicationId: 'minimal-rest',
	}).contents
	const committed = await readFile(outputPath, 'utf8')
	if (generated !== committed) {
		throw new TypeError('Minimal REST generated declarations are stale')
	}
} finally {
	await ultimabase.dispose()
}
