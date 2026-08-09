import { ultimabase } from './application.ts'

await ultimabase.start()

process.stdout.write(
	'Todo backend started. Generated types are available in .ultimabase/schema.generated.d.ts.\n',
)

const shutdown = async (): Promise<void> => {
	await ultimabase.dispose()
}

// Keep framework-owned resources consistent when the development process stops.
process.once('SIGINT', () => void shutdown())
process.once('SIGTERM', () => void shutdown())
