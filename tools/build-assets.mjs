import { build } from 'esbuild';
import { readFile, readdir, writeFile } from 'node:fs/promises';

await Promise.all([
  bundle('editor', 'CodeMirror and dependencies'),
  bundle('deflate', 'fflate'),
]);

async function bundle(name, description) {
  const result = await build({
    entryPoints: [`src/${name}.js`],
    bundle: true,
    minify: true,
    format: 'esm',
    target: 'es2022',
    outfile: `docs/assets/${name}.js`,
    banner: { js: `/* ${description}: see ${name}.LICENSES.txt. */` },
    metafile: true,
  });

  const packages = new Set();
  for (const file of Object.keys(result.metafile.inputs)) {
    const match = file.match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//);
    if (match) packages.add(match[1]);
  }
  const notices = [];
  for (const path of [...packages].sort()) {
    const manifest = JSON.parse(await readFile(`${path}/package.json`, 'utf8'));
    const license = (await readdir(path)).find(file => /^license(?:\.[a-z]+)?$/i.test(file));
    if (!license) throw new Error(`Missing license file for ${manifest.name}`);
    notices.push(`${manifest.name} ${manifest.version}\n${'-'.repeat(60)}\n${(await readFile(`${path}/${license}`, 'utf8')).trim()}`);
  }
  await writeFile(`docs/assets/${name}.LICENSES.txt`, `${notices.join('\n\n')}\n`);
}
