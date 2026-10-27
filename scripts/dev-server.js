// Runs the API server and restarts it when server/*.js or .env changes, for `npm run dev`.
// Not `node --watch`: on Windows it also fires when a file is merely read (the last-access time changes after
// the machine sat idle) and restarted the server in the middle of requests. Comparing modification times doesn't.
import { spawn } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const serverDir = path.join(root, 'server');
const args = ['--env-file-if-exists=.env', 'server/index.js', ...process.argv.slice(2)];
const POLL_MS = 500;

/** Modification times of everything that should restart the server; a missing .env counts too. */
function snapshot() {
  const files = [...readdirSync(serverDir).filter((f) => f.endsWith('.js')).map((f) => path.join(serverDir, f)), path.join(root, '.env')];
  return files
    .map((file) => {
      try {
        return `${file}:${statSync(file).mtimeMs}`;
      } catch {
        return `${file}:none`;
      }
    })
    .join('\n');
}

let child = null;
let restarting = false;
let stopping = false;

function start() {
  child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit' });
  child.on('exit', (code) => {
    child = null;
    if (restarting) {
      restarting = false;
      start();
    } else if (!stopping) {
      console.log(`Сервер остановился (код ${code}). Перезапущу, как только изменится server/ или .env.`);
    }
  });
}

function restart() {
  console.log('Изменился server/ или .env, перезапускаю сервер…');
  if (child) {
    restarting = true;
    child.kill();
  } else {
    start();
  }
}

// An editor may save in several steps, so a change counts once the files have stayed the same for one more poll.
let seen = snapshot();
let changed = null;
setInterval(() => {
  const now = snapshot();
  if (now !== seen) {
    seen = now;
    changed = now;
  } else if (changed === now) {
    changed = null;
    restart();
  }
}, POLL_MS);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true;
    child?.kill();
    process.exit(0);
  });
}

start();
