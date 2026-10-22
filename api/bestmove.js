import { execSync } from 'child_process';
import fs from 'fs';
import { spawn } from 'child_process';

const BIN_URL='https://github.com/official-pikafish/Pikafish/releases/latest/download/pikafish-ubuntu-x86-64-avx2';
const NNUE_URL='https://github.com/official-pikafish/Pikafish/releases/latest/download/pikafish.nnue';
const BIN='/tmp/pikafish';
const NNUE='/tmp/pikafish.nnue';

async function ensureFiles(){
 if(!fs.existsSync(BIN)){
  console.log('Downloading Pikafish binary...');
  try{
   execSync(`curl -L -o ${BIN} ${BIN_URL}`,{stdio:'inherit'});
   execSync(`chmod +x ${BIN}`,{stdio:'inherit'});
  }catch(e){
   const fb='https://github.com/official-pikafish/Pikafish/releases/download/v2024.06.15/pikafish-ubuntu-x86-64-avx2';
   execSync(`curl -L -o ${BIN} ${fb}`,{stdio:'inherit'});
   execSync(`chmod +x ${BIN}`,{stdio:'inherit'});
  }
 }
 if(!fs.existsSync(NNUE)){
  console.log('Downloading NNUE file (22MB)...');
  try{
   execSync(`curl -L -o ${NNUE} ${NNUE_URL}`,{stdio:'inherit'});
  }catch(e){
   // fallback từ test.pikafish.org
   execSync(`curl -L -o ${NNUE} https://test.pikafish.org/pikafish.nnue`,{stdio:'inherit'});
  }
 }
}

function getBestMove(fen,time){
 return new Promise(async(res,rej)=>{
  await ensureFiles();
  console.log('Spawning Pikafish...');
  const eng=spawn(BIN);
  let best=null;
  const timeout=setTimeout(()=>{
   eng.kill();
   rej('Engine timeout');
  },time+5000);

  eng.stdout.on('data',d=>{
   const txt=d.toString();
   console.log('Engine out:',txt);
   for(let line of txt.split('\n')){
    line=line.trim();
    if(line.startsWith('bestmove')){
     clearTimeout(timeout);
     eng.kill();
     const m=line.split(' ')[1];
     console.log('Bestmove:',m);
     res(m);
    }
   }
  });

  eng.stderr.on('data',d=>console.log('Engine err:',d.toString()));

  eng.stdin.write('uci\n');
  setTimeout(()=>{
   eng.stdin.write(`setoption name EvalFile value ${NNUE}\n`);
   eng.stdin.write(`isready\n`);
  },500);

  setTimeout(()=>{
   eng.stdin.write(`position fen ${fen}\n`);
   eng.stdin.write(`go movetime ${time}\n`);
  },1000);
 });
}

export default async function handler(req,res){
 res.setHeader('Access-Control-Allow-Origin','*');
 res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
 res.setHeader('Access-Control-Allow-Headers','Content-Type');
 if(req.method==='OPTIONS') return res.status(200).end();

 try{
  const {fen,time=1000}=req.body||{};
  if(!fen) return res.status(400).json({error:'Thiếu FEN'});
  
  console.log('Request FEN:',fen);
  const bm=await getBestMove(fen,time);
  
  if(!bm || bm==='(none)'){
   return res.status(200).json({bestmove:null,error:'No move from engine'});
  }

  return res.status(200).json({
   bestmove:bm,
   from:bm.slice(0,2),
   to:bm.slice(2,4),
   engine:'Pikafish-Official-3200-NNUE',
   time
  });
 }catch(e){
  console.error('Error:',e);
  return res.status(500).json({error:e.toString(),bestmove:null});
 }
}
