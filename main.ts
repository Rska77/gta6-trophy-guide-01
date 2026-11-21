import { cpSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildDossier } from './vendor/makefun-frontend.ts';

const repoRoot = import.meta.dirname;
const outputDir = resolve(process.env.MAKEFUN_OUTPUT_DIR || '/output');

function replaceCopy(source: string, target: string): void {
  rmSync(target, { recursive: true, force: true });
  cpSync(source, target, { recursive: true });
}

try {
  if (outputDir === resolve(repoRoot)) {
    throw new Error('refusing to use the repository root as the output directory');
  }
  mkdirSync(outputDir, { recursive: true });
  replaceCopy(join(repoRoot, 'app'), join(outputDir, 'app'));
  replaceCopy(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'));

  const dossier = buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 8, max_bytes: 4 * 1024 * 1024 },
    app_max_files: 993,
    app_max_bytes: 16777216,
  });
  const dossierPath = join(outputDir, 'dossier.json');
  writeFileSync(dossierPath, dossier);

  console.log(`wrote ${dossierPath} (${statSync(dossierPath).size} bytes)`);
  console.log(`app copied to ${join(outputDir, 'app')}`);
  console.log(`screenshots copied to ${join(outputDir, 'screenshots')}`);
} catch (error) {
  console.error(`main.ts failed: ${(error as Error).message}`);
  process.exitCode = 1;
}
