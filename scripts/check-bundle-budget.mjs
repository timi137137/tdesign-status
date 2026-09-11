import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve('dist');
const manifest = JSON.parse(readFileSync(resolve(dist, '.vite/manifest.json'), 'utf8'));
const entry = manifest['index.html'] || Object.values(manifest).find((item) => item.isEntry);

if (!entry) {
  throw new Error('未找到 Vite manifest 入口');
}

const visited = new Set();
const css = new Set();
const files = [];

const visit = (item) => {
  if (!item || visited.has(item.file)) return;
  visited.add(item.file);
  files.push(item.file);
  item.css?.forEach((file) => css.add(file));
  item.imports?.forEach((key) => visit(manifest[key]));
};

visit(entry);

const gzipSize = (file) => gzipSync(readFileSync(resolve(dist, file))).byteLength;
const jsBytes = files.reduce((total, file) => total + gzipSize(file), 0);
const cssBytes = [...css].reduce((total, file) => total + gzipSize(file), 0);
const kb = (bytes) => (bytes / 1024).toFixed(1);

console.log(`初始 JS gzip: ${kb(jsBytes)} KiB`);
console.log(`初始 CSS gzip: ${kb(cssBytes)} KiB`);

const errors = [];
if (jsBytes > 120 * 1024) errors.push(`初始 JS 超过 120 KiB（${kb(jsBytes)} KiB）`);
if (cssBytes > 25 * 1024) errors.push(`初始 CSS 超过 25 KiB（${kb(cssBytes)} KiB）`);

for (const item of Object.values(manifest)) {
  if (!item.file?.endsWith('.js') || item.isEntry) continue;
  const size = gzipSize(item.file);
  if (size > 90 * 1024) errors.push(`${item.file} 超过单路由 90 KiB（${kb(size)} KiB）`);
}

if (errors.length) {
  throw new Error(`包体预算失败：\n- ${errors.join('\n- ')}`);
}

