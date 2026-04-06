# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
npx sv@0.13.0 create --template minimal --types ts --add eslint vitest="usages:unit" tailwindcss="plugins:none" sveltekit-adapter="adapter:node" --install npm ConstitutionalERP-UI-SvelteKit
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## Postman Process Flows

The Canvas landing page can render domain process flow sequences generated from the FoundationERP Postman collection.

Generate flow artifacts with:

```sh
npm run flows:generate
```

Optional override:

```sh
FLOW_COLLECTION_PATH="D:/path/to/FoundationERP.postman_collection.json" npm run flows:generate
```

Generated artifact path:

- `src/lib/flows/generated/foundation-process-flows.json`
