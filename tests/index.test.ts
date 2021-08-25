import path from 'path';
import MemoryFS from 'memory-fs';
import CircularDependencyPlugin from '../src/plugin';
import { WebpackError } from 'webpack5';

// TODO: type it
const wrapRun = (run: any) => {
  return () =>
    new Promise<any>((resolve, reject) => {
      run((err: any, result: any) => {
        if (err) {
          return reject(err);
        }
        return resolve(result.toJson());
      });
    });
};

const normalizePaths = (paths: string[]) => paths.map(pa => pa.replace(/\\/g, '/'));

const versions = [
  {
    name: 'webpack',
    module: require('webpack')
  },
  {
    name: 'webpack5',
    module: require('webpack5')
  }
];

const getWarningMessage = (stats: any, index: number) => {
  return getStatsMessage(stats, index, 'warnings');
};

const getStatsMessage = (stats: any, index: number, type: 'warnings') => {
  if (stats[type][index] == null) {
    return null;
  } else if (stats[type][index].message) {
    // handle webpack 5
    return stats[type][index].message;
  } else {
    // handle webpack 4
    return stats[type][index];
  }
};

for (let version of versions) {
  let webpack = version.module;

  describe(`circular dependency ${version.name}`, () => {
    it('detects circular dependencies from a -> b -> c -> b', async () => {
      let fs = new MemoryFS();
      let detectedCircles: string[] = [];
      let compiler = webpack({
        mode: 'development',
        entry: path.join(__dirname, 'deps/a.js'),
        output: { path: __dirname },
        plugins: [
          new CircularDependencyPlugin({
            onDetected: ({ paths }) => {
              detectedCircles = normalizePaths(paths);
            }
          })
        ]
      });
      compiler.outputFileSystem = fs;

      const runAsync = wrapRun(compiler.run.bind(compiler));
      await runAsync();

      expect(`${detectedCircles.join(' -> ')}`).toContain('tests/deps/c.js -> tests/deps/b.js -> tests/deps/c.js');
    });

    it('detects circular dependencies from d -> e -> f -> g -> e', async () => {
      let fs = new MemoryFS();
      let detectedCircles: string[] = [];
      let compiler = webpack({
        mode: 'development',
        entry: path.join(__dirname, 'deps/d.js'),
        output: { path: __dirname },
        plugins: [
          new CircularDependencyPlugin({
            onDetected: ({ paths }) => {
              detectedCircles = normalizePaths(paths);
            }
          })
        ]
      });
      compiler.outputFileSystem = fs;

      let runAsync = wrapRun(compiler.run.bind(compiler));
      await runAsync();

      expect(`${detectedCircles.join(' -> ')}`).toContain(
        'tests/deps/g.js -> tests/deps/e.js -> tests/deps/f.js -> tests/deps/g.js'
      );
    });

    it(`can handle context modules that have an undefined resource h -> i -> a -> i`, async () => {
      let fs = new MemoryFS();
      let compiler = webpack({
        mode: 'development',
        entry: path.join(__dirname, 'deps/h.js'),
        output: { path: __dirname },
        plugins: [new CircularDependencyPlugin(Object.create({}))]
      });
      compiler.outputFileSystem = fs;

      let runAsync = wrapRun(compiler.run.bind(compiler));
      let stats = await runAsync();
      expect(stats.warnings.length).toEqual(0);
      expect(stats.errors.length).toEqual(0);
    });

    it('allows hooking into detection cycle', async () => {
      let fs = new MemoryFS();
      let compiler = webpack({
        mode: 'development',
        entry: path.join(__dirname, 'deps/nocycle.js'),
        output: { path: __dirname },
        plugins: [
          new CircularDependencyPlugin({
            onStart({ compilation }) {
              compilation.warnings.push(new WebpackError('started'));
            },
            onEnd({ compilation }) {
              compilation.errors.push(new WebpackError('ended'));
            }
          })
        ]
      });
      compiler.outputFileSystem = fs;

      let runAsync = wrapRun(compiler.run.bind(compiler));
      let stats = await runAsync();

      if (/^5/.test(webpack.version)) {
        expect(stats.warnings).toMatchObject([{ message: 'started' }]);
        expect(stats.errors).toMatchObject([{ message: 'ended' }]);
      } else {
        expect(stats.warnings).toEqual(['started']);
        expect(stats.errors).toEqual(['ended']);
      }
    });

    it('allows overriding all behavior with onDetected', async () => {
      let cyclesPaths;
      let fs = new MemoryFS();
      let compiler = webpack({
        mode: 'development',
        entry: path.join(__dirname, 'deps/d.js'),
        output: { path: __dirname },
        plugins: [
          new CircularDependencyPlugin({
            onDetected({ paths }) {
              cyclesPaths = normalizePaths(paths);
            }
          })
        ]
      });
      compiler.outputFileSystem = fs;

      let runAsync = wrapRun(compiler.run.bind(compiler));
      await runAsync();
      expect(cyclesPaths).toEqual(['tests/deps/g.js', 'tests/deps/e.js', 'tests/deps/f.js', 'tests/deps/g.js']);
    });

    it('detects circular dependencies from d -> e -> f -> g -> e', async () => {
      let fs = new MemoryFS();
      let compiler = webpack({
        mode: 'development',
        entry: path.join(__dirname, 'deps/d.js'),
        output: { path: __dirname },
        plugins: [
          new CircularDependencyPlugin({
            onDetected({ paths, compilation }) {
              compilation.warnings.push(new WebpackError(normalizePaths(paths).join(' -> ')));
            }
          })
        ]
      });
      compiler.outputFileSystem = fs;

      let runAsync = wrapRun(compiler.run.bind(compiler));
      let stats = await runAsync();

      const msg0 = getWarningMessage(stats, 0);
      expect(msg0).toContain('tests/deps/g.js -> tests/deps/e.js -> tests/deps/f.js -> tests/deps/g.js');
      expect(msg0).toMatch(/e\.js/);
      expect(msg0).toMatch(/f\.js/);
      expect(msg0).toMatch(/g\.js/);
    });

    it('can detect circular dependencies when the ModuleConcatenationPlugin is used', async () => {
      let fs = new MemoryFS();
      let detectedCircles: string[] = [];
      let compiler = webpack({
        mode: 'development',
        entry: path.join(__dirname, 'deps/module-concat-plugin-compat/index.js'),
        output: { path: __dirname },
        plugins: [
          new webpack.optimize.ModuleConcatenationPlugin(),
          new CircularDependencyPlugin({
            onDetected: ({ paths }) => {
              detectedCircles = normalizePaths(paths);
            }
          })
        ]
      });
      compiler.outputFileSystem = fs;

      let runAsync = wrapRun(compiler.run.bind(compiler));
      await runAsync();
      const msg0 = detectedCircles.join(' -> ');
      expect(msg0).toContain(
        'tests/deps/module-concat-plugin-compat/b.js -> tests/deps/module-concat-plugin-compat/a.js -> tests/deps/module-concat-plugin-compat/b.js'
      );
    });

    describe('ignores self referencing webpack internal dependencies', () => {
      it('ignores this references', async () => {
        let fs = new MemoryFS();
        let detectedCircles: string[] = [];
        let compiler = webpack({
          mode: 'development',
          entry: path.join(__dirname, 'deps', 'self-referencing', 'uses-this.js'),
          output: { path: __dirname },
          plugins: [
            new CircularDependencyPlugin({
              onDetected: ({ paths }) => {
                detectedCircles = normalizePaths(paths);
              }
            })
          ]
        });
        compiler.outputFileSystem = fs;

        let runAsync = wrapRun(compiler.run.bind(compiler));
        await runAsync();

        expect(detectedCircles.length).toEqual(0);
      });

      it('ignores module.exports references', async () => {
        let detectedCircles: string[] = [];
        let fs = new MemoryFS();
        let compiler = webpack({
          mode: 'development',
          entry: path.join(__dirname, 'deps', 'self-referencing', 'uses-exports.js'),
          output: { path: __dirname },
          plugins: [
            new CircularDependencyPlugin({
              onDetected: ({ paths }) => {
                detectedCircles = normalizePaths(paths);
              }
            })
          ]
        });
        compiler.outputFileSystem = fs;

        let runAsync = wrapRun(compiler.run.bind(compiler));
        let stats = await runAsync();

        expect(detectedCircles.length).toEqual(0);
      });

      it('ignores self references', async () => {
        let fs = new MemoryFS();
        let detectedCircles: string[] = [];
        let compiler = webpack({
          mode: 'development',
          entry: path.join(__dirname, 'deps', 'self-referencing', 'imports-self.js'),
          output: { path: __dirname },
          plugins: [
            new CircularDependencyPlugin({
              onDetected: ({ paths }) => {
                detectedCircles = normalizePaths(paths);
              }
            })
          ]
        });
        compiler.outputFileSystem = fs;

        let runAsync = wrapRun(compiler.run.bind(compiler));
        await runAsync();

        expect(detectedCircles.length).toEqual(0);
      });

      it('works with typescript', async () => {
        let fs = new MemoryFS();
        let detectedCircles: string[] = [];
        let compiler = webpack({
          mode: 'development',
          entry: path.join(__dirname, 'deps', 'ts', 'a.tsx'),
          output: { path: __dirname },
          module: {
            rules: [
              {
                test: /\.tsx?$/,
                use: [
                  {
                    loader: 'ts-loader',
                    options: {
                      configFile: path.resolve(path.join(__dirname, 'deps', 'ts', 'tsconfig.json'))
                    }
                  }
                ],
                exclude: /node_modules/
              }
            ]
          },
          plugins: [
            new CircularDependencyPlugin({
              onDetected: ({ paths }) => {
                detectedCircles = normalizePaths(paths);
              }
            })
          ]
        });
        compiler.outputFileSystem = fs;

        let runAsync = wrapRun(compiler.run.bind(compiler));
        await runAsync();

        expect(detectedCircles.length).toEqual(0);
      });
    });
  });
}
