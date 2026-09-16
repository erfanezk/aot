import './build-motion.mjs';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const macBinary = '/Applications/Blender.app/Contents/MacOS/Blender';
const blender = process.env.BLENDER || (existsSync(macBinary) ? macBinary : 'blender');
const script = fileURLToPath(new URL('./blender/build_characters.py', import.meta.url));
const selected = process.argv.slice(2);
const allowed = new Set(['eren', 'attack-titan', 'pure-titan']);
if (selected.some(name => !allowed.has(name))) throw new Error('Choose eren, attack-titan, or pure-titan.');
const args = ['--background', '--python-exit-code', '1', '--python', script, ...(selected.length ? ['--', ...selected] : [])];
const result = spawnSync(blender, args, { stdio: 'inherit' });
if (result.error) { console.error(`Could not start Blender. Install it or set BLENDER to its executable path. ${result.error.message}`); process.exit(1); }
process.exit(result.status ?? 1);
