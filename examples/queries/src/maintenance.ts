import { Announcement } from './schema.ts'

//#region maintenance
/** Trusted server code only: Master bypasses Announcement's Access rules. */
export const createMaintenanceAnnouncement = (title: string) =>
	Announcement.createOne({ data: { title } }, { useMasterKey: true })
//#endregion maintenance
