// Copyright (c) 2016, Aaron Ackerman <theron17@gmail.com>
const PluginTitle = 'CircularDependencyPlugin';
import { blue, green, greenBright, red } from 'chalk';
import { relative } from 'path';
import { Compilation, Compiler, NormalModule } from 'webpack5';
import { isAcyclic } from './checkCircle';
import { Graph, Options } from './models';
import { noop } from './utils';

class CircularDependencyPlugin {
  protected options: Options;
  constructor(options: Partial<Options>) {
    this.options = {
      onStart: options.onStart ?? noop,
      onEnd: options.onEnd ?? noop,
      onDetected: options.onDetected ?? noop,
      exclude: options.exclude ?? new RegExp('$^'),
      include: options.include ?? new RegExp('.*'),
      cwd: options.cwd ?? process.cwd(),
      disableLogs: options.disableLogs ?? true,
      webpackHook: options.webpackHook ?? 'compilation'
    };
  }

  apply(compiler: Compiler) {
    if (this.options.webpackHook === 'compilation') {
      compiler.hooks.compilation.tap(PluginTitle, compilation => {
        compilation.hooks.optimizeModules.tap(PluginTitle, modules => {
          this.analyze(compilation, modules as Iterable<NormalModule>);
        });
      });
    } else {
      compiler.hooks.make.tapAsync(PluginTitle, (compilation, cb) => {
        compilation.hooks.afterOptimizeModules.tap(PluginTitle, modules => {
          this.analyze(compilation, modules as Iterable<NormalModule>);
        });
        cb();
      });
    }
  }

  analyze = (compilation: Compilation, modules: Iterable<NormalModule>) => {
    this.options.onStart({ compilation });

    this.log(blue(PluginTitle), greenBright('start analyze'));
    this.logTime(blue(PluginTitle));

    const graph = this.webpackDependencyGraph(compilation, modules);

    this.cycleDetector(graph, cycle => {
      // print modules as paths in error messages
      const cyclicalPaths = cycle.map(module => relative(this.options.cwd, module.resource));
      try {
        this.options.onDetected({
          paths: cyclicalPaths,
          compilation: compilation
        });
      } catch (err) {
        compilation.errors.push(err);
      }
    });

    this.options.onEnd({ compilation });
    this.logTimeEnd(blue(PluginTitle));
    this.log(blue(PluginTitle), green('complete'));
  };

  webpackDependencyGraph = (compilation: Compilation, modules: Iterable<NormalModule>): Graph => {
    // vertices of the dependency graph are the modules
    const vertices = [];
    for (let module of modules) {
      const shouldNotSkip =
        module.resource != null && this.options.include.test(module.resource) && !this.options.exclude.test(module.resource);

      if (shouldNotSkip) {
        vertices.push(module);
      }
    }

    // arrow function for the dependency graph
    const arrow = (module: NormalModule) =>
      module.dependencies
        .filter(dependency => {
          // ignore CommonJsSelfReferenceDependency
          if (dependency.constructor && dependency.constructor.name === 'CommonJsSelfReferenceDependency') {
            return false;
          }
          // ignore dependencies that are resolved asynchronously
          if (dependency.weak) {
            return false;
          }
          return true;
        })
        .map(dependency => {
          // map webpack dependency to module
          if (compilation.moduleGraph) {
            // handle getting a module for webpack 5
            return compilation.moduleGraph.getModule(dependency);
          } else {
            // handle getting a module for webpack 4
            return dependency.module;
          }
        })
        .filter(depModule => {
          if (!depModule) {
            return false;
          }
          // ignore dependencies that don't have an associated resource
          if (!depModule.resource) {
            return false;
          }
          // the dependency was resolved to the current module due to how webpack internals
          // setup dependencies like CommonJsSelfReferenceDependency and ModuleDecoratorDependency
          if (module === depModule) {
            return false;
          }
          return true;
        });

    return { vertices, arrow };
  };

  cycleDetector = (graph: Graph, cycleCallback: (cycle: NormalModule[]) => void) => {
    const [noCycl, modules] = isAcyclic(graph);
    this.log(blue(PluginTitle), noCycl ? green('no cycle imports') : red('found cycle imports -> processing'));

    for (const module of modules) {
      const cycle = findModuleCycleAt(module, module, {}, graph.arrow);
      if (cycle) {
        cycleCallback(cycle);
      }
    }
  };

  log = (...texts: unknown[]) => {
    if (this.options.disableLogs) return;

    console.log(...texts);
  };
  logTime = (label: string) => {
    if (this.options.disableLogs) return;

    console.time(label);
  };
  logTimeEnd = (label: string) => {
    if (this.options.disableLogs) return;

    console.timeEnd(label);
  };
}

const findModuleCycleAt = (
  initialModule: NormalModule,
  currentModule: NormalModule,
  seenModules: Record<number, boolean>,
  arrow: Graph['arrow']
): NormalModule[] | false => {
  // Add the current module to the seen modules cache
  seenModules[currentModule.debugId] = true;

  // If the modules aren't associated to resources
  // it's not possible to display how they are cyclical
  if (!currentModule.resource || !initialModule.resource) {
    return false;
  }

  // Iterate over the current modules dependencies
  for (let depModule of arrow(currentModule)) {
    if (depModule.debugId in seenModules) {
      if (depModule.debugId === initialModule.debugId) {
        // Initial module has a circular dependency
        return [currentModule, depModule];
      }
      // Found a cycle, but not for this module
      continue;
    }

    let maybeCyclicalPathsList = findModuleCycleAt(initialModule, depModule, seenModules, arrow);
    if (maybeCyclicalPathsList) {
      maybeCyclicalPathsList.unshift(currentModule);
      return maybeCyclicalPathsList;
    }
  }
  return false;
};

export default CircularDependencyPlugin;
