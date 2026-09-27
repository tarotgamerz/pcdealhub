import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const HOST = '127.0.0.1';
const PORT = Number(process.env.TAROTAI_BRIDGE_PORT || 8788);
const TOKEN = process.env.TAROTAI_BRIDGE_TOKEN || '';
const ROOT = path.resolve(process.env.TAROTAI_WORKDIR || process.cwd());
const COMMANDS = new Set((process.env.TAROTAI_ALLOWED_COMMANDS || '').split(',').map(v => v.trim()).filter(Boolean));

function json(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(data);
}

function safePath(raw) {
  const resolved = path.resolve(ROOT, raw || '.');
  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) throw new Error('Path escapes TAROTAI_WORKDIR');
  return resolved;
}

function authorized(req) {
  return Boolean(TOKEN) && req.headers.authorization === 'Bearer ' + TOKEN;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

async function execute(payload) {
  const capability = payload.capability;
  const action = payload.action;
  const args = payload.arguments || {};

  if (capability === 'filesystem') {
    if (action === 'list') {
      const entries = await fs.readdir(safePath(args.path || '.'), { withFileTypes: true });
      return { entries: entries.map(e => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })) };
    }
    if (action === 'read') {
      const target = safePath(args.path);
      const stat = await fs.stat(target);
      if (stat.size > 5000000) throw new Error('Refusing to read files larger than 5 MB');
      return { path: target, text: await fs.readFile(target, 'utf8') };
    }
    if (action === 'write') {
      const target = safePath(args.path);
      const text = String(args.text ?? '');
      if (text.length > 5000000) throw new Error('Refusing to write files larger than 5 MB');
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, text, 'utf8');
      return { path: target, bytes: Buffer.byteLength(text), status: 'written' };
    }
    throw new Error('Unsupported filesystem action');
  }

  if (capability === 'terminal' && action === 'run') {
    const command = String(args.command || '').trim();
    if (!command) throw new Error('command is required');
    const parts = command.split(/\s+/);
    const program = parts.shift();
    if (!program || !COMMANDS.has(program)) throw new Error("Command '" + program + "' is not in TAROTAI_ALLOWED_COMMANDS");
    const result = await execFileAsync(program, parts, { cwd: ROOT, timeout: 60000, maxBuffer: 2000000, windowsHide: true });
    return { stdout: result.stdout, stderr: result.stderr, status: 'completed' };
  }

  throw new Error('Unsupported capability/action');
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    return json(res, 200, { ok: true, host: HOST, port: PORT, workdir: ROOT, tokenConfigured: Boolean(TOKEN), allowedCommands: [...COMMANDS] });
  }
  if (req.method === 'POST' && req.url === '/execute') {
    if (!authorized(req)) return json(res, 401, { error: 'Unauthorized' });
    try {
      const payload = await readBody(req);
      return json(res, 200, { ok: true, result: await execute(payload) });
    } catch (error) {
      return json(res, 400, { ok: false, error: error instanceof Error ? error.message : 'Execution failed' });
    }
  }
  return json(res, 404, { error: 'Not found' });
});

server.listen(PORT, HOST, () => {
  console.log('tarotai bridge listening on http://' + HOST + ':' + PORT);
  console.log('workdir: ' + ROOT);
  console.log('allowed commands: ' + ([...COMMANDS].join(', ') || '(none)'));
});
