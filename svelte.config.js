import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		adapter: adapter(),
		// Un onglet reste ouvert des jours (téléphone en répétition) : il interroge
		// `_app/version.json` pour savoir qu'un déploiement l'a rendu obsolète, et le
		// layout propose alors d'actualiser. Le nom de version est l'horodatage du build.
		version: {
			pollInterval: 5 * 60 * 1000
		},
		env: {
			publicPrefix: 'PUBLIC_'
		}
	}
};

export default config;
