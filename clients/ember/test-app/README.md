# Ember test app

A small Ember app for testing `@vizzly-testing/ember`. It uses Vite to build the
app and Testem to run browser tests.

## Run it

From this folder:

```bash
pnpm install
pnpm run start
```

Open [localhost:4200](http://localhost:4200) for the app or
[/tests](http://localhost:4200/tests) for the test page.

## Run tests

Install Chromium once using the SDK's Playwright dependency:

```bash
pnpm --dir .. install
pnpm --dir .. exec playwright-core install chromium
```

For local review, [install the CLI](../../../README.md#get-started) in this
folder, then start `pnpm exec vizzly tdd start --open` before running tests. The test command builds the app with test files, then runs
Ember tests:

```bash
pnpm test
```

For SDK setup and cloud review, see the [Ember guide](../README.md).

## Other commands

| Command | What it does |
| --- | --- |
| `pnpm run lint` | Check formatting, templates, and CSS. |
| `pnpm run lint:fix` | Fix lint and formatting issues. |
| `pnpm exec vite build --mode development` | Build with test files. |
| `pnpm run build` | Build for production. |
| `pnpm exec ember help generate` | List code generators. |
