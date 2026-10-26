# Example Vizzly plugin

Add custom commands to the Vizzly CLI. This example includes:

| Command | Shows how to… |
| --- | --- |
| `vizzly hello` | Add a simple command. |
| `vizzly greet <name>` | Accept arguments and options. |
| `vizzly check-services` | Use Vizzly services. |
| `vizzly list-screenshots` | Read files. |

## Try it

Add the plugin path to `vizzly.config.js`:

```javascript
export default {
  plugins: ['./examples/custom-plugin/plugin.js'],
};
```

Then run `pnpm exec vizzly --help` to see the commands, or try:

```bash
pnpm exec vizzly greet "World" --loud
```

## Write a plugin

Add a `vizzlyPlugin` entry to your package's `package.json`:

```json
{
  "name": "@vizzly-testing/my-plugin",
  "type": "module",
  "vizzlyPlugin": "./plugin.js"
}
```

Export a plugin object from `plugin.js`:

```javascript
export default {
  name: 'my-plugin',
  version: '1.0.0',
  register(program, { config, output, services }) {
    program
      .command('my-command')
      .description('My custom command')
      .action(() => {
        output.info('Running my command!');
      });
  },
};
```

`register` gets the Commander program for adding commands, plus your config,
output helpers, and services. Give the plugin a `name`; `version` is optional.

Test locally by adding the plugin file to `config.plugins`. Vizzly automatically
loads installed `@vizzly-testing/*` packages that declare `vizzlyPlugin`.

## Services

```javascript
let { git, testRunner, serverManager } = services;

let gitInfo = await git.detect({ buildPrefix: 'MyPlugin' });
// { branch, commit, message, prNumber, buildName }

let buildId = await testRunner.createBuild(options, isTddMode);
await serverManager.start(buildId, isTddMode, setBaseline);

// Capture screenshots here.

await testRunner.finalizeBuild(buildId, isTddMode, success, executionTime);
await serverManager.stop();
```

See the [Vizzly docs](https://docs.vizzly.dev) for more.
