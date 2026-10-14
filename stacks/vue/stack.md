# Vue

Kind: frontend

## Summary

Vue 3 single-page applications in TypeScript, built with Vite and served as static assets against a separate backend API. These are proposed defaults awaiting team review; no existing repository was distilled into them.

## Architecture

- Feature folders under `src/features/<feature>/`, each holding its own `components/`, `composables/`, `stores/`, `api/` and `routes.ts`. Shared, feature-agnostic code lives in `src/shared/` (`ui/`, `composables/`, `lib/`); app wiring (router, Pinia, plugins, root layout) lives in `src/app/`.
- Dependency direction: `app` imports features, features import `shared`, `shared` imports neither. A feature never imports another feature's internals; it imports only that feature's `index.ts`.
- Pages are route components named `*Page.vue` inside their feature; they fetch and compose, and child components receive data through props.
- Composition API with `<script setup lang="ts">` everywhere. No Options API, no mixins, no `defineComponent` wrappers for new code.
- Reusable stateful logic is a composable (`useX`), not a base component or a global plugin.
- Path alias `@/` maps to `src/`; deep relative imports (`../../..`) are not used across folders.
- Environment values are read once in `src/shared/lib/env.ts` from `import.meta.env` and validated at startup; nothing else reads `import.meta.env`.

## Libraries

- Vite: dev server and build.
- Vue Router 4: routing, one `routes.ts` per feature merged in `src/app/router.ts`, lazy-loaded with `() => import(...)`.
- Pinia: client state, setup-store syntax (`defineStore('id', () => {...})`).
- Server state: TanStack Query for Vue or a typed fetch wrapper, per the open choice. The HTTP layer is a thin wrapper over `fetch`; no axios.
- Zod: validates API responses and form input at the boundary and supplies the inferred types.
- VueUse: browser and utility composables before writing a local one.
- vue-tsc: type checking of `.vue` files.
- ESLint flat config with `eslint-plugin-vue` and `typescript-eslint`; Prettier owns formatting and ESLint carries no formatting rules.

## Data

- Server state and client state are separate. Data that lives on the server is owned by the query layer (or the fetch wrapper's composables) and is never copied into Pinia.
- Pinia holds only client state that outlives a component: session, preferences, cross-page UI state. Component-local state stays in `ref`/`reactive` in the component.
- Each feature's `api/` module owns its endpoints, returns parsed and validated types, and is the only place that calls the HTTP wrapper.
- Query keys are built by a per-feature key factory (`orderKeys.detail(id)`), never inline arrays. Mutations invalidate by key factory.
- API types come from Zod schemas (`z.infer`), or from generated OpenAPI types when the backend publishes a schema; hand-written duplicate interfaces are not kept.
- Store state is read through `storeToRefs`; stores are not destructured directly.
- Forms keep a local draft model and submit through a mutation; they do not edit store or query-cache objects in place.

## Messaging

None.

## Errors

- The HTTP wrapper converts non-2xx responses and network failures into one typed `ApiError` (status, code, field errors from problem details when present). Nothing above the wrapper inspects raw `Response` objects.
- Field errors map onto form fields; other errors surface through one notification composable. Components do not each render their own ad-hoc error banner.
- An app-level `app.config.errorHandler` and a router `onError` hook report unexpected errors; components do not wrap everything in try/catch.
- 401 is handled once in the wrapper (session cleared, redirect to login with return path); 403 and 404 route to dedicated pages.
- Every async view renders explicit loading, empty and error states.

## Naming

- Components are PascalCase multi-word files (`OrderTable.vue`); base UI components in `shared/ui` take a `Base` prefix (`BaseButton.vue`).
- Composables are `useX.ts` exporting `useX`; stores are `useXStore` in `xStore.ts`; API modules are `xApi.ts`.
- Props are camelCase in script and kebab-case in templates; events are camelCase verbs declared with typed `defineEmits`.
- Props and emits are declared with type-only `defineProps<...>()` and `defineEmits<...>()`; `v-model` uses `defineModel`.
- Test files sit next to the source as `X.spec.ts`; end-to-end specs live in `e2e/` as `<flow>.spec.ts`.

## Testing

- Vitest with jsdom and Vue Test Utils for unit and component tests, colocated with the source.
- Component tests mount the real component and assert on rendered output and emitted events, querying by role, label or text; no snapshot tests and no assertions on internal component state.
- Network is faked with MSW at the fetch boundary, shared handlers per feature. Feature `api/` modules are not mocked with `vi.mock` in component tests.
- Stores are tested through `createTestingPinia` when a component depends on them, and directly as plain functions otherwise.
- Playwright for end-to-end tests of critical user flows against a built app, using role-based locators and no fixed waits.

## Gate

- lint: pnpm run lint
- format: pnpm run format:check
- typecheck: pnpm run typecheck
- test: pnpm run test

## Open choices

- package-manager: pnpm, npm (default pnpm)
- server-state: TanStack Query, typed fetch wrapper with composables (default TanStack Query)
- styling: scoped SFC styles with CSS custom properties, Tailwind CSS (default scoped SFC styles with CSS custom properties)
- component-library: none, PrimeVue, Vuetify (default none)
- api-types: Zod schemas, generated from OpenAPI (default generated from OpenAPI)
- realtime: none, server-sent events, websockets (default none)

## Concerns

- architecture (always-on): every change; feature layout, import direction and the chosen state and fetching split.
- components (on-demand): creating or changing `.vue` components, props, emits and composables.
- state (on-demand): adding or changing Pinia stores or client-side state.
- data-fetching (on-demand): API modules, queries, mutations, cache keys and the HTTP wrapper.
- routing (on-demand): routes, guards, lazy loading and navigation.
- styling (on-demand): styles, design tokens and layout.
- testing (on-demand): unit, component and end-to-end tests.
