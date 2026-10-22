import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BIN_DIR = path.join(__dirname, '..', 'bin');
const BIN_PATH = path.join(BIN_DIR, process.platform === 'win32' ? 'pikafish.exe' : 'pikafish');

// Link engine Pikafish chính thức - bản Linux cho Vercel
const ENGINE_URLS = [
  'https://github.com/official-pikafish/Pikafish/releases/download/R2024-05-12/pikafish-avx2',
  'https://github.com/official-pikafish/Pikafish/releases/latest/download/pikafish'
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    console.log('Downloading:', url);
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { 'User-Agent': 'pikafish-installer' } }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.close();
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed ${res.statusCode} for ${url}`));
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          fs.chmodSync(dest, 0o755);
          resolve(true);
        });
      });
    }).on('error', reject);
  });
}

async function main() {
  if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true });
  
  if (fs.existsSync(BIN_PATH)) {
    console.log('Engine already exists:', BIN_PATH);
    return;
  }

  for (const url of ENGINE_URLS) {
    try {
      await download(url, BIN_PATH);
      console.log('Done! Engine at', BIN_PATH);
      return;
    } catch (e) {
      console.warn('Try next URL:', e.message);
    }
  }
  console.error('Không tải được engine, Vercel sẽ thử lại lúc build');
}

main();
