//#region genre
import { defineEnum } from '@ultimabase/core'

/** A shared enum: every field that uses it has the same `Genre` type. */
export const Genre = defineEnum('Genre', ['fiction', 'essay', 'poetry'])
//#endregion genre
