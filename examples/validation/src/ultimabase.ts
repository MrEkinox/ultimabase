//#region application
import { App, Event, TicketTier } from './schema.ts'

/** Validation applies to every caller, Master included. */
export const ultimabase = new App({ schemas: [Event, TicketTier] })

// One declaration per application gives name-keyed editor types (ADR-0297).
declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
	}
}
//#endregion application
