#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getBuildNumber() {
  if (process.env.GITHUB_RUN_NUMBER) return process.env.GITHUB_RUN_NUMBER;
  try {
    const out = execSync('git rev-list --count HEAD', { encoding: 'utf8' }).trim();
    if (out) return out;
  } catch (e) {
    // ignore
  }
  // fallback to timestamp
  return Math.floor(Date.now() / 1000).toString();
}

function updateTomlFile(filePath, updater) {
  const content = fs.readFileSync(filePath, { encoding: 'utf8' });
  const newContent = updater(content);
  fs.writeFileSync(filePath, newContent, { encoding: 'utf8' });
}

function updateJsonFile(filePath, updater) {
  const content = fs.readFileSync(filePath, { encoding: 'utf8' });
  let data;
  try {
    data = JSON.parse(content);
  } catch (e) {
    console.error(`Failed to parse JSON in ${filePath}:`, e.message);
    process.exit(1);
  }
  const newData = updater(data);
  fs.writeFileSync(filePath, JSON.stringify(newData, null, 2) + '\n', { encoding: 'utf8' });
}

function main() {
  // Prefer an explicit version if provided (e.g., from a tag or env)
  const tagRef = process.env.GITHUB_REF || '';
  let newVersion =
    process.env.BASITUNE_VERSION ||
    (tagRef.startsWith('refs/tags/v') ? tagRef.replace('refs/tags/v', '') : null);

  // Fallback to incremental build number if no tag/env version is available
  if (!newVersion) {
    const buildNum = getBuildNumber();
    newVersion = `0.1.${buildNum}`;
  }

  console.log(`Setting build version to ${newVersion}`);

  const repoRoot = path.resolve(__dirname, '..');
  const packageJsonPath = path.join(repoRoot, 'package.json');
  const tauriConfPath = path.join(repoRoot, 'src-tauri', 'tauri.conf.json');
  const cargoTomlPath = path.join(repoRoot, 'src-tauri', 'Cargo.toml');

  updateJsonFile(packageJsonPath, (pkg) => {
    pkg.version = newVersion;
    return pkg;
  });

  updateJsonFile(tauriConfPath, (cfg) => {
    cfg.version = newVersion;
    if (cfg.package && typeof cfg.package === 'object') {
      cfg.package.version = newVersion;
    }
    return cfg;
  });

  updateTomlFile(cargoTomlPath, (content) => {
    return content.replace(/^version\s*=\s*"[^"]*"/m, `version = "${newVersion}"`);
  });

  console.log('Version fields updated in package.json, tauri.conf.json, and Cargo.toml');
}

main();
