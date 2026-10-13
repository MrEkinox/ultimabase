//#region public-writes
import { UltimaBase } from '@ultimabase/core'
import { httpPlugin } from '@ultimabase/http-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { restPlugin } from '@ultimabase/rest-plugin'

/**
 * A second application without any policy plugin. REST exposes writes, so
 * it starts only because `publicWrites` says every client may write.
 */
const Guestbook = UltimaBase.use(
	httpPlugin({ appId: 'guestbook' }),
	restPlugin({ publicWrites: true }),
	postgresPlugin(),
)

export const Entry = Guestbook.Schema.define({
	className: 'Entry',
	fields: (field) => ({ message: field.string({ required: true }) }),
})

export const guestbook = new Guestbook({ schemas: [Entry] })
//#endregion public-writes
