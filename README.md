
# Circular Dependency Plugin

Detect modules with circular dependencies when bundling or compiling with webpack.
This is the same plugin as [here](https://github.com/aackerman/circular-dependency-plugin), but faster and written in typescript.

## Acknowledgements

 - [Installation](https://github.com/woophi/circular-deps-check#installation)
 - [Getting started](https://github.com/woophi/circular-deps-check#getting-started)
 - [Plugin options](https://github.com/woophi/circular-deps-check#plugin-options)
 - [Origin of source code](https://github.com/aackerman/circular-dependency-plugin)

  
## Installation

```bash
  yarn add -D circular-deps-check
```
    
## Getting started

### Basic Usage

```js
// webpack.config.js
const CircularDependencyPlugin = require('circular-deps-check')

module.exports = {
  entry: "./src/index",
  plugins: [
    new CircularDependencyPlugin({
      // exclude detection of files based on a RegExp
      exclude: /a\.js|node_modules/,
      // include specific files based on a RegExp
      include: /dir/,
      // set the current working directory for displaying module paths
      cwd: process.cwd(),
      // `onStart` is called before the cycle detection starts
      onStart({ compilation }) {
        console.log('start detecting webpack modules cycles');
      },
      // `onDetected` is called for each module that is cyclical
      onDetected({ paths, compilation }) {
        // `paths` will be an Array of the relative module paths that make up the cycle
        compilation.errors.push(new Error(paths.join(' -> ')))
      },
      // `onEnd` is called before the cycle detection ends
      onEnd({ compilation }) {
        console.log('end detecting webpack modules cycles');
      },
    })
  ]
}
```

### Advance Usage - write results to json

```js
// webpack.config.js

const circularDependencies = {
  count: 0,
  countInDangerPackage: 0,
  dependencyCircles: {}
};

new CircularDependencyPlugin({
  onStart() {
    circularDependencies.count = 0;
    circularDependencies.countInDangerPackage = 0;
    circularDependencies.dependencyCircles = {};
  },
  onDetected({ compilation, paths }) {
    circularDependencies.count++;
    // windows problems
    const [source, ...deps] = paths.map(pa => pa.replace(/\\/g, '/'));

    if (paths.some(p => /dangerPackage/.test(p))) {
      circularDependencies.countInDangerPackage++;
      compilation.errors.push(
        new Error(`[CircularDependency] in ${path.join(process.cwd(), paths[0])}:\n ${deps.join(' -> ')}`)
      );
    }

    if (circularDependencies.dependencyCircles[source]) {
      circularDependencies.dependencyCircles[source] = [circularDependencies.dependencyCircles[source], deps];
    } else {
      circularDependencies.dependencyCircles[source] = deps;
    }
  },
  onEnd({ compilation }) {
    if (circularDependencies.count > 0) {
      compilation.errors.push(new Error(`Detected ${circularDependencies.count} cycles in dependency tree.`));
    }
    if (circularDependencies.countInDangerPackage > 0) {
      compilation.errors.push(
        new Error(
          `Detected ${circularDependencies.countInDangerPackage} cycles in dependency tree of dangerPackage - please refactor code to eliminate them.`
        )
      );
    }
    const content = JSON.stringify(circularDependencies, null, 2);
    writeFileSync(path.join(__dirname, './circularDeps.json'), content, {
      encoding: 'utf-8'
    });
  }
}),
```
## Plugin options

| Option | Type     | Default | Description                |
| :-------- | :------- | :------- | :------------------------- |
| `onStart` | `({ compilation }) => void;`| `noop` | called before the cycle detection starts |
| `onDetected` | `({ compilation, paths: string[] }) => void;`| `noop` | called for each module that is cyclical |
| `onEnd` | `({ compilation }) => void;`| `noop` | called before the cycle detection ends |
| `exclude` | `RegExp`| `new RegExp('$^')` | exclude detection of files |
| `include` | `RegExp`| `new RegExp('.*')` | include specific files |
| `cwd` | `string` | `process.cwd()` | |
| `disableLogs` | `boolean`| `true` |  |
| `webpackHook` | `'make' or 'compilation'`| `'compilation'` | [See about webpack hooks](https://webpack.js.org/api/compiler-hooks/#compilation) |
