import { onTestFinished } from 'vitest'

/** Registers ordinary public teardown even when a fixture assertion fails. */
export const applicationFixture = <
	TApplication extends { dispose(): Promise<void> },
>(
	application: TApplication,
): TApplication => {
	onTestFinished(() => application.dispose())
	return application
}
