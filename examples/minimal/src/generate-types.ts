import { fileURLToPath } from 'node:url'

import {
	generateApplicationTypes,
	writeGeneratedTypeFile,
} from '@ultimabase/typegen'

import { createMinimalApplication } from './create-application.ts'

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
	})
	await writeGeneratedTypeFile({
		applicationId: 'minimal',
		contents: generated.contents,
		outputPath,
	})
} finally {
	await ultimabase.dispose()
}
