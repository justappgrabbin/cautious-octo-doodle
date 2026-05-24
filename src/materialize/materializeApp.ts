// materializeApp.ts
// Real app materialization — creates deployable bundles
// Connected to Supabase for persistence

import { SynthiaAPI } from './apiClient';

export interface MaterializedApp {
  id: string;
  name: string;
  source: string;
  type: 'html' | 'react' | 'python' | 'component';
  manifest: {
    entry: string;
    dependencies: string[];
    assets: string[];
    size: number;
  };
  createdAt: string;
  deployed: boolean;
  deployUrl?: string;
}

export async function materializeApp(config: {
  name: string;
  source: string;
  type: 'html' | 'react' | 'python' | 'component';
}): Promise<MaterializedApp> {
  // Parse source for real dependencies
  const deps = extractDependencies(config.source);
  const assets = extractAssets(config.source);

  const app: MaterializedApp = {
    id: 'app_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    name: config.name,
    source: config.source,
    type: config.type,
    manifest: {
      entry: config.type === 'html' ? 'index.html' : config.type === 'react' ? 'App.tsx' : 'main.py',
      dependencies: deps,
      assets: assets,
      size: config.source.length,
    },
    createdAt: new Date().toISOString(),
    deployed: false,
  };

  // Save to Supabase immediately
  await SynthiaAPI.saveToSupabase('apps', app);

  return app;
}

export async function saveGeneratedApp(app: MaterializedApp): Promise<void> {
  await SynthiaAPI.saveToSupabase('apps', {
    ...app,
    updatedAt: new Date().toISOString(),
  });
}

export async function loadApp(id: string): Promise<MaterializedApp | null> {
  const result = await SynthiaAPI.loadFromSupabase('apps', { id });
  return result.data?.[0] || null;
}

export async function listApps(): Promise<MaterializedApp[]> {
  const result = await SynthiaAPI.loadFromSupabase('apps');
  return result.data || [];
}

function extractDependencies(source: string): string[] {
  const deps = new Set<string>();
  const imports = [...source.matchAll(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/g)];
  imports.forEach(m => {
    const pkg = m[1].split('/')[0];
    if (!pkg.startsWith('.') && !pkg.startsWith('@/')) deps.add(pkg);
  });
  return Array.from(deps);
}

function extractAssets(source: string): string[] {
  const assets = new Set<string>();
  const urls = [...source.matchAll(/url\(['"]?([^'"\)]+)['"]?\)/g)];
  const srcs = [...source.matchAll(/src=['"]([^'"]+)['"]/g)];
  urls.forEach(m => assets.add(m[1]));
  srcs.forEach(m => assets.add(m[1]));
  return Array.from(assets);
}
