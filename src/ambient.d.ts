/** Déclaration du paquet ESM, qui publie du JavaScript sans types TypeScript. */
declare module '@educandu/abc-tools' {
	export function convertMusicXmlToAbc(
		xml: string,
		options?: Record<string, string | number | boolean>
	): { result: string; warningMessage: string }
}
