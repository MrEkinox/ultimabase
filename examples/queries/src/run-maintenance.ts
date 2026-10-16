//#region run-maintenance
import { createMaintenanceAnnouncement } from './maintenance.ts'
import { ultimabase } from './ultimabase.ts'

await using started = await ultimabase.start()
await createMaintenanceAnnouncement('Rebuild complete')
console.info(started.state)
//#endregion run-maintenance
