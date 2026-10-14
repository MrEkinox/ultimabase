//#region run-maintenance
import { createMaintenanceAnnouncement } from './maintenance.ts'
import { ultimabase } from './ultimabase.ts'

await using app = await ultimabase.start()
await createMaintenanceAnnouncement('Rebuild complete')
console.info(app.state)
//#endregion run-maintenance
