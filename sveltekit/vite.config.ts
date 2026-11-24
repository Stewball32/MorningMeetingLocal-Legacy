import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

// SvelteKit 3 refuses to start without the variables declared in src/env.ts. Unit tests never
// talk to PocketBase, so give them a placeholder when no .env is present: an address that never
// answers, in case anything ever does try.
const testing = !!process.env.VITEST;
if (testing) process.env.PUBLIC_POCKETBASE_URL ??= 'http://pocketbase.invalid';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			preprocess: vitePreprocess(),
			adapter: adapter(),
			// Tests get their own generated files. Sharing .svelte-kit, a test run rewrote the env
			// module a running `vite dev` serves, so its open pages switched to the tests' PocketBase
			// address (once the owner's real one) until the dev server restarted.
			...(testing && { outDir: '.svelte-kit-vitest' })
		})
	],
	preview: { host: '0.0.0.0', allowedHosts: ['meet.lan'] },
	test: {
		projects: [
			{
				extends: './vite.config.ts',
				plugins: [svelteTesting()],
				test: {
					name: 'client',
					environment: 'jsdom',
					clearMocks: true,
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**'],
					setupFiles: ['./vitest-setup-client.ts']
				}
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
