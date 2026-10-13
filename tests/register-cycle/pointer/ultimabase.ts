import { A, App, B } from './schema.ts'

export const ultimabase = new App({ schemas: [A, B] })

declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
	}
}
