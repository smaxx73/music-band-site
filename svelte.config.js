import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		// `bodySizeLimit` est la limite réellement lue par @sveltejs/adapter-node.
		// Sans cette option, l'adaptateur bloque les uploads au-delà de 512 Ko.
		adapter: adapter({ bodySizeLimit: 200 * 1024 * 1024 }),
		env: {
			publicPrefix: 'PUBLIC_'
		}
	}
};

export default config;
