import cors from 'cors';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getEnginePath() {
  const candidates = [
    path.join(__dirname, '..', 'bin', 'pikafish'),
    path.join(__dirname, '..', 'bin', 'pikafish.exe'),
    '/var/task/bin/pikafish'
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return candidates[0];
}

const corsMw = cors({ origin: true });

function runCors(req, res) {
  return new Promise((resolve, reject) => {
    corsMw(req, res, (err) => err ? reject(err) : resolve(true));
  });
}

export default async function handler(req, res) {
  await runCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { fen, depth = 18, movetime = 0 } = req.body || {};
  if (!fen) return res.status(400).json({ error: 'Thiếu fen' });

  const enginePath = getEnginePath();
  if (!fs.existsSync(enginePath)) {
    return res.status(500).json({ error: 'Engine chưa tải, chạy lại deploy' });
  }

  try {
    const bestmove = await getBestMove(enginePath, fen, depth, movetime);
    return res.status(200).json({ bestmove, fen, depth });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

function getBestMove(enginePath, fen, depth, movetime) {
  return new Promise((resolve, reject) => {
    const engine = spawn(enginePath);
    let output = '';
    let best = null;
    const timer = setTimeout(() => {
      engine.kill();
      reject(new Error('Engine timeout'));
    }, 15000);

    engine.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      // Parse bestmove
      const match = text.match(/bestmove\s+(\S+)/);
      if (match) {
        best = match[1];
        clearTimeout(timer);
        engine.kill();
        resolve(best);
      }
    });

    engine.stderr.on('data', (d) => console.error(d.toString()));
    engine.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    // UCI protocol
    engine.stdin.write('uci\n');
    setTimeout(() => {
      engine.stdin.write('isready\n');
      engine.stdin.write(`position fen ${fen}\n`);
      if (movetime > 0) engine.stdin.write(`go movetime ${movetime}\n`);
      else engine.stdin.write(`go depth ${depth}\n`);
    }, 300);
  });
}
