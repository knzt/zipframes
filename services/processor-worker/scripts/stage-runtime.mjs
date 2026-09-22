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

const copyPackage = (name, resolver) => {
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

  const manifest = JSON.parse(readFileSync(path.join(source, 'package.json'), 'utf8'));
  const dependencyResolver = createRequire(path.join(source, 'package.json'));
  for (const dependency of Object.keys(manifest.dependencies ?? {})) {
    copyPackage(dependency, dependencyResolver);
  }
};

rmSync(path.join(serviceRoot, '.runtime'), { recursive: true, force: true });
mkdirSync(destinationRoot, { recursive: true });

const root = JSON.parse(readFileSync(path.join(serviceRoot, 'package.json'), 'utf8'));
for (const dependency of Object.keys(root.dependencies)) {
  copyPackage(dependency, require);
}
