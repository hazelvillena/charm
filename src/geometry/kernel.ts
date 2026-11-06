import Module from 'manifold-3d';

export type ManifoldApi = Awaited<ReturnType<typeof Module>>;
let api: ManifoldApi | null = null;
let loading: Promise<ManifoldApi> | null = null;

/** Initialise manifold-3d once (async WASM). */
export function getManifold(): Promise<ManifoldApi> {
  if (api) return Promise.resolve(api);
  if (!loading) loading = Module().then((m) => { m.setup(); api = m; return m; });
  return loading;
}
export const manifoldReady = () => api !== null;
