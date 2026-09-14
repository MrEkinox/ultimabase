import { fileURLToPath } from 'node:url'

import {
	generateApplicationTypes,
	writeGeneratedTypeFile,
} from '@ultimabase/typegen'

import { dataModelingApplication } from './application.ts'

const outputPath = fileURLToPath(
	new URL('./.ultimabase/schema.generated.d.ts', import.meta.url),
)

try {
	const generated = generateApplicationTypes({
		application: dataModelingApplication.application,
		applicationId: 'website-data-modeling',
	})
	await writeGeneratedTypeFile({
		applicationId: 'website-data-modeling',
		contents: generated.contents,
		outputPath,
	})
} finally {
	await dataModelingApplication.dispose()
}
