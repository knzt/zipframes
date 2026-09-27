import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(serviceRoot, 'package.json'));
const destinationRoot = path.join(serviceRoot, '.runtime/node_modules');
const seen = new Set();

const packageRootFrom = (resolver, name) => {
  const entry = resolver.resolve(name);
  let directory = path.dirname(entry);
  while (directory !== path.dirname(directory)) {
    const manifestPath = path.join(directory, 'package.json');
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (manifest.name === name) {
        return directory;
      }
    }
    directory = path.dirname(directory);
  }
  throw new Error(`package root not found for ${name}`);
};

const copyPackage = (name, resolver, { recurse = true } = {}) => {
  if (seen.has(name)) {
    return;
  }
  seen.add(name);

  let source;
  try {
    source = packageRootFrom(resolver, name);
  } catch {
    return;
  }

  const destination = path.join(destinationRoot, name);
  mkdirSync(path.dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: true, dereference: true });

  if (!recurse) {
    return;
  }

  const manifest = JSON.parse(readFileSync(path.join(source, 'package.json'), 'utf8'));
  const dependencyResolver = createRequire(path.join(source, 'package.json'));
  for (const dependency of Object.keys(manifest.dependencies ?? {})) {
    copyPackage(dependency, dependencyResolver);
  }
};

const assertStagedMatchesService = (directDependencies) => {
  for (const name of directDependencies) {
    let expectedRoot;
    try {
      expectedRoot = packageRootFrom(require, name);
    } catch {
      continue;
    }
    const expected = JSON.parse(readFileSync(path.join(expectedRoot, 'package.json'), 'utf8'));
    const stagedManifest = path.join(destinationRoot, name, 'package.json');
    if (!existsSync(stagedManifest)) {
      throw new Error(`stage-runtime did not copy ${name}`);
    }
    const staged = JSON.parse(readFileSync(stagedManifest, 'utf8'));
    if (staged.version !== expected.version) {
      throw new Error(
        `staged ${name}@${staged.version} does not match the service resolution ${name}@${expected.version}`,
      );
    }
  }
};

rmSync(path.join(serviceRoot, '.runtime'), { recursive: true, force: true });
mkdirSync(destinationRoot, { recursive: true });

const root = JSON.parse(readFileSync(path.join(serviceRoot, 'package.json'), 'utf8'));
const directDependencies = Object.keys(root.dependencies);

// Copy the service's own production versions first. Recursing from
// `@zipframes/communication` (or schemas/telemetry) would otherwise pin
// nested `@zipframes/core@0.2.0` and skip the worker's `^0.4.0`.
for (const dependency of directDependencies) {
  copyPackage(dependency, require, { recurse: false });
}
for (const dependency of directDependencies) {
  let source;
  try {
    source = packageRootFrom(require, dependency);
  } catch {
    continue;
  }
  const manifest = JSON.parse(readFileSync(path.join(source, 'package.json'), 'utf8'));
  const dependencyResolver = createRequire(path.join(source, 'package.json'));
  for (const nested of Object.keys(manifest.dependencies ?? {})) {
    copyPackage(nested, dependencyResolver);
  }
}

assertStagedMatchesService(directDependencies);
