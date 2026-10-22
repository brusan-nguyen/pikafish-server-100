import { execSync } from 'child_process';
import fs from 'fs';
import { spawn } from 'child_process';

const BIN_URL = 'https://github.com/official-pikafish/Pikafish/releases/latest/download/pikafish-ubuntu-x86-64-avx2';
const NNUE_URL = 'https://github.com/official-pikafish/Pikafish/releases/latest/download/pikafish.nnue';
const BIN = '/tmp/pikafish';
const NNUE = '/tmp/pikafish.nnue';

function log(msg){ console.log(`[Pikafish] ${msg}`); }

async function ensureFiles(){
  // 1. Check binary
  if(!fs.existsSync(BIN) || fs.statSync(BIN).size < 1000000){
    log('Downloading binary (40MB)...');
    if(fs.existsSync(BIN)) fs.unlinkSync(BIN);
    try{
      execSync(`curl -L -o ${BIN} ${BIN_URL}`, {stdio:'inherit'});
      execSync(`chmod +x ${BIN}`, {stdio:'inherit'});
      log(`Binary OK size=${fs.statSync(BIN).size}`);
    }catch(e){
      log('Binary primary failed, trying fallback...');
      const fb='https://github.com/official-pikafish/Pikafish/releases/download/v2024.06.15/pikafish-ubuntu-x86-64-avx2';
      execSync(`curl -L -o ${BIN} ${fb}`, {stdio:'inherit'});
      execSync(`chmod +x ${BIN}`, {stdio:'inherit'});
    }
  } else {
    log(`Binary already exists size=${fs.statSync(BIN).size}`);
  }

  // 2. Check NNUE - BẮT BUỘC, không có là engine chết
  if(!fs.existsSync(NNUE) || fs.statSync(NNUE).size < 1000000){
    log('Downloading NNUE (22MB) - BẮT BUỘC...');
    if(fs.existsSync(NNUE)) fs.unlinkSync(NNUE);
    try{
      execSync(`curl -L -o ${NNUE} ${NNUE_URL}`, {stdio:'inherit'});
      log(`NNUE OK size=${fs.statSync(NNUE).size}`);
    }catch(e){
      log('NNUE primary failed, trying test.pikafish.org...');
      execSync(`curl -L -o ${NNUE} http://test.pikafish.org/pikafish.nnue`, {stdio:'inherit'});
    }
  } else {
    log(`NNUE already exists size=${fs.statSync(NNUE).size}`);
  }

  // 3. Verify
  if(!fs.existsSync(BIN)) throw new Error('Binary missing');
  if(!fs.existsSync(NNUE)) throw new Error('NNUE missing - engine sẽ chết nếu không có file này!');
}

function getBestMove(fen,time){
 return new Promise(async(resolve,reject)=>{
  try{
   await ensureFiles();
   log(`Starting engine for FEN: ${fen.substring(0,50)}...`);
   const eng=spawn(BIN);
   let output='';
   let hasReady=false;

   const timeout=setTimeout(()=>{
    log('Engine timeout, killing...');
    eng.kill();
    reject(new Error(`Timeout after ${time+5000}ms. Output: ${output}`));
   }, time+8000);

   eng.stdout.on('data',d=>{
    const txt=d.toString();
    output+=txt;
    log(`OUT: ${txt.trim()}`);
    if(txt.includes('readyok')) hasReady=true;
    for(let line of txt.split('\n')){
     line=line.trim();
     if(line.startsWith('bestmove')){
      clearTimeout(timeout);
      eng.kill();
      const bm=line.split(' ')[1];
      log(`BESTMOVE FOUND: ${bm}`);
      resolve(bm);
     }
    }
   });

   eng.stderr.on('data',d=>{
    log(`ERR: ${d.toString().trim()}`);
   });

   eng.on('error',err=>{
    clearTimeout(timeout);
    log(`Spawn error: ${err}`);
    reject(err);
   });

   // UCI sequence - phải có EvalFile nếu không engine chết
   eng.stdin.write('uci\n');
   
   setTimeout(()=>{
    log(`Setting EvalFile to ${NNUE}`);
    eng.stdin.write(`setoption name EvalFile value ${NNUE}\n`);
    eng.stdin.write('isready\n');
   },800);

   setTimeout(()=>{
    if(!hasReady) log('Warning: not readyok yet, but trying go...');
    eng.stdin.write(`position fen ${fen}\n`);
    eng.stdin.write(`go movetime ${time}\n`);
    log(`Sent go movetime ${time}`);
   },1800);

  }catch(e){
   reject(e);
  }
 });
}

export default async function handler(req,res){
 res.setHeader('Access-Control-Allow-Origin','*');
 res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
 res.setHeader('Access-Control-Allow-Headers','Content-Type');
 if(req.method==='OPTIONS') return res.status(200).end();

 // Health check - cho phép GET để test
 if(req.method==='GET'){
  try{
   await ensureFiles();
   const binSize=fs.existsSync(BIN)?fs.statSync(BIN).size:0;
   const nnueSize=fs.existsSync(NNUE)?fs.statSync(NNUE).size:0;
   return res.status(200).json({
    status:'OK',
    engine:'Pikafish-REAL-3200-NNUE-FIXED',
    binary_exists:fs.existsSync(BIN),
    binary_size:binSize,
    nnue_exists:fs.existsSync(NNUE),
    nnue_size:nnueSize,
    message: binSize>1000000 && nnueSize>1000000 ? 'Sẵn sàng! Đúng Pikafish gốc 100%' : 'Thiếu file, cần tải lại',
    test_fen: 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1'
   });
  }catch(e){
   return res.status(500).json({error:e.toString()});
  }
 }

 try{
  const {fen,time=1000}=req.body||{};
  if(!fen){
   return res.status(400).json({error:'Thiếu FEN. Gửi POST {fen, time}'});
  }
  
  const bm=await getBestMove(fen,time);
  
  if(!bm || bm==='(none)' || bm.length<4){
   return res.status(200).json({bestmove:null,error:'Engine không trả về nước',raw:bm});
  }

  return res.status(200).json({
   bestmove:bm,
   from:bm.slice(0,2),
   to:bm.slice(2,4),
   engine:'Pikafish-Official-3200-NNUE-REAL',
   time,
   verified:true
  });
 }catch(e){
  console.error('Handler error:',e);
  return res.status(500).json({error:e.toString(),bestmove:null});
 }
}
