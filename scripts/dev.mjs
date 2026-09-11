import { spawn } from 'node:child_process';
import process from 'node:process';

const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';
const children = [];

function run(script) {
  const child = spawn(npmCmd, ['run', script], {
    stdio: 'inherit',
    shell: isWin,
    env: process.env,
  });
  children.push(child);
  return child;
}

const server = run('dev:server');
const client = run('dev:client');
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
}

for (const child of [server, client]) {
  child.on('exit', (code) => {
    if (shuttingDown) return;
    shutdown(code ?? 0);
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
