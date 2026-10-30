// Maintenance: a new WebSocket is refused with 503, and those open close
// with 1012, so that their clients come back once it ends.
import type { Gate, Http, HttpApi } from '@ultimabase/http'
import { httpPlugin } from '@ultimabase/http'
import type { PluginOf, PluginTypes } from 'ultimabase'
import { definePlugin } from 'ultimabase'

interface Maintenance extends PluginTypes {
	readonly name: 'maintenance'
	readonly requires: Http
}

let enabled = false
let http: HttpApi | undefined

//#region gate
/** httpPlugin's `upgrade`: no new socket during maintenance. */
export const refusedInMaintenance: Gate = () =>
	enabled
		? Response.json(
				{ code: 'UNAVAILABLE', message: 'Under maintenance.' },
				{ status: 503, headers: { 'retry-after': '60' } },
			)
		: undefined
//#endregion

//#region plugin
/** Keeps the HTTP plugin's API while the application runs. */
export const maintenancePlugin: PluginOf<Maintenance> =
	definePlugin<Maintenance>({
		name: 'maintenance',
		manifest: {
			name: 'example-maintenance',
			version: '1.0.0',
			peerDependencies: { ultimabase: '*' },
		},
		requires: { http: httpPlugin },
		start: ({ plugins }) => {
			http = plugins.http
		},
	}).plugin

/** Begins or ends the maintenance; as it begins, every socket closes. */
export function setMaintenance(on: boolean): void {
	enabled = on
	if (on) http?.closeUpgrades({ code: 1012, reason: 'Maintenance' })
}
//#endregion
