import { Compilation, NormalModule } from 'webpack';

export interface Options {
  onStart: (cr: { compilation: Compilation }) => void;
  onDetected: (cr: { compilation: Compilation; paths: string[] }) => void;
  onEnd: (cr: { compilation: Compilation }) => void;
  exclude: RegExp;
  include: RegExp;
  cwd: string;
}

export interface Graph {
  vertices: NormalModule[];
  arrow: (module: NormalModule) => NormalModule[];
}