// Hand-in for the make.fun GTA VI trophy guide bounty: copy the static app and its screenshots into the output
// directory, then write the dossier the judge reads. Node 22 runs this TypeScript directly; the standard library is
// all it needs.
import { cpSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-frontend.ts';

const repo = fileURLToPath(new URL('.', import.meta.url));
const output = resolve(process.env.MAKEFUN_OUTPUT_DIR?.trim() || '/output');

try {
  const app = join(repo, 'app');
  const screenshots = join(repo, 'screenshots');
  for (const source of [app, screenshots]) {
    if (!existsSync(source) || !statSync(source).isDirectory()) {
      throw new Error(`missing directory: ${source}`);
    }
  }
  if (output === resolve(repo) || output === resolve(app) || output === resolve(screenshots)) {
    throw new Error(`refusing to use ${output} as the output directory: it would replace the entry's own files`);
  }

  mkdirSync(output, { recursive: true });
  for (const name of ['app', 'screenshots']) {
    rmSync(join(output, name), { recursive: true, force: true });
  }
  cpSync(app, join(output, 'app'), { recursive: true });
  cpSync(screenshots, join(output, 'screenshots'), { recursive: true });

  const dossier = buildDossier(output, { text_max_bytes: 163840 });
  writeFileSync(join(output, 'dossier.json'), dossier);

  console.log(`Wrote ${join(output, 'dossier.json')}`);
} catch (error) {
  console.error(`Hand-in failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
