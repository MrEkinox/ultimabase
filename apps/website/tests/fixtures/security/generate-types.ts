import { fileURLToPath } from 'node:url'

import {
	generateApplicationTypes,
	writeGeneratedTypeFile,
} from '@ultimabase/typegen'

import { securityApplication } from './application.ts'

const outputPath = fileURLToPath(
	new URL('./.ultimabase/schema.generated.d.ts', import.meta.url),
)

try {
	const generated = generateApplicationTypes({
		application: securityApplication.application,
		applicationId: 'website-security',
	})
	await writeGeneratedTypeFile({
		applicationId: 'website-security',
		contents: generated.contents,
		outputPath,
	})
} finally {
	await securityApplication.dispose()
}
