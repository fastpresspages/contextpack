// Zero-dep link checker: verifies every internal href/src in site/*.html resolves.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('..', import.meta.url));
const siteDir = join(here, 'site');
const pages = ['index.html', 'privacy.html', 'terms.html', '404.html'];
let bad = 0;
let total = 0;

for (const page of pages) {
  const filePath = join(siteDir, page);
  if (!existsSync(filePath)) {
    console.log(`Page file missing: ${page}`);
    bad++;
    continue;
  }
  const html = readFileSync(filePath, 'utf8');
  const refs = [...html.matchAll(/(?:href|src)="([^"#]+?)(?:#[^"]*)?"/g)].map(m => m[1]);
  const seen = new Set();
  for (const ref of refs) {
    if (seen.has(ref)) continue;
    seen.add(ref);
    if (/^(https?:)?\/\//i.test(ref) || ref.startsWith('mailto:') || ref.startsWith('data:')) continue;
    total++;
    const clean = ref.split('?')[0];
    const target = resolve(siteDir, clean);
    if (!target.startsWith(siteDir) || !existsSync(target)) {
      bad++;
      console.log(`BROKEN in ${page}: ${ref} -> ${target}`);
    }
  }
}

console.log(`${total - bad}/${total} internal refs OK across ${pages.length} pages`);
process.exit(bad ? 1 : 0);
