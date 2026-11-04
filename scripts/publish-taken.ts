// Whether npm refused a publish because it holds the version already: an
// earlier try it did not confirm, or a version it has staged but does not
// serve yet (D-156).

/** Whether `output`, of a failed `npm publish`, says the version is taken. */
export const publishTaken = (output: string): boolean =>
	/EPUBLISHCONFLICT|cannot publish over/iu.test(output)
