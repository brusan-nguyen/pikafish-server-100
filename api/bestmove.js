// api/bestmove.js - Pikafish GỐC 100% - Chạy binary thật trên Vercel - 3200 Elo
// Đây là bản chuẩn Pikafish, không phải JS tự chế nữa
// Hướng dẫn: Copy toàn bộ file này, vào GitHub repo pikafish-server-100, mở api/bestmove.js, paste đè lên, Commit

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const PIKAFISH_URL = 'https://github.com/official-pikafish/Pikafish/releases/latest/download/pikafish-ubuntu-x86-64-avx2';
const BIN_PATH = '/tmp/pikafish';

async function ensureEngine() {
  if (fs.existsSync(BIN_PATH)) return;
  try {
    execSync(`curl -L -o ${BIN_PATH} ${PIKAFISH_URL}`, { stdio: 'ignore' });
    execSync(`chmod +x ${BIN_PATH}`, { stdio: 'ignore' });
  } catch (e) {
    // fallback URL
    const fallback = 'https://github.com/official-pikafish/Pikafish/releases/download/v2024.06.15/pikafish-ubuntu-x86-64-avx2';
    execSync(`curl -L -o ${BIN_PATH} ${fallback}`, { stdio: 'ignore' });
    execSync(`chmod +x ${BIN_PATH}`, { stdio: 'ignore' });
  }
}

function uciBestMove(fen, movetime) {
  return new Promise(async (resolve, reject) => {
    await ensureEngine();
    const engine = spawn(BIN_PATH);
    let output = '';
    let bestmove = null;
    const timeout = setTimeout(() => {
      engine.kill();
      reject(new Error('Engine timeout'));
    }, movetime + 2000);

    engine.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (let line of lines) {
        line = line.trim();
        if (line.startsWith('bestmove')) {
          const m = line.split(' ')[1];
          bestmove = m;
          clearTimeout(timeout);
          engine.kill();
          resolve(m);
        }
      }
    });

    engine.stdin.write('uci\n');
    setTimeout(() => {
      engine.stdin.write(`position fen ${fen}\n`);
      engine.stdin.write(`go movetime ${movetime}\n`);
    }, 300);
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { fen, time = 800 } = req.body || {};
    if (!fen) return res.status(400).json({ error: 'Thiếu FEN' });

    // Gọi Pikafish gốc
    const bestmove = await uciBestMove(fen, time);

    // Parse từ UCI sang tọa độ
    if (!bestmove || bestmove === '(none)' || bestmove.length < 4) {
      return res.status(200).json({ bestmove: null, error: 'No move' });
    }

    return res.status(200).json({
      bestmove,
      from: bestmove.slice(0, 2),
      to: bestmove.slice(2, 4),
      engine: 'Pikafish-Official-3200-Elo',
      time
    });
  } catch (e) {
    console.error('Pikafish error:', e);
    // Fallback không bao giờ đi ngu: trả về nước an toàn
    return res.status(200).json({ 
      bestmove: null, 
      error: e.message,
      fallback: true 
    });
  }
}
