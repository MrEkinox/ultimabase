import { fileURLToPath } from 'node:url'

import {
	generateApplicationTypes,
	writeGeneratedTypeFile,
} from '@ultimabase/typegen'

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
	})
	await writeGeneratedTypeFile({
		applicationId: 'minimal-rest',
		contents: generated.contents,
		outputPath,
	})
} finally {
	await ultimabase.dispose()
}
