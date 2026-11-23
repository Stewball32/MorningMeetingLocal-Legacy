import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

// SvelteKit 3 refuses to start without the variables declared in src/env.ts. Unit tests never
// talk to PocketBase, so give them a placeholder when no .env is present. It must be an address
// that never answers: a test run also rewrites the dev server's generated env module
// (.svelte-kit/generated/dev/env), so a `vite dev` running in the same folder hands this address
// to the browser until it restarts. With a real address (it was http://localhost:8090) the open
// pages would quietly read and write that PocketBase instead of the dev server's own.
if (process.env.VITEST) process.env.PUBLIC_POCKETBASE_URL ??= 'http://pocketbase.invalid';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			preprocess: vitePreprocess(),
			adapter: adapter()
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
