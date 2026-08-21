import { assertOptionalBoolean } from '@ultimabase/shared'

/** Validates sequence metadata shared by exact integer field kinds. */
export const assertAutoIncrementOption = (options: object): void => {
	if ('autoIncrement' in options) {
		assertOptionalBoolean(options.autoIncrement, 'autoIncrement')
	}
}
