/* ============================================================
   VOXELHEIM 2 — Les Chroniques de l'Éveil
   Moteur : monde, rendu, joueur, tactile (Pointer Events), sauvegarde
   ============================================================ */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { B, BLOCKS, ITEMS, RECIPES, defaultKey, BIOMES, PAGES, TOOL_TYPES, TOOL_MATS } from './content.js';

/* ---------- Réglages ---------- */
const SET_KEY = 'voxelheim2_settings';
const DEFAULT_KEYS = {
  forward:['KeyW','KeyZ'], back:['KeyS'], left:['KeyA','KeyQ'], right:['KeyD'],
  jump:['Space'], sprint:['ShiftLeft'], inv:['KeyE'], lore:['KeyL'], eat:['KeyF']
};
const settings = Object.assign({
  res:'native', dist:0, fov:72, shadows:'high', bloom:true, clouds:true,
  particles:'high', motes:true, fpsCap:0, showFps:false, keys:{}
}, (()=>{ try { return JSON.parse(localStorage.getItem(SET_KEY)) || {}; } catch(e){ return {}; } })());
settings.keys = Object.assign({}, DEFAULT_KEYS, settings.keys || {});
function saveSettings(){ try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch(e){} }

const CHUNK = 16, HEIGHT = 64;
const IS_TOUCH = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
let RADIUS = settings.dist || (IS_TOUCH ? 2 : 5);
const SEA = 13;
const SAVE_KEY = 'voxelheim2_save';

/* ---------- Sauvegarde ---------- */
let save = null;
try { save = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch(e){ save = null; }
let seed = save?.seed ?? ((Math.random()*1e9)|0);
const collectedPages = new Set(save?.pages ?? []);
const editsByChunk = new Map();
if (save?.edits) for (const ck of Object.keys(save.edits)){
  const m = new Map();
  for (const k of Object.keys(save.edits[ck])) m.set(k, save.edits[ck][k]);
  editsByChunk.set(ck, m);
}
let worldDirty = false;

function persist(){
  const edits = {};
  for (const [ck,m] of editsByChunk){ edits[ck] = {}; for (const [k,v] of m) edits[ck][k]=v; }
  const data = {
    seed, edits, pages:[...collectedPages], heart: player.heart,
    inv: inv.map(s=>s?{...s}:null),
    px: player.pos.x, py: player.pos.y, pz: player.pos.z,
    hp: player.hp, food: player.food, time: timeOfDay, hotbarSel
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch(e){}
}
setInterval(()=>{ if (worldDirty){ persist(); worldDirty=false; } }, 6000);
addEventListener('visibilitychange', ()=>{ if (document.hidden && worldDirty){ persist(); worldDirty=false; } });
addEventListener('beforeunload', persist);

/* ---------- Bruit ---------- */
function hash(x,z){ let h = x*374761393 + z*668265263 + seed*971; h=(h^(h>>13))*1274126177; return ((h^(h>>16))>>>0)/4294967295; }
function smooth(x,z){
  const xi=Math.floor(x), zi=Math.floor(z), xf=x-xi, zf=z-zi;
  const u=xf*xf*(3-2*xf), v=zf*zf*(3-2*zf);
  const a=hash(xi,zi), b=hash(xi+1,zi), c=hash(xi,zi+1), d=hash(xi+1,zi+1);
  return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;
}
function noise2(x,z){ return smooth(x,z)*0.6 + smooth(x*2.7+31,z*2.7-17)*0.3 + smooth(x*6.1-5,z*6.1+9)*0.1; }

function biomeAt(wx,wz){
  const t = noise2(wx*0.008+500, wz*0.008-500);
  if (t < 0.34) return BIOMES.DUNES;
  if (t < 0.56) return BIOMES.PLAINE;
  if (t < 0.78) return BIOMES.SYLVE;
  return BIOMES.PICS;
}

/* ---------- Monde ---------- */
const chunks = new Map();
const ckey = (cx,cz)=>cx+','+cz;
function getChunk(cx,cz){
  const k=ckey(cx,cz); let c=chunks.get(k);
  if (!c){ c=genChunk(cx,cz); chunks.set(k,c); }
  return c;
}
function genChunk(cx,cz){
  const data = new Uint8Array(CHUNK*CHUNK*HEIGHT);
  for (let lx=0;lx<CHUNK;lx++) for (let lz=0;lz<CHUNK;lz++){
    const wx=cx*CHUNK+lx, wz=cz*CHUNK+lz;
    const bio = biomeAt(wx,wz);
    const h = bio.base + noise2(wx*0.04, wz*0.04)*bio.amp + noise2(wx*0.12+100, wz*0.12)*3;
    const top = Math.floor(h);
    for (let y=0;y<HEIGHT;y++){
      let b = B.AIR;
      if (y<=top-4) b = (y<6+noise2(wx*0.1,wz*0.1)*3) ? B.VIDE : B.ANCRE;
      else if (y<top) b = (bio===BIOMES.DUNES && y>=top-2) ? B.SABLE : B.ANCRE;
      else if (y===top){
        b = bio.surface;
        if (bio.snow && y>=bio.snow) b = B.GIVRE;
        if (top<SEA) b = B.SABLE;
      }
      if (b===B.AIR && y>top && y<=SEA && top<SEA) b = B.EAU;
      if (b===B.ANCRE || b===B.VIDE){
        const r = hash(wx*3+y*7, wz*5-y*11);
        if (y<12 && r>0.994) b = B.AETHERIUM;
        else if (y<20 && r>0.988) b = B.LUMINITE;
        else if (y<28 && r>0.984) b = B.FERROSTEM;
      }
      data[idx(lx,y,lz)] = b;
    }
    // arbres / cactus / champignons
    if (top>10 && top>=SEA && lx>2 && lx<13 && lz>2 && lz<13){
      const r = hash(wx*13,wz*17);
      if (bio.tree && r<bio.tree){
        const th = 4+Math.floor(hash(wx,wz)*3);
        for (let y=1;y<=th;y++) data[idx(lx,top+y,lz)] = B.TRONC;
        for (let dx=-2;dx<=2;dx++) for (let dz=-2;dz<=2;dz++) for (let dy=0;dy<2;dy++){
          const yy=top+th+1+dy;
          if (Math.abs(dx)+Math.abs(dz)+dy<4 && data[idx(lx+dx,yy,lz+dz)]===B.AIR)
            data[idx(lx+dx,yy,lz+dz)] = B.FEUILLAGE;
        }
      } else if (bio===BIOMES.DUNES && r>0.995){
        const th = 2+Math.floor(hash(wx,wz)*2);
        for (let y=1;y<=th;y++) data[idx(lx,top+y,lz)] = B.EPINE;
      } else if (bio.mushrooms && r>0.97 && r<0.985){
        data[idx(lx,top+1,lz)] = B.CHAMPI;
      }
    }
  }
  // ruines des Anciens (par chunk, rare)
  if (hash(cx*7+13, cz*11-7) > 0.86){
    const rx = 4+Math.floor(hash(cx,cz)*6), rz = 4+Math.floor(hash(cx*3,cz*5)*6);
    const wx=cx*CHUNK+rx, wz=cz*CHUNK+rz;
    const bio = biomeAt(wx,wz);
    if (bio!==BIOMES.PICS){
      let ty = HEIGHT-1; while (ty>0 && data[idx(rx,ty,rz)]===B.AIR) ty--;
      const base = ty+1;
      if (base<HEIGHT-6){
        for (let dx=-2;dx<=2;dx++) for (let dz=-2;dz<=2;dz++) data[idx(rx+dx,base-1,rz+dz)] = B.BRIQUE;
        for (const [dx,dz] of [[-2,-2],[2,-2],[-2,2],[2,2],[2,0],[-2,0]]){
          const hh = 1+Math.floor(hash(wx+dx,wz+dz)*3);
          for (let y=0;y<hh;y++) data[idx(rx+dx,base+y,rz+dz)] = B.BRIQUE;
        }
        data[idx(rx,base,rz)] = B.COFFRE;
        if (hash(cx*31,cz*17)>0.5) data[idx(rx+1,base,rz)] = B.LANTERNE;
      }
    }
  }
  // autel naturel (très rare)
  if (hash(cx*5-3, cz*9+1) > 0.994){
    const rx=8, rz=8;
    let ty = HEIGHT-1; while (ty>0 && data[idx(rx,ty,rz)]===B.AIR) ty--;
    data[idx(rx,ty+1,rz)] = B.AUTEL;
    for (let dx=-1;dx<=1;dx++) for (let dz=-1;dz<=1;dz++) data[idx(rx+dx,ty,rz+dz)] = B.BRIQUE;
  }
  // réappliquer les modifications sauvegardées
  const em = editsByChunk.get(ckey(cx,cz));
  if (em) for (const [k,v] of em){
    const [lx,y,lz] = k.split(',').map(Number);
    if (y>=0 && y<HEIGHT) data[idx(lx,y,lz)] = v;
  }
  return { data, mesh:null, dirty:true };
}
const idx = (x,y,z)=>(y*CHUNK+z)*CHUNK+x;
const isSolid = b => b!==B.AIR && b!==B.EAU;

function getBlock(x,y,z){
  if (y<0||y>=HEIGHT) return B.AIR;
  const cx=Math.floor(x/CHUNK), cz=Math.floor(z/CHUNK);
  return getChunk(cx,cz).data[idx(x-cx*CHUNK, y, z-cz*CHUNK)];
}
function setBlock(x,y,z,b){
  if (y<0||y>=HEIGHT) return;
  const cx=Math.floor(x/CHUNK), cz=Math.floor(z/CHUNK);
  const lx=x-cx*CHUNK, lz=z-cz*CHUNK;
  const c=getChunk(cx,cz);
  c.data[idx(lx,y,lz)] = b;
  c.dirty=true;
  const ck=ckey(cx,cz);
  let em = editsByChunk.get(ck);
  if (!em){ em=new Map(); editsByChunk.set(ck,em); }
  em.set(lx+','+y+','+lz, b);
  worldDirty=true;
  if (lx===0) markDirty(cx-1,cz); if (lx===CHUNK-1) markDirty(cx+1,cz);
  if (lz===0) markDirty(cx,cz-1); if (lz===CHUNK-1) markDirty(cx,cz+1);
}
function markDirty(cx,cz){ const c=chunks.get(ckey(cx,cz)); if(c) c.dirty=true; }

/* ---------- Textures & matériaux (DA Aethérium, 32px) ---------- */
function shade(c, d){ return [Math.max(0,Math.min(255,c[0]+d))|0, Math.max(0,Math.min(255,c[1]+d))|0, Math.max(0,Math.min(255,c[2]+d))|0]; }
function rgb(c){ return `rgb(${c[0]},${c[1]},${c[2]})`; }
function texNoise(g, S, base, amp){
  for (let y=0;y<S;y++) for (let x=0;x<S;x++){
    const n = (hash(x*7+base[0], y*13+base[2])*amp*2-amp)|0;
    g.fillStyle = rgb(shade(base,n)); g.fillRect(x,y,1,1);
  }
}
function texVeins(g, S, col, glow){
  for (let i=0;i<5;i++){
    const cx=2+Math.floor(hash(i*31+seed, i*17)* (S-6)), cy=2+Math.floor(hash(i*13, i*41+seed)*(S-6));
    for (let d=0; d<4; d++){
      const px=cx+Math.floor(hash(i,d)*4)-1, py=cy+Math.floor(hash(d,i)*4)-1;
      g.fillStyle = rgb(shade(col, (hash(px,py)*40-20)|0));
      g.fillRect(px,py,2,2);
      if (glow){ g.fillStyle='rgba(255,255,255,.5)'; g.fillRect(px,py,1,1); }
    }
  }
}
function texCracks(g, S, base){
  for (let i=0;i<4;i++){
    let x=Math.floor(hash(i,seed)*S), y=Math.floor(hash(seed,i)*S);
    g.fillStyle = rgb(shade(base,-35));
    for (let s=0;s<8;s++){ g.fillRect(x,y,1,1); x+=hash(i,s)>0.5?1:0; y+=1; if(x>=S||y>=S) break; }
  }
}
function makeTexture(bid, def, face){
  const S=32;
  const cv=document.createElement('canvas'); cv.width=cv.height=S;
  const g=cv.getContext('2d');
  const base = def.all || (face==='top'?def.top:def.side);
  texNoise(g, S, shade(base, def.glow?18:0), def.glow?8:14);
  switch(bid){
    case B.VELOUR:
      if (face==='top'){ g.fillStyle='rgba(150,220,90,.5)'; for (let i=0;i<26;i++){ const x=Math.floor(hash(i,3)*S), y=Math.floor(hash(i,7)*S); g.fillRect(x,y,1,2); } }
      else { g.fillStyle=rgb(def.side); g.fillRect(0,0,S,6); g.fillStyle='rgba(150,220,90,.35)'; for (let i=0;i<18;i++) g.fillRect(Math.floor(hash(i,11)*S), 4+Math.floor(hash(i,5)*3), 1, 2); }
      break;
    case B.TRONC:
      if (face==='top'){ for (let r=14;r>1;r-=3){ g.strokeStyle=rgb(shade(base, r%2?12:-14)); g.beginPath(); g.arc(S/2,S/2,r,0,7); g.stroke(); } }
      else { for (let i=0;i<6;i++){ g.fillStyle=rgb(shade(base,(i%2?10:-18))); g.fillRect(Math.floor(hash(i,seed)*S),0,2+Math.floor(hash(i,2)*2),S); } }
      break;
    case B.PLANCHES:
    case B.ETABLI:
      for (let i=1;i<4;i++){ g.fillStyle='rgba(60,40,20,.55)'; g.fillRect(0,i*8,S,1); }
      g.fillStyle='rgba(255,230,180,.25)'; g.fillRect(3,3,1,1); g.fillRect(3,27,1,1); g.fillRect(28,11,1,1); g.fillRect(28,19,1,1);
      if (bid===B.ETABLI && face!=='top'){ g.strokeStyle='rgba(60,40,20,.7)'; g.strokeRect(4,10,S-8,S-20); g.beginPath(); g.moveTo(4,S/2); g.lineTo(S-4,S/2); g.stroke(); }
      break;
    case B.FEUILLAGE:
      g.fillStyle='rgba(20,50,20,.5)'; for (let i=0;i<14;i++) g.fillRect(Math.floor(hash(i,9)*S), Math.floor(hash(i,4)*S), 2, 2);
      g.fillStyle='rgba(160,230,110,.4)'; for (let i=0;i<10;i++) g.fillRect(Math.floor(hash(i,21)*S), Math.floor(hash(i,8)*S), 1, 1);
      break;
    case B.SABLE:
      g.fillStyle='rgba(255,240,200,.35)'; for (let i=0;i<20;i++) g.fillRect(Math.floor(hash(i,3)*S), Math.floor(hash(i,6)*S), 1, 1);
      g.fillStyle='rgba(160,140,90,.3)'; for (let i=0;i<5;i++) g.fillRect(Math.floor(hash(i,13)*S), Math.floor(hash(i,14)*S), 3, 1);
      break;
    case B.EPINE:
      g.fillStyle='rgba(30,70,30,.6)'; for (let i=0;i<6;i++) g.fillRect(Math.floor((i+0.3)*S/6),0,2,S);
      break;
    case B.GIVRE:
      g.fillStyle='rgba(255,255,255,.8)'; for (let i=0;i<12;i++) g.fillRect(Math.floor(hash(i,2)*S), Math.floor(hash(i,5)*S), 1, 1);
      break;
    case B.GRANIT:
      g.fillStyle='rgba(90,50,40,.35)'; for (let i=0;i<8;i++) g.fillRect(Math.floor(hash(i,8)*S), Math.floor(hash(i,3)*S), 4, 3);
      break;
    case B.BRIQUE:
      g.fillStyle='rgba(70,60,50,.8)';
      for (let r=0;r<4;r++) g.fillRect(0, r*8+7, S, 1);
      for (let r=0;r<4;r++) g.fillRect(((r%2)*8+15)%S, r*8, 1, 8);
      break;
    case B.LUMINITE: case B.AETHERIUM: case B.FERROSTEM:
      texVeins(g, S, def.spots, true); break;
    case B.VIDE:
      texVeins(g, S, [70,60,110], false); texCracks(g, S, base); break;
    case B.ANCRE: case B.HUMUS: texCracks(g, S, base); break;
    case B.CHAMPI:
      g.fillStyle='rgba(230,190,255,.5)'; for (let i=0;i<8;i++){ const x=Math.floor(hash(i,4)*S), y=Math.floor(hash(i,6)*S); g.fillRect(x,y,3,3); }
      break;
    case B.LANTERNE: {
      const gr=g.createRadialGradient(S/2,S/2,2,S/2,S/2,S/2);
      gr.addColorStop(0,'rgba(255,255,230,.95)'); gr.addColorStop(.6,rgb(base)); gr.addColorStop(1,rgb(shade(base,-40)));
      g.fillStyle=gr; g.fillRect(0,0,S,S);
      g.strokeStyle='rgba(120,80,30,.9)'; g.lineWidth=2; g.strokeRect(1,1,S-2,S-2);
      break; }
    case B.CRISTAL: {
      const gr=g.createRadialGradient(S/2,S/2,1,S/2,S/2,S/2);
      gr.addColorStop(0,'rgba(240,255,255,.95)'); gr.addColorStop(.7,rgb(base)); gr.addColorStop(1,rgb(shade(base,-50)));
      g.fillStyle=gr; g.fillRect(0,0,S,S);
      g.strokeStyle='rgba(255,255,255,.35)'; g.beginPath(); g.moveTo(S/2,0); g.lineTo(S/2,S); g.moveTo(0,S/2); g.lineTo(S,S/2); g.stroke();
      break; }
    case B.PONT: {
      g.fillStyle='rgba(255,255,255,.12)'; g.fillRect(0,0,S,S);
      g.strokeStyle='rgba(160,200,240,.8)'; g.lineWidth=2; g.strokeRect(1,1,S-2,S-2);
      g.fillStyle='rgba(255,255,255,.3)'; g.fillRect(6,6,3,3); g.fillRect(24,20,2,2);
      break; }
    case B.COFFRE:
      g.fillStyle='rgba(90,60,30,.7)'; g.fillRect(0,10,S,3); g.fillRect(0,22,S,2);
      g.fillStyle='rgba(255,215,120,.9)'; g.fillRect(S/2-3,12,6,8); g.fillStyle='rgba(120,70,20,.9)'; g.fillRect(S/2-1,15,2,3);
      break;
    case B.AUTEL:
      texVeins(g,S,def.spots,true);
      g.strokeStyle='rgba(140,240,255,.8)'; g.lineWidth=1;
      for (let i=0;i<4;i++){ const x=4+i*8; g.beginPath(); g.moveTo(x,6); g.lineTo(x,10); g.moveTo(x-2,8); g.lineTo(x+2,8); g.stroke(); }
      break;
  }
  // biseau : arêtes claires en haut/gauche, sombres en bas/droite
  g.fillStyle='rgba(255,255,255,.10)'; g.fillRect(0,0,S,2); g.fillRect(0,0,2,S);
  g.fillStyle='rgba(0,0,0,.20)'; g.fillRect(0,S-2,S,2); g.fillRect(S-2,0,2,S);
  const t=new THREE.CanvasTexture(cv); t.magFilter=THREE.NearestFilter; t.minFilter=THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const blockMats = {};
let waterTex = null;
function makeWaterTexture(){
  const S=64;
  const cv=document.createElement('canvas'); cv.width=cv.height=S;
  const g=cv.getContext('2d');
  g.fillStyle='rgb(38,92,168)'; g.fillRect(0,0,S,S);
  for (let y=0;y<S;y++) for (let x=0;x<S;x++){
    const w = Math.sin(x*0.35+y*0.12)*Math.sin(y*0.3-x*0.08);
    const v = (w*14)|0;
    g.fillStyle=`rgb(${38+v},${100+v},${185+v})`;
    g.fillRect(x,y,1,1);
  }
  g.fillStyle='rgba(190,230,255,.35)';
  for (let i=0;i<7;i++){
    const y=(i*9+3)%S;
    for (let x=0;x<S;x++) if ((x+((Math.sin(i)*4)|0))%9<4) g.fillRect(x,(y+x*0.4)%S|0,1,1);
  }
  const t=new THREE.CanvasTexture(cv);
  t.magFilter=THREE.NearestFilter; t.minFilter=THREE.NearestFilter;
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.colorSpace=THREE.SRGBColorSpace;
  return t;
}
let waterMat = null;
function buildMaterials(){
  for (const id of Object.keys(BLOCKS)){
    const def=BLOCKS[id];
    if (def.water){
      waterTex = makeWaterTexture();
      waterMat = new THREE.MeshLambertMaterial({ map:waterTex, transparent:true, opacity:0.74, vertexColors:true, depthWrite:false, emissive:new THREE.Color(0x0a2038), emissiveIntensity:0.4 });
      blockMats[id] = [waterMat,waterMat,waterMat,waterMat,waterMat,waterMat];
      continue;
    }
    const em = def.glow ? new THREE.Color(def.all[0]/255,def.all[1]/255,def.all[2]/255) : 0x000000;
    const ei = def.glow ? 0.6 : 0;
    const top = new THREE.MeshLambertMaterial({ map: makeTexture(+id, def, 'top'), emissive:em, emissiveIntensity:ei, vertexColors:true });
    const side = new THREE.MeshLambertMaterial({ map: makeTexture(+id, def, 'side'), emissive:em, emissiveIntensity:ei, vertexColors:true });
    const bottom = new THREE.MeshLambertMaterial({ map: makeTexture(+id, def, 'side'), vertexColors:true });
    blockMats[id] = [side, side, top, bottom, side, side];
  }
}
buildMaterials();

/* ---------- Scène ---------- */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b5e0);
scene.fog = new THREE.FogExp2(0x87b5e0, IS_TOUCH?0.020:0.0085);
const camera = new THREE.PerspectiveCamera(72, innerWidth/innerHeight, 0.1, 420);
const renderer = new THREE.WebGLRenderer({ antialias:!IS_TOUCH });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(IS_TOUCH ? Math.min(devicePixelRatio,1.5) : Math.min(devicePixelRatio,2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.32, 0.55, 0.82);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());
function applyResolution(){
  const cap = settings.res==='1080p' ? 1080 : settings.res==='1440p' ? 1440 : Infinity;
  const pr = Math.min(devicePixelRatio, settings.res==='native' ? (IS_TOUCH?1.5:2) : cap/innerHeight);
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight);
  composer.setPixelRatio(pr);
  composer.setSize(innerWidth, innerHeight);
}
function applyShadows(){
  sun.castShadow = settings.shadows!=='off';
  const s = settings.shadows==='high' ? 2048 : 1024;
  sun.shadow.mapSize.set(s,s);
  if (sun.shadow.map){ sun.shadow.map.dispose(); sun.shadow.map = null; }
}
addEventListener('resize', ()=>{ camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); applyResolution(); });

const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(50,100,30); scene.add(sun); scene.add(sun.target);
sun.castShadow = true;
sun.shadow.mapSize.set(IS_TOUCH?1024:2048, IS_TOUCH?1024:2048);
sun.shadow.camera.near = 1; sun.shadow.camera.far = 300;
sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
sun.shadow.bias = -0.0004;
const hemi = new THREE.HemisphereLight(0xbcd3ee, 0x4a3d2a, 0.6); scene.add(hemi);
const amb = new THREE.AmbientLight(0x8aa2c8, 0.35); scene.add(amb);

/* ---------- Ciel, astres, nuages, sélection, particules ---------- */
const skyMat = new THREE.ShaderMaterial({
  uniforms: { topColor:{value:new THREE.Color(0x4a90c8)}, bottomColor:{value:new THREE.Color(0xc2dfef)} },
  vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform vec3 topColor; uniform vec3 bottomColor; varying vec3 vP; void main(){ float h = normalize(vP).y; gl_FragColor = vec4(mix(bottomColor, topColor, pow(max(h,0.0), 0.7)), 1.0); }',
  side: THREE.BackSide, fog: false, depthWrite: false
});
const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(380, 32, 20), skyMat);
skyMesh.renderOrder = -3; skyMesh.frustumCulled = false;
scene.add(skyMesh);

const starGeo = new THREE.BufferGeometry();
{
  const sp = [];
  for (let i=0;i<520;i++){
    const u=Math.random(), ph=Math.random()*Math.PI*2, r=340;
    const s=Math.sqrt(Math.max(0,1-u*u));
    sp.push(Math.cos(ph)*s*r, 20+u*r, Math.sin(ph)*s*r);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp,3));
}
const starTex = (()=>{
  const cv=document.createElement('canvas'); cv.width=cv.height=32;
  const g=cv.getContext('2d');
  const gr=g.createRadialGradient(16,16,1,16,16,15);
  gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(.35,'rgba(230,240,255,.9)'); gr.addColorStop(1,'rgba(230,240,255,0)');
  g.fillStyle=gr; g.fillRect(0,0,32,32);
  return new THREE.CanvasTexture(cv);
})();
const starsMat = new THREE.PointsMaterial({ map:starTex, color:0xdfeaff, size:2.6, sizeAttenuation:false, transparent:true, opacity:0, fog:false, depthWrite:false, blending:THREE.AdditiveBlending });
const stars = new THREE.Points(starGeo, starsMat);
stars.renderOrder = -2; stars.frustumCulled = false;
scene.add(stars);

function discTex(inner, outer){
  const cv=document.createElement('canvas'); cv.width=cv.height=64;
  const g=cv.getContext('2d');
  const gr=g.createRadialGradient(32,32,4,32,32,32);
  gr.addColorStop(0,inner); gr.addColorStop(.45,outer); gr.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=gr; g.fillRect(0,0,64,64);
  return new THREE.CanvasTexture(cv);
}
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map:discTex('rgba(255,255,240,1)','rgba(255,220,140,.75)'), transparent:true, fog:false, depthWrite:false }));
sunSprite.scale.set(46,46,1); sunSprite.renderOrder=-1; scene.add(sunSprite);
const sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map:discTex('rgba(255,240,200,.35)','rgba(255,200,120,.16)'), transparent:true, fog:false, depthWrite:false }));
sunHalo.scale.set(120,120,1); sunHalo.renderOrder=-1; scene.add(sunHalo);
const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map:discTex('rgba(235,245,255,1)','rgba(160,200,240,.7)'), transparent:true, fog:false, depthWrite:false }));
moonSprite.scale.set(30,30,1); moonSprite.renderOrder=-1; scene.add(moonSprite);
const moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map:discTex('rgba(210,230,255,.3)','rgba(150,190,240,.12)'), transparent:true, fog:false, depthWrite:false }));
moonHalo.scale.set(80,80,1); moonHalo.renderOrder=-1; scene.add(moonHalo);

const clouds = [];
function cloudTex(seedVal){
  const S=128;
  const cv=document.createElement('canvas'); cv.width=cv.height=S;
  const g=cv.getContext('2d');
  g.clearRect(0,0,S,S);
  for (let i=0;i<26;i++){
    const x=14+hash(i*7,seedVal)*(S-28), y=S/2+(hash(i*3,seedVal+9)-0.5)*34;
    const r=8+hash(i,seedVal+3)*16;
    const gr=g.createRadialGradient(x,y,1,x,y,r);
    gr.addColorStop(0,'rgba(255,255,255,.85)');
    gr.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=gr; g.beginPath(); g.arc(x,y,r,0,7); g.fill();
  }
  return new THREE.CanvasTexture(cv);
}
{
  for (let i=0;i<18;i++){
    const w=60+hash(i,1)*110, h2=30+w*0.6*hash(i,2);
    const alt = i%2 ? 96+hash(i,4)*8 : 112+hash(i,4)*14;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w,h2),
      new THREE.MeshBasicMaterial({ map:cloudTex(i), color:0xffffff, transparent:true, opacity:i%2?0.55:0.38, depthWrite:false, fog:false }));
    m.rotation.x = -Math.PI/2;
    m.position.set(hash(i,3)*520-260, alt, hash(i,5)*520-260);
    m.userData.vx = 0.5+hash(i,6)*0.9;
    clouds.push(m); scene.add(m);
  }
}
function applyClouds(){ for (const m of clouds) m.visible = settings.clouds; }

/* Poussière d'Aethérium en suspension */
const moteGeo = new THREE.BufferGeometry();
{
  const mp=[]; const N=280;
  for (let i=0;i<N;i++) mp.push((Math.random()-0.5)*46, Math.random()*26-9, (Math.random()-0.5)*46);
  moteGeo.setAttribute('position', new THREE.Float32BufferAttribute(mp,3));
}
const moteMat = new THREE.PointsMaterial({ map:starTex, color:0x9fe8ff, size:0.13, sizeAttenuation:true, transparent:true, opacity:0.5, depthWrite:false, blending:THREE.AdditiveBlending, fog:false });
const motes = new THREE.Points(moteGeo, moteMat);
motes.frustumCulled=false; scene.add(motes);
function applyParticles(){ motes.visible = settings.motes && settings.particles!=='off'; }

const selBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002,1.002,1.002)), new THREE.LineBasicMaterial({ color:0x7fdfff, transparent:true, opacity:0.85 }));
scene.add(selBox);
const selGlow = new THREE.Mesh(new THREE.BoxGeometry(1.04,1.04,1.04), new THREE.MeshBasicMaterial({ color:0x7fdfff, transparent:true, opacity:0.12, depthWrite:false }));
selGlow.visible=false; scene.add(selGlow);

const particleGeo = new THREE.BoxGeometry(0.12,0.12,0.12);
const particles = [];
function spawnParticles(x,y,z,blockId){
  const def=BLOCKS[blockId];
  const base = def.all || def.side;
  const col = (base[0]<<16)|(base[1]<<8)|base[2];
  const PN = settings.particles==='high' ? 14 : settings.particles==='low' ? 7 : 0;
  const PMAX = settings.particles==='high' ? 120 : 60;
  for (let i=0;i<PN && particles.length<PMAX;i++){
    const m = new THREE.Mesh(particleGeo, new THREE.MeshBasicMaterial({ color:col }));
    m.position.set(x+0.15+Math.random()*0.7, y+0.15+Math.random()*0.7, z+0.15+Math.random()*0.7);
    m.rotation.set(Math.random()*3, Math.random()*3, 0);
    scene.add(m);
    particles.push({ m, vx:(Math.random()-0.5)*3.5, vy:Math.random()*4.5, vz:(Math.random()-0.5)*3.5, life:0.75, rx:(Math.random()-0.5)*6 });
  }
}

const FACES = [
  { dir:[1,0,0],  corners:[[1,1,1],[1,0,1],[1,1,0],[1,0,0]] },
  { dir:[-1,0,0], corners:[[0,1,0],[0,0,0],[0,1,1],[0,0,1]] },
  { dir:[0,1,0],  corners:[[0,1,1],[1,1,1],[0,1,0],[1,1,0]] },
  { dir:[0,-1,0], corners:[[0,0,0],[1,0,0],[0,0,1],[1,0,1]] },
  { dir:[0,0,1],  corners:[[0,1,1],[0,0,1],[1,1,1],[1,0,1]] },
  { dir:[0,0,-1], corners:[[1,1,0],[1,0,0],[0,1,0],[0,0,0]] },
];
const FACE_TINT = [0.86, 0.86, 1.0, 0.6, 0.93, 0.93];
const UV = [[0,1],[0,0],[1,1],[1,0]];

function buildChunk(cx,cz){
  const c = getChunk(cx,cz);
  if (c.mesh){ scene.remove(c.mesh); c.mesh.traverse(o=>{ if(o.geometry) o.geometry.dispose(); }); }
  const groups = {};
  const ox=cx*CHUNK, oz=cz*CHUNK;
  for (let y=0;y<HEIGHT;y++) for (let z=0;z<CHUNK;z++) for (let x=0;x<CHUNK;x++){
    const b=c.data[idx(x,y,z)]; if (b===B.AIR) continue;
    const isWater = b===B.EAU;
    for (let f=0;f<6;f++){
      const d=FACES[f].dir;
      const nb=getBlock(ox+x+d[0], y+d[1], oz+z+d[2]);
      if (isWater ? nb!==B.AIR : isSolid(nb)) continue;
      const g = (groups[b] ||= {pos:[],uv:[],nor:[],col:[],grps:[]});
      const cs=FACES[f].corners;
      g.grps.push([g.pos.length/3, 6, f]);
      // occlusion ambiante par sommet
      const axis = d[0]!==0?0:(d[1]!==0?1:2);
      const t1 = axis===0?1:0, t2 = axis===2?1:2;
      const tint = FACE_TINT[f];
      const ao = [];
      for (let ci=0; ci<4; ci++){
        const c=cs[ci];
        const s1 = c[t1]===1?1:-1, s2 = c[t2]===1?1:-1;
        const p=[ox+x+d[0], y+d[1], oz+z+d[2]];
        const a1=[p[0],p[1],p[2]]; a1[t1]+=s1;
        const a2=[p[0],p[1],p[2]]; a2[t2]+=s2;
        const a3=[p[0],p[1],p[2]]; a3[t1]+=s1; a3[t2]+=s2;
        const o1 = isSolid(getBlock(a1[0],a1[1],a1[2])) ?1:0;
        const o2 = isSolid(getBlock(a2[0],a2[1],a2[2])) ?1:0;
        const o3 = isSolid(getBlock(a3[0],a3[1],a3[2])) ?1:0;
        const v = (o1&&o2) ? 0 : 3-(o1+o2+o3);
        ao.push((0.52+0.16*v)*tint);
      }
      for (const i of [0,1,2, 2,1,3]){
        const p=cs[i];
        g.pos.push(ox+x+p[0], y+p[1], oz+z+p[2]);
        g.uv.push(UV[i][0], UV[i][1]);
        g.nor.push(d[0],d[1],d[2]);
        g.col.push(ao[i],ao[i],ao[i]);
      }
    }
  }
  const mesh = new THREE.Group();
  for (const b of Object.keys(groups)){
    const g=groups[b];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos,3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv,2));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nor,3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(g.col,3));
    for (const [start,count,mi] of g.grps) geo.addGroup(start,count,mi);
    const m = new THREE.Mesh(geo, blockMats[b]);
    m.castShadow = !BLOCKS[b].water;
    m.receiveShadow = true;
    mesh.add(m);
  }
  scene.add(mesh);
  c.mesh = mesh; c.dirty = false;
}
function updateChunks(px,pz){
  const pcx=Math.floor(px/CHUNK), pcz=Math.floor(pz/CHUNK);
  for (const [k,c] of chunks){
    if (!c.mesh) continue;
    const [cx,cz]=k.split(',').map(Number);
    if (Math.abs(cx-pcx)>RADIUS+1 || Math.abs(cz-pcz)>RADIUS+1){
      scene.remove(c.mesh); c.mesh.traverse(o=>{if(o.geometry)o.geometry.dispose();}); c.mesh=null; c.dirty=true;
    }
  }
  let best=null, bestd=1e9;
  for (let dx=-RADIUS;dx<=RADIUS;dx++) for (let dz=-RADIUS;dz<=RADIUS;dz++){
    const cx=pcx+dx, cz=pcz+dz;
    const c=getChunk(cx,cz);
    if (!c.dirty && c.mesh) continue;
    const d=dx*dx+dz*dz;
    if (d<bestd){ bestd=d; best=[cx,cz]; }
  }
  if (best) buildChunk(best[0],best[1]);
}

/* ---------- Joueur ---------- */
const player = {
  pos:new THREE.Vector3(8.5, 40, 8.5), vel:new THREE.Vector3(),
  onGround:false, hp:20, food:20, foodTimer:0, alive:true,
  w:0.3, h:1.8, eye:1.62, yaw:0, pitch:0, speedBuff:0, heart:false
};
function spawnPlayer(fresh){
  if (!fresh && save?.py){
    player.pos.set(save.px, save.py, save.pz);
    player.hp = save.hp ?? 20; player.food = save.food ?? 20;
  } else {
    let x=8, z=8;
    outer: for (let r=0; r<28; r++){
      for (let dx=-r; dx<=r; dx++) for (let dz=-r; dz<=r; dz++){
        if (Math.max(Math.abs(dx),Math.abs(dz))!==r) continue;
        let y=HEIGHT-1; while (y>0 && getBlock(8+dx,y,8+dz)===B.AIR) y--;
        if (y>=SEA && y<32){ x=8+dx; z=8+dz; break outer; }
      }
    }
    let y=HEIGHT-1; while (y>0 && getBlock(x,y,z)===B.AIR) y--;
    player.pos.set(x+0.5, y+2.5, z+0.5);
    player.hp=20; player.food=20;
  }
  player.heart = !!(save?.heart) || player.heart;
  player.vel.set(0,0,0); player.alive=true;
}
function collides(px,py,pz){
  const w=player.w;
  for (let x=Math.floor(px-w); x<=Math.floor(px+w); x++)
    for (let z=Math.floor(pz-w); z<=Math.floor(pz+w); z++)
      for (let y=Math.floor(py); y<=Math.floor(py+player.h-0.01); y++)
        if (isSolid(getBlock(x,y,z))) return true;
  return false;
}

/* ---------- Inventaire ---------- */
const inv = new Array(36).fill(null);
if (save?.inv) for (let i=0;i<36;i++) if (save.inv[i]) inv[i]={...save.inv[i]};
const craftGrid = new Array(9).fill(null);
let cursorStack = null, hotbarSel = save?.hotbarSel ?? 0, bigCraft = false;

function addToInv(id, n){
  for (let i=0;i<36 && n>0;i++){
    const s=inv[i];
    if (s && s.id===id && s.n<64){ const a=Math.min(n,64-s.n); s.n+=a; n-=a; }
  }
  for (let i=0;i<36 && n>0;i++) if (!inv[i]){ const a=Math.min(n,64); inv[i]={id,n:a}; n-=a; }
  worldDirty=true;
  renderInv(); renderHotbar();
}
function countItem(id){ return inv.reduce((t,s)=>t+(s&&s.id===id?s.n:0),0); }
function removeItems(id, n){
  for (let i=0;i<36 && n>0;i++){
    const s=inv[i];
    if (s && s.id===id){ const a=Math.min(n,s.n); s.n-=a; n-=a; if (s.n<=0) inv[i]=null; }
  }
  worldDirty=true;
}

/* ---------- Icônes ---------- */
const itemDef = id=>ITEMS[id];
const iconCache = {};
function iconURL(id){
  if (iconCache[id]) return iconCache[id];
  const S=64;
  const cv=document.createElement('canvas'); cv.width=cv.height=S;
  const g=cv.getContext('2d');
  const d=ITEMS[id];
  if (!d){ return ''; }
  const c = d.color || [180,180,180];
  if (d.kind==='block'){
    const def=BLOCKS[d.block];
    const base = def.all || def.side;
    const top = def.all || def.top;
    if (def.glow){
      const gr=g.createRadialGradient(S/2,S/2,4,S/2,S/2,S/2);
      gr.addColorStop(0,'rgba(255,255,255,.9)'); gr.addColorStop(.4,`rgba(${base[0]},${base[1]},${base[2]},.55)`);
      gr.addColorStop(1,'rgba(0,0,0,0)');
      g.fillStyle=gr; g.fillRect(0,0,S,S);
    }
    // ombre au sol
    const sh=g.createRadialGradient(32,57,2,32,57,20);
    sh.addColorStop(0,'rgba(0,0,0,.4)'); sh.addColorStop(1,'rgba(0,0,0,0)');
    g.fillStyle=sh; g.beginPath(); g.ellipse(32,57,20,6,0,0,7); g.fill();
    // cube isométrique
    const cx=S/2, ty=12, hw=22, hh=11, vh=26;
    const P=(x,y)=>[x,y];
    const face=(pts, col, li)=>{
      g.beginPath(); g.moveTo(pts[0][0],pts[0][1]);
      for (let i=1;i<pts.length;i++) g.lineTo(pts[i][0],pts[i][1]);
      g.closePath();
      const gr=g.createLinearGradient(pts[0][0],pts[0][1],pts[2][0],pts[2][1]);
      gr.addColorStop(0, rgb(shade(col, li))); gr.addColorStop(1, rgb(shade(col, li-22)));
      g.fillStyle=gr; g.fill();
      g.strokeStyle='rgba(10,12,24,.55)'; g.lineWidth=1.5; g.stroke();
    };
    face([P(cx,ty), P(cx+hw,ty+hh), P(cx,ty+2*hh), P(cx-hw,ty+hh)], top, 28);
    face([P(cx-hw,ty+hh), P(cx,ty+2*hh), P(cx,ty+2*hh+vh), P(cx-hw,ty+hh+vh)], base, -8);
    face([P(cx+hw,ty+hh), P(cx+hw,ty+hh+vh), P(cx,ty+2*hh+vh), P(cx,ty+2*hh)], base, 14);
    // reflet lumineux sur la face supérieure et l'arête
    g.fillStyle='rgba(255,255,255,.28)';
    g.beginPath(); g.moveTo(cx,ty+1); g.lineTo(cx+hw-6,ty+hh-2); g.lineTo(cx-4,ty+hh+2); g.closePath(); g.fill();
    g.fillStyle='rgba(255,255,255,.14)';
    g.fillRect(cx+hw-3, ty+hh+2, 2, vh-6);
    if (def.spots){
      g.fillStyle=rgb(def.spots);
      for (const [px,py] of [[cx-12,ty+hh+8],[cx-6,ty+2*hh+10],[cx+8,ty+hh+16],[cx+14,ty+2*hh+6]]){
        g.beginPath(); g.arc(px,py,2.6,0,7); g.fill();
        g.fillStyle='rgba(255,255,255,.7)'; g.fillRect(px-1,py-1,1.4,1.4); g.fillStyle=rgb(def.spots);
      }
    }
  } else if (d.kind==='tool'){
    const isAeth = id.startsWith('aetherium') || id==='lame_vide';
    if (isAeth){
      const gb=g.createRadialGradient(32,32,6,32,32,34);
      gb.addColorStop(0,`rgba(${c[0]},${c[1]},${c[2]},.45)`);
      gb.addColorStop(1,'rgba(0,0,0,0)');
      g.fillStyle=gb; g.fillRect(0,0,S,S);
    }
    const grH=g.createLinearGradient(28,30,36,58);
    grH.addColorStop(0,'#b8874f'); grH.addColorStop(1,'#5e4022');
    g.strokeStyle=grH; g.lineWidth=5; g.lineCap='round';
    g.beginPath(); g.moveTo(32,30); g.lineTo(32,56); g.stroke();
    g.strokeStyle='rgba(35,22,10,.85)'; g.lineWidth=1.4;
    g.beginPath(); g.moveTo(28,40); g.lineTo(36,44); g.moveTo(28,46); g.lineTo(36,50); g.stroke();
    g.strokeStyle='rgba(255,255,255,.22)'; g.lineWidth=1.2;
    g.beginPath(); g.moveTo(30.4,31); g.lineTo(30.4,55); g.stroke();
    const grM=g.createLinearGradient(10,10,54,40);
    grM.addColorStop(0, rgb(shade(c,45))); grM.addColorStop(.5, rgb(c)); grM.addColorStop(1, rgb(shade(c,-35)));
    g.fillStyle=grM; g.strokeStyle='rgba(12,14,28,.7)'; g.lineWidth=2;
    if (d.tool==='pickaxe'){
      g.beginPath(); g.moveTo(8,20); g.quadraticCurveTo(32,4,56,20); g.quadraticCurveTo(44,14,32,15); g.quadraticCurveTo(20,14,8,20); g.closePath(); g.fill(); g.stroke();
      g.fillStyle='rgba(255,255,255,.5)'; g.fillRect(14,13,14,2);
    }
    if (d.tool==='axe'){
      g.beginPath(); g.moveTo(30,8); g.quadraticCurveTo(52,10,54,26); g.quadraticCurveTo(42,30,30,24); g.closePath(); g.fill(); g.stroke();
      g.fillStyle='rgba(255,255,255,.4)'; g.fillRect(34,12,10,3);
    }
    if (d.tool==='shovel'){
      g.beginPath(); g.moveTo(24,10); g.lineTo(40,10); g.lineTo(40,22); g.quadraticCurveTo(32,30,24,22); g.closePath(); g.fill(); g.stroke();
      g.fillStyle='rgba(255,255,255,.4)'; g.fillRect(27,13,10,2);
    }
    if (d.tool==='sword'){
      g.beginPath(); g.moveTo(30,6); g.lineTo(36,10); g.lineTo(34,34); g.lineTo(30,38); g.lineTo(26,34); g.lineTo(24,10); g.closePath(); g.fill(); g.stroke();
      g.fillStyle=rgba_glow(c); g.fillRect(30,10,2,22);
      g.fillStyle='#7a5a30'; g.fillRect(20,34,22,5); g.fillRect(29,39,5,8);
    }
  } else if (d.kind==='food'){
    const gr=g.createRadialGradient(26,24,3,32,34,22);
    gr.addColorStop(0, rgb(shade(c,60))); gr.addColorStop(.6, rgb(c)); gr.addColorStop(1, rgb(shade(c,-40)));
    g.fillStyle=gr; g.beginPath(); g.arc(32,34,18,0,7); g.fill();
    g.fillStyle='rgba(255,255,255,.55)'; g.beginPath(); g.arc(25,27,5,0,7); g.fill();
    g.strokeStyle='#4a7a3a'; g.lineWidth=3; g.beginPath(); g.moveTo(32,16); g.quadraticCurveTo(36,8,44,8); g.stroke();
  } else {
    const gr=g.createRadialGradient(28,24,2,32,32,26);
    gr.addColorStop(0, rgb(shade(c,70))); gr.addColorStop(.55, rgb(c)); gr.addColorStop(1, rgb(shade(c,-50)));
    g.fillStyle=gr;
    g.beginPath(); g.moveTo(32,6); g.lineTo(52,26); g.lineTo(32,58); g.lineTo(12,26); g.closePath(); g.fill();
    g.strokeStyle='rgba(255,255,255,.5)'; g.lineWidth=1.5; g.stroke();
    g.beginPath(); g.moveTo(32,6); g.lineTo(32,58); g.moveTo(12,26); g.lineTo(52,26); g.stroke();
    g.fillStyle='rgba(255,255,255,.45)'; g.beginPath(); g.moveTo(32,6); g.lineTo(38,26); g.lineTo(32,26); g.closePath(); g.fill();
  }
  iconCache[id]=cv.toDataURL();
  return iconCache[id];
}
function rgba_glow(c){ return `rgba(${Math.min(255,c[0]+120)},${Math.min(255,c[1]+120)},${Math.min(255,c[2]+120)},.8)`; }

/* ---------- HUD ---------- */
const hotbarEl=document.getElementById('hotbar');
const hprow=document.getElementById('hprow'), foodrow=document.getElementById('foodrow');
const itemnameEl=document.getElementById('itemname');
const toastEl=document.getElementById('toast');
let toastTimer=null;
function toast(msg, ms=2600){
  toastEl.textContent=msg; toastEl.style.opacity=1;
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{ toastEl.style.opacity=0; }, ms);
}
for (let i=0;i<9;i++){ const d=document.createElement('div'); d.className='slot'; hotbarEl.appendChild(d); }
for (let i=0;i<10;i++){ hprow.appendChild(Object.assign(document.createElement('div'),{className:'pip'})); foodrow.appendChild(Object.assign(document.createElement('div'),{className:'pip'})); }
let lastName='';
function renderHotbar(){
  for (let i=0;i<9;i++){
    const el=hotbarEl.children[i];
    el.className='slot'+(i===hotbarSel?' selected':'');
    const s=inv[i];
    let h=`<span class="key">${i+1}</span>`;
    if (s) h+=`<img src="${iconURL(s.id)}"><span class="count">${s.n>1?s.n:''}</span>`;
    el.innerHTML=h;
  }
  const s=inv[hotbarSel];
  const nm = s ? itemDef(s.id).name : '';
  if (nm!==lastName){
    lastName=nm;
    itemnameEl.textContent=nm;
    itemnameEl.classList.remove('pop'); void itemnameEl.offsetWidth;
    if (nm) itemnameEl.classList.add('pop');
  }
}
function renderBars(){
  for (let i=0;i<10;i++){
    hprow.children[i].className='pip'+(player.hp>i*2?' on hp':'');
    foodrow.children[i].className='pip'+(player.food>i*2?' on food':'');
  }
}

/* ---------- Écrans (sac, craft, chroniques) ---------- */
const invscreen=document.getElementById('invscreen');
const craft2=document.getElementById('craft2'), craft3=document.getElementById('craft3'),
      craftout=document.getElementById('craftout'), invgrid=document.getElementById('invgrid');
const cursorImg=document.getElementById('cursoritem'), cursorCount=document.getElementById('cursorcount'),
      tooltip=document.getElementById('tooltip');
const lorescreen=document.getElementById('lorescreen'), lorelist=document.getElementById('lorelist');

function makeSlots(container, count, cb, tipcb){
  container.innerHTML='';
  for (let i=0;i<count;i++){
    const d=document.createElement('div'); d.className='islot';
    d.addEventListener('pointerdown', e=>{ e.preventDefault(); cb(i, e); });
    d.addEventListener('contextmenu', e=>e.preventDefault());
    d.addEventListener('pointermove', e=>{ tipcb && tipcb(i,e); });
    d.addEventListener('pointerleave', ()=>{ tooltip.style.display='none'; });
    container.appendChild(d);
  }
}
function paintSlot(el, stack){
  el.innerHTML='';
  if (stack) el.innerHTML=`<img src="${iconURL(stack.id)}"><span class="count">${stack.n>1?stack.n:''}</span>`;
}
function renderInv(){
  for (let i=0;i<36;i++) paintSlot(invgrid.children[i], inv[i]);
  renderHotbar();
  if (bigCraft){ for (let i=0;i<9;i++) paintSlot(craft3.children[i], craftGrid[i]); }
  else { for (let i=0;i<4;i++){ const gi=[0,1,3,4][i]; paintSlot(craft2.children[i], craftGrid[gi]); } }
  paintSlot(craftout.children[0], currentRecipe() ? {...currentRecipe().out} : null);
  renderCursor();
}
function renderCursor(){
  if (cursorStack){ cursorImg.style.display='block'; cursorCount.style.display='block';
    cursorImg.src=iconURL(cursorStack.id); cursorCount.textContent=cursorStack.n>1?cursorStack.n:'';
  } else { cursorImg.style.display='none'; cursorCount.style.display='none'; }
}
addEventListener('pointermove', e=>{
  cursorImg.style.left=(e.clientX+6)+'px'; cursorImg.style.top=(e.clientY+6)+'px';
  cursorCount.style.left=(e.clientX+14)+'px'; cursorCount.style.top=(e.clientY+22)+'px';
});

let invOpen=false, paused=true;
function openInv(table){
  invOpen=true; bigCraft=table;
  craft2.style.display=table?'none':'grid';
  craft3.style.display=table?'grid':'none';
  invscreen.classList.add('open');
  document.exitPointerLock();
  renderInv();
}
function closeInv(){
  invOpen=false; invscreen.classList.remove('open');
  for (let i=0;i<9;i++){ if (craftGrid[i]){ addToInv(craftGrid[i].id, craftGrid[i].n); craftGrid[i]=null; } }
  if (cursorStack){ addToInv(cursorStack.id, cursorStack.n); cursorStack=null; }
  renderCursor();
  if (!IS_TOUCH) renderer.domElement.requestPointerLock();
}

makeSlots(invgrid, 36, (i)=>{
  const s=inv[i];
  if (cursorStack && s && s.id===cursorStack.id){ const a=Math.min(cursorStack.n, 64-s.n); s.n+=a; cursorStack.n-=a; if(cursorStack.n<=0)cursorStack=null; }
  else { inv[i]=cursorStack; cursorStack=s; }
  worldDirty=true; renderInv();
}, (i,e)=>{ const s=inv[i]; if(s){
  const d=itemDef(s.id);
  const sub = d.kind==='tool' ? ('Outil · '+TOOL_TYPES[d.tool]) : d.kind==='food' ? 'Nourriture' : d.kind==='block' ? 'Bloc' : 'Matériau';
  tooltip.innerHTML=`${d.name}<span class="tsub">${sub}</span>`;
  tooltip.style.display='block'; tooltip.style.left=(e.clientX+12)+'px'; tooltip.style.top=(e.clientY-30)+'px';
} });

const craftSlotIndices = ()=> bigCraft ? [0,1,2,3,4,5,6,7,8] : [0,1,3,4];
makeSlots(craft2, 4, (i)=>craftClick([0,1,3,4][i]));
makeSlots(craft3, 9, (i)=>craftClick(i));
makeSlots(craftout, 1, ()=>{
  const r=currentRecipe(); if (!r) return;
  if (cursorStack && (cursorStack.id!==r.out.id || cursorStack.n+r.out.n>64)) return;
  for (const gi of craftSlotIndices()) if (craftGrid[gi]){ craftGrid[gi].n--; if (craftGrid[gi].n<=0) craftGrid[gi]=null; }
  if (cursorStack) cursorStack.n+=r.out.n; else cursorStack={...r.out};
  worldDirty=true; renderInv();
});
function craftClick(gi){
  const s=craftGrid[gi];
  if (cursorStack && s && s.id===cursorStack.id){ const a=Math.min(cursorStack.n, 64-s.n); s.n+=a; cursorStack.n-=a; if(cursorStack.n<=0)cursorStack=null; }
  else { craftGrid[gi]=cursorStack; cursorStack=s; }
  renderInv();
}
function currentRecipe(){
  const w = bigCraft?3:2, h = bigCraft?3:2;
  const ids = craftSlotIndices().map(gi=>craftGrid[gi]?craftGrid[gi].id:null);
  let minx=9,miny=9,maxx=-1,maxy=-1;
  for (let y=0;y<h;y++) for (let x=0;x<w;x++) if (ids[y*w+x]){ minx=Math.min(minx,x); maxx=Math.max(maxx,x); miny=Math.min(miny,y); maxy=Math.max(maxy,y); }
  if (maxx<0) return null;
  const gw=maxx-minx+1, gh=maxy-miny+1;
  for (const r of RECIPES){
    if (r.shape.length!==gh || r.shape[0].length!==gw) continue;
    let ok=true;
    for (let y=0;y<gh && ok;y++) for (let x=0;x<gw && ok;x++){
      const ch=r.shape[y][x];
      const want = ch===' ' ? null : (r.key?.[ch] ?? defaultKey(ch));
      if (want!==ids[(miny+y)*w+(minx+x)]) ok=false;
    }
    if (ok) return r;
  }
  return null;
}

/* ---------- Chroniques ---------- */
function openLore(){
  lorelist.innerHTML='';
  for (const p of PAGES){
    const d=document.createElement('div'); d.className='lorepage';
    if (collectedPages.has(p.id)) d.innerHTML=`<h4>${p.title}</h4><p>${p.text}</p>`;
    else d.innerHTML=`<h4 class="locked">???</h4><p class="locked">Une Chronique sommeille dans une Cache des Anciens.</p>`;
    lorelist.appendChild(d);
  }
  lorescreen.classList.add('open');
  document.exitPointerLock();
}
document.getElementById('loreclose').addEventListener('pointerdown', e=>{ e.preventDefault(); lorescreen.classList.remove('open'); if (!IS_TOUCH && !paused) renderer.domElement.requestPointerLock(); });
document.getElementById('invclose').addEventListener('pointerdown', e=>{ e.preventDefault(); closeInv(); });

function grantPage(){
  const missing = PAGES.filter(p=>!collectedPages.has(p.id));
  if (!missing.length){ addToInv('eclat_lum', 2); return; }
  const p = missing[Math.floor(Math.random()*missing.length)];
  collectedPages.add(p.id);
  worldDirty=true;
  toast(`📜 Chronique découverte : « ${p.title} » — consulte les Chroniques !`, 4200);
}

/* ---------- Nourriture ---------- */
function eatSelected(){
  const s=inv[hotbarSel]; if (!s) return;
  const d=itemDef(s.id);
  if (d.kind!=='food') return;
  player.food=Math.min(20, player.food+d.food);
  player.hp=Math.min(20, player.hp+d.heal);
  if (d.buff==='speed') player.speedBuff=30;
  s.n--; if (s.n<=0) inv[hotbarSel]=null;
  worldDirty=true;
  renderBars(); renderHotbar();
}

/* ---------- Raycast ---------- */
function raycastBlock(maxDist=6){
  const dir = new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ'));
  const o = new THREE.Vector3(player.pos.x, player.pos.y+player.eye, player.pos.z);
  let x=Math.floor(o.x), y=Math.floor(o.y), z=Math.floor(o.z);
  const stepX=Math.sign(dir.x), stepY=Math.sign(dir.y), stepZ=Math.sign(dir.z);
  const tdx=Math.abs(1/dir.x), tdy=Math.abs(1/dir.y), tdz=Math.abs(1/dir.z);
  let tx=(stepX>0?(x+1-o.x):(o.x-x))*tdx, ty=(stepY>0?(y+1-o.y):(o.y-y))*tdy, tz=(stepZ>0?(z+1-o.z):(o.z-z))*tdz;
  let face=null, t=0;
  while (t<maxDist){
    if (tx<ty && tx<tz){ x+=stepX; t=tx; tx+=tdx; face=[-stepX,0,0]; }
    else if (ty<tz){ y+=stepY; t=ty; ty+=tdy; face=[0,-stepY,0]; }
    else { z+=stepZ; t=tz; tz+=tdz; face=[0,0,-stepZ]; }
    const b=getBlock(x,y,z);
    if (b!==B.AIR && b!==B.EAU) return {x,y,z,block:b,face};
  }
  return null;
}

/* ---------- Casser / poser / interagir ---------- */
let breaking=null, breakProgress=0;
let breakingHeld=false, sprintHeld=false;
const progressWrap=document.getElementById('progresswrap'), progressEl=document.getElementById('progress');

function breakTime(blockId){
  const def=BLOCKS[blockId];
  let t=def.hard;
  const s=inv[hotbarSel];
  const tool=s && itemDef(s.id).kind==='tool' ? itemDef(s.id) : null;
  if (tool && tool.tool===def.tool) t/=tool.speed;
  return Math.max(0.05, t);
}
function dropFor(blockId){
  switch(blockId){
    case B.VELOUR: return {id:'humus', n:1};
    case B.HUMUS: return {id:'humus', n:1};
    case B.ANCRE: return {id:'ancre', n:1};
    case B.GRANIT: return {id:'granit', n:1};
    case B.TRONC: return {id:'tronc', n:1};
    case B.FEUILLAGE: return hash(seed,Date.now())>0.6 ? {id:'baie',n:1} : null;
    case B.PLANCHES: return {id:'planches', n:1};
    case B.SABLE: return {id:'sable', n:1};
    case B.EPINE: return {id:'datte', n:1};
    case B.GIVRE: return {id:'givre', n:1};
    case B.LUMINITE: return {id:'eclat_lum', n:1};
    case B.AETHERIUM: return {id:'eclat_aeth', n:1};
    case B.FERROSTEM: return {id:'frag_ferro', n:1};
    case B.VIDE: return {id:'ancre', n:1};
    case B.ETABLI: return {id:'etabli', n:1};
    case B.LANTERNE: return {id:'lanterne', n:1};
    case B.CRISTAL: return {id:'cristal', n:1};
    case B.CHAMPI: return {id:'champi', n:1};
    case B.BRIQUE: return {id:'brique', n:1};
    case B.AUTEL: return {id:'autel', n:1};
    case B.PONT: return {id:'pont', n:1};
    case B.COFFRE: return null;
  }
  return null;
}
function tryBreak(dt){
  const hit=raycastBlock();
  if (!hit){ breaking=null; progressWrap.style.display='none'; return; }
  const k=hit.x+','+hit.y+','+hit.z;
  if (breaking!==k){ breaking=k; breakProgress=0; }
  const need=breakTime(hit.block);
  breakProgress+=dt;
  progressWrap.style.display='block';
  progressEl.style.width=Math.min(100, breakProgress/need*100)+'%';
  if (breakProgress>=need){
    spawnParticles(hit.x,hit.y,hit.z,hit.block);
    if (hit.block===B.COFFRE){
      grantPage();
      const r=hash(Date.now(), seed);
      if (r>0.5) addToInv('eclat_lum', 1+Math.floor(r*3));
      if (r<0.3) addToInv('frag_ferro', 2);
      if (r>0.7 && r<0.75) addToInv('eclat_aeth', 1);
      toast('Cache des Anciens ouverte !');
    } else {
      const drop=dropFor(hit.block);
      if (drop) addToInv(drop.id, drop.n);
    }
    setBlock(hit.x,hit.y,hit.z,B.AIR);
    breaking=null; breakProgress=0; progressWrap.style.display='none';
  }
}
function tryPlaceOrUse(){
  const hit=raycastBlock();
  if (!hit) return;
  if (hit.block===B.ETABLI){ openInv(true); return; }
  if (hit.block===B.AUTEL){ useAltar(); return; }
  const s=inv[hotbarSel]; if (!s) return;
  const d=itemDef(s.id);
  if (d.kind!=='block') return;
  const nx=hit.x+hit.face[0], ny=hit.y+hit.face[1], nz=hit.z+hit.face[2];
  const nb=getBlock(nx,ny,nz);
  if (nb!==B.AIR && nb!==B.EAU) return;
  const px=player.pos.x, py=player.pos.y, pz=player.pos.z;
  if (nx===Math.floor(px) && nz===Math.floor(pz) && ny>=Math.floor(py) && ny<=Math.floor(py+player.h)) return;
  setBlock(nx,ny,nz,d.block);
  s.n--; if (s.n<=0) inv[hotbarSel]=null;
  renderHotbar();
}
function useAltar(){
  if (player.heart){ toast('L\'Autel chante doucement : le Cœur bat déjà en toi.'); return; }
  if (countItem('eclat_aeth') >= 8){
    removeItems('eclat_aeth', 8);
    addToInv('coeur', 1);
    player.heart = true;
    if (!collectedPages.has(7)) collectedPages.add(7);
    worldDirty=true;
    toast('✨ Le Cœur d\'Aethérium renaît ! Une chaleur bienveillante t\'habite (régénération permanente). Chronique « La Renaissance » dévoilée.', 8000);
  } else {
    toast(`L'Autel réclame 8 Éclats d'Aethérium (tu en as ${countItem('eclat_aeth')}). Creuse profond...`);
  }
}

/* ---------- Entrées clavier/souris (desktop) ---------- */
const keys = {};
const down = a => (settings.keys[a] || []).some(c=>keys[c]);
const setscreen=document.getElementById('setscreen');
let setOpen=false, listeningAct=null;
function openSettings(){
  setOpen=true; setscreen.classList.add('open'); document.exitPointerLock();
  if (IS_TOUCH) paused=true;
  renderKeybinds();
}
function closeSettings(){
  setOpen=false; listeningAct=null; setscreen.classList.remove('open'); saveSettings();
  if (IS_TOUCH) paused=false;
  else if (!invOpen && !lorescreen.classList.contains('open')) renderer.domElement.requestPointerLock();
}
addEventListener('keydown', e=>{
  if (listeningAct){
    e.preventDefault();
    if (e.code!=='Escape'){ settings.keys[listeningAct]=[e.code]; saveSettings(); }
    listeningAct=null; renderKeybinds();
    return;
  }
  keys[e.code]=true;
  if (e.code==='Escape' && !invOpen){ if (setOpen) closeSettings(); else openSettings(); }
  if (isBound('inv',e.code) && !setOpen){ if (!paused) invOpen ? closeInv() : openInv(false); }
  if (isBound('lore',e.code) && !paused && !invOpen && !setOpen) openLore();
  if (isBound('eat',e.code) && !paused && !invOpen && !setOpen) eatSelected();
  if (e.code.startsWith('Digit')){ const n=+e.code.slice(5); if(n>=1&&n<=9){ hotbarSel=n-1; renderHotbar(); } }
});
const isBound = (act,code)=> (settings.keys[act] || []).includes(code);
addEventListener('keyup', e=>keys[e.code]=false);
addEventListener('wheel', e=>{ if(!paused&&!invOpen){ hotbarSel=(hotbarSel+(e.deltaY>0?1:8))%9; renderHotbar(); }});
document.addEventListener('pointerlockchange', ()=>{
  if (document.pointerLockElement===renderer.domElement) paused=false;
  else if (!invOpen && !lorescreen.classList.contains('open')) paused=true;
});
renderer.domElement.addEventListener('click', ()=>{ if(!invOpen && overlayHidden && !IS_TOUCH) renderer.domElement.requestPointerLock(); });
addEventListener('mousemove', e=>{
  if (document.pointerLockElement!==renderer.domElement) return;
  player.yaw -= e.movementX*0.0024;
  player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch - e.movementY*0.0024));
});
let mouseDown=false, rightClick=false;
addEventListener('mousedown', e=>{ if (document.pointerLockElement===renderer.domElement){ if(e.button===0)mouseDown=true; if(e.button===2)rightClick=true; } });
addEventListener('mouseup', e=>{ if(e.button===0){mouseDown=false; breaking=null; progressWrap.style.display='none';} if(e.button===2)rightClick=false; });
addEventListener('contextmenu', e=>e.preventDefault());

/* ---------- Contrôles tactiles (Pointer Events) ---------- */
const touchMove = { x:0, y:0 };
const joyEl=document.getElementById('joy'), knobEl=document.getElementById('joyknob');
if (IS_TOUCH){
  document.body.classList.add('touch');
  let joyPtr=null, joyBase={x:0,y:0};
  let camPtr=null, camLast={x:0,y:0}, camStart={x:0,y:0}, camT0=0, camMoved=false, holdTimer=null;

  renderer.domElement.addEventListener('pointerdown', e=>{
    if (e.pointerType==='mouse') return;
    if (paused || invOpen) return;
    if (e.clientX < innerWidth*0.42 && joyPtr===null){
      joyPtr=e.pointerId;
      joyBase={x:e.clientX, y:e.clientY};
      joyEl.style.display='block';
      joyEl.style.left=(e.clientX-60)+'px'; joyEl.style.top=(e.clientY-60)+'px';
      knobEl.style.left='38px'; knobEl.style.top='38px';
    } else if (camPtr===null){
      camPtr=e.pointerId;
      camLast={x:e.clientX, y:e.clientY};
      camStart={x:e.clientX, y:e.clientY};
      camT0=performance.now(); camMoved=false;
      holdTimer=setTimeout(()=>{ if (!camMoved){ breakingHeld=true; } }, 350);
    }
    e.preventDefault();
  }, {passive:false});

  renderer.domElement.addEventListener('pointermove', e=>{
    if (e.pointerType==='mouse') return;
    if (e.pointerId===joyPtr){
      let dx=(e.clientX-joyBase.x)/48, dy=(e.clientY-joyBase.y)/48;
      const l=Math.hypot(dx,dy); if (l>1){ dx/=l; dy/=l; }
      touchMove.x=dx; touchMove.y=dy;
      knobEl.style.left=(38+dx*40)+'px'; knobEl.style.top=(38+dy*40)+'px';
      e.preventDefault();
    } else if (e.pointerId===camPtr){
      const dx=e.clientX-camLast.x, dy=e.clientY-camLast.y;
      player.yaw -= dx*0.006;
      player.pitch = Math.max(-1.55, Math.min(1.55, player.pitch - dy*0.006));
      camLast={x:e.clientX, y:e.clientY};
      if (Math.hypot(e.clientX-camStart.x, e.clientY-camStart.y)>14){
        camMoved=true;
        if (holdTimer){ clearTimeout(holdTimer); holdTimer=null; }
      }
      e.preventDefault();
    }
  }, {passive:false});

  const endPtr = e=>{
    if (e.pointerId===joyPtr){
      joyPtr=null; touchMove.x=0; touchMove.y=0; joyEl.style.display='none';
    } else if (e.pointerId===camPtr){
      if (holdTimer){ clearTimeout(holdTimer); holdTimer=null; }
      if (!camMoved && performance.now()-camT0 < 300 && !breakingHeld) tryPlaceOrUse();
      breakingHeld=false; camPtr=null;
      breaking=null; progressWrap.style.display='none';
    }
  };
  renderer.domElement.addEventListener('pointerup', endPtr);
  renderer.domElement.addEventListener('pointercancel', endPtr);

  const bindHold=(id, on, off)=>{
    const el=document.getElementById(id);
    el.addEventListener('pointerdown', e=>{ e.preventDefault(); el.setPointerCapture(e.pointerId); on(); }, {passive:false});
    const end=()=>off&&off();
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  };
  bindHold('tbreak', ()=>breakingHeld=true, ()=>{ breakingHeld=false; breaking=null; progressWrap.style.display='none'; });
  bindHold('tjump', ()=>keys.TouchJump=true, ()=>keys.TouchJump=false);
  bindHold('tsprint', ()=>sprintHeld=true, ()=>sprintHeld=false);
  document.getElementById('tplace').addEventListener('pointerdown', e=>{ e.preventDefault(); tryPlaceOrUse(); }, {passive:false});
  document.getElementById('tinv').addEventListener('pointerdown', e=>{ e.preventDefault(); if (!paused) invOpen ? closeInv() : openInv(false); }, {passive:false});
  document.getElementById('teat').addEventListener('pointerdown', e=>{ e.preventDefault(); if (!paused && !invOpen) eatSelected(); }, {passive:false});
  document.getElementById('tlore').addEventListener('pointerdown', e=>{ e.preventDefault(); openLore(); }, {passive:false});
  document.getElementById('tset').addEventListener('pointerdown', e=>{ e.preventDefault(); if (setOpen) closeSettings(); else openSettings(); }, {passive:false});
  document.getElementById('tsave').addEventListener('pointerdown', e=>{ e.preventDefault(); persist(); toast('💾 Monde sauvegardé'); }, {passive:false});

  for (let i=0;i<9;i++){
    const idx2=i;
    hotbarEl.children[i].addEventListener('pointerdown', e=>{ e.preventDefault(); hotbarSel=idx2; renderHotbar(); }, {passive:false});
  }
}

/* ---------- Réglages : interface ---------- */
const ACT_LABELS = { forward:'Avancer', back:'Reculer', left:'Vers la gauche', right:'Vers la droite', jump:'Sauter / nager', sprint:'Sprint', inv:'Ouvrir le sac', lore:'Chroniques', eat:'Manger' };
function keyLabel(c){
  return ({Space:'Espace', ShiftLeft:'Maj ⇧', ShiftRight:'Maj ⇧', ControlLeft:'Ctrl', ArrowUp:'↑', ArrowDown:'↓', ArrowLeft:'←', ArrowRight:'→'})[c] || c.replace(/^Key|^Digit/, '');
}
function renderKeybinds(){
  const kl=document.getElementById('keylist'); kl.innerHTML='';
  for (const act of Object.keys(ACT_LABELS)){
    const row=document.createElement('div'); row.className='keyrow';
    const codes=(settings.keys[act]||[]).map(keyLabel).join(' / ') || '—';
    const listening = listeningAct===act;
    row.innerHTML=`<span>${ACT_LABELS[act]}</span><button>${listening?'Appuie sur une touche…':codes}</button>`;
    const btn=row.querySelector('button');
    if (listening) btn.classList.add('listen');
    btn.addEventListener('click', ()=>{ listeningAct=act; renderKeybinds(); });
    kl.appendChild(row);
  }
}
function applyShowFps(){ document.getElementById('fpscounter').style.display = settings.showFps?'block':'none'; }
function bindSettingsUI(){
  const $=id=>document.getElementById(id);
  $('s_res').value=settings.res;
  $('s_res').addEventListener('change', e=>{ settings.res=e.target.value; saveSettings(); applyResolution(); });
  $('s_dist').value=RADIUS; $('s_dist_v').textContent=RADIUS;
  $('s_dist').addEventListener('input', e=>{ RADIUS=+e.target.value; settings.dist=RADIUS; $('s_dist_v').textContent=RADIUS; saveSettings(); });
  $('s_fov').value=settings.fov; $('s_fov_v').textContent=settings.fov;
  $('s_fov').addEventListener('input', e=>{ settings.fov=+e.target.value; $('s_fov_v').textContent=settings.fov; saveSettings(); });
  $('s_shadow').value=settings.shadows;
  $('s_shadow').addEventListener('change', e=>{ settings.shadows=e.target.value; saveSettings(); applyShadows(); });
  $('s_bloom').checked=settings.bloom;
  $('s_bloom').addEventListener('change', e=>{ settings.bloom=e.target.checked; saveSettings(); });
  $('s_clouds').checked=settings.clouds;
  $('s_clouds').addEventListener('change', e=>{ settings.clouds=e.target.checked; saveSettings(); applyClouds(); });
  $('s_particles').value=settings.particles;
  $('s_particles').addEventListener('change', e=>{ settings.particles=e.target.value; saveSettings(); applyParticles(); });
  $('s_motes').checked=settings.motes;
  $('s_motes').addEventListener('change', e=>{ settings.motes=e.target.checked; saveSettings(); applyParticles(); });
  $('s_fps').value=String(settings.fpsCap);
  $('s_fps').addEventListener('change', e=>{ settings.fpsCap=+e.target.value; saveSettings(); });
  $('s_fpsshow').checked=settings.showFps;
  $('s_fpsshow').addEventListener('change', e=>{ settings.showFps=e.target.checked; saveSettings(); applyShowFps(); });
  $('setclose').addEventListener('click', ()=>closeSettings());
  $('setbtn').addEventListener('pointerdown', e=>{ e.preventDefault(); if (setOpen) closeSettings(); else openSettings(); }, {passive:false});
}

/* ---------- Boucle ---------- */
let last=performance.now(), timeOfDay = save?.time ?? 0.25;
const dayEl=document.getElementById('daytime');
let bobT=0, curFov=72;
const waterVeil=document.getElementById('waterveil'), hurtVeil=document.getElementById('hurtveil');
const bodyInWater = ()=> getBlock(Math.floor(player.pos.x), Math.floor(player.pos.y+player.h*0.55), Math.floor(player.pos.z))===B.EAU;
const headInWater = ()=> getBlock(Math.floor(player.pos.x), Math.floor(player.pos.y+player.eye), Math.floor(player.pos.z))===B.EAU;
function tick(dt){
  const swim = bodyInWater();
  const sprinting = (down('sprint') || sprintHeld) && !swim;
  const speed = (sprinting?2.0:1) * (player.speedBuff>0?1.4:1) * (swim?8.5:12.5);
  const fwd=new THREE.Vector3(-Math.sin(player.yaw),0,-Math.cos(player.yaw));
  const right=new THREE.Vector3(-fwd.z,0,fwd.x);
  const move=new THREE.Vector3();
  if (down('forward')) move.add(fwd);
  if (down('back')) move.sub(fwd);
  if (down('right')) move.add(right);
  if (down('left')) move.sub(right);
  if (touchMove.x||touchMove.y){ move.addScaledVector(fwd,-touchMove.y); move.addScaledVector(right,touchMove.x); }
  if (move.lengthSq()>0) move.normalize().multiplyScalar(speed);
  player.vel.x=move.x; player.vel.z=move.z;
  if (down('jump') || keys.TouchJump){
    if (swim) player.vel.y = Math.min(player.vel.y+26*dt, 3.8);
    else if (player.onGround){ player.vel.y=9.6; player.onGround=false; }
  }
  player.vel.y -= (swim?7.5:30)*dt;
  const vMin = swim?-3.4:-52;
  if (player.vel.y<vMin) player.vel.y=vMin;

  const p=player.pos;
  let nx=p.x+player.vel.x*dt;
  if (!collides(nx,p.y,p.z)) p.x=nx;
  let nz=p.z+player.vel.z*dt;
  if (!collides(p.x,p.y,nz)) p.z=nz;
  let ny=p.y+player.vel.y*dt;
  const wasFalling=player.vel.y;
  if (!collides(p.x,ny,p.z)) { p.y=ny; player.onGround=false; }
  else {
    if (wasFalling<-12) damagePlayer(Math.floor((-wasFalling-12)*0.8));
    player.vel.y=0; player.onGround=true;
  }

  player.foodTimer+=dt;
  if (player.foodTimer>20){ player.foodTimer=0; player.food=Math.max(0,player.food-1); }
  if (player.food>=18 && player.hp<20) player.hp=Math.min(20,player.hp+dt*0.5);
  if (player.heart && player.hp<20) player.hp=Math.min(20,player.hp+dt*0.3);
  if (player.food<=0) damagePlayer(dt*0.7);
  if (player.speedBuff>0) player.speedBuff-=dt;

  const wantBreak = mouseDown || breakingHeld;
  if (wantBreak) tryBreak(dt); else { breaking=null; progressWrap.style.display='none'; }
  if (rightClick){ rightClick=false; tryPlaceOrUse(); }

  const hSpeed = Math.hypot(player.vel.x, player.vel.z);
  if (player.onGround && hSpeed>0.6) bobT += dt*(6+hSpeed*0.7); 
  const bob = player.onGround && !swim ? Math.sin(bobT)*Math.min(0.055, hSpeed*0.005) : 0;
  camera.position.set(p.x, p.y+player.eye+bob, p.z);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  const fovTarget = swim ? settings.fov-6 : (sprinting && hSpeed>2 ? settings.fov+9 : settings.fov);
  if (Math.abs(fovTarget-curFov)>0.05){
    curFov += (fovTarget-curFov)*Math.min(1, dt*7);
    camera.fov = curFov; camera.updateProjectionMatrix();
  }

  updateChunks(p.x,p.z);
  renderBars();

  timeOfDay=(timeOfDay+dt/300)%1;
  const dayness = Math.max(0, Math.sin(timeOfDay*Math.PI*2));
  const dusk = Math.max(0, 1-Math.abs(dayness)*4);
  const zenith = new THREE.Color(0x0a1030).lerp(new THREE.Color(0x4a90c8), Math.min(1, dayness*1.3));
  const horizonC = new THREE.Color(0x141c3e).lerp(new THREE.Color(0xc2dfef), Math.min(1, dayness*1.3));
  if (dusk>0){ zenith.lerp(new THREE.Color(0x7a3a30), dusk*0.35); horizonC.lerp(new THREE.Color(0xd8855a), dusk*0.6); }
  skyMat.uniforms.topColor.value.copy(zenith);
  skyMat.uniforms.bottomColor.value.copy(horizonC);
  const uw = headInWater();
  if (uw){ scene.fog.color.setRGB(0.08,0.24,0.45); scene.fog.density = 0.10; }
  else { scene.fog.color.copy(horizonC); scene.fog.density = IS_TOUCH?0.020:0.0085; }
  waterVeil.style.opacity = uw ? 1 : 0;
  const ang = timeOfDay*Math.PI*2;
  sun.position.set(p.x+Math.cos(ang)*90, p.y+Math.max(14, Math.sin(ang)*90), p.z+36);
  sun.target.position.set(p.x, p.y, p.z);
  sun.intensity=0.12+dayness*1.35;
  sun.color.setRGB(1, 0.95-dayness*0.05+dusk*0.05, 0.88-dayness*0.1+dusk*0.15);
  hemi.intensity=0.18+dayness*0.55; amb.intensity=0.22+dayness*0.3;
  skyMesh.position.copy(camera.position);
  stars.position.copy(camera.position);
  starsMat.opacity = Math.max(0, 1-dayness*1.7)*0.9;
  sunSprite.position.set(camera.position.x+Math.cos(ang)*300, camera.position.y+Math.sin(ang)*300, camera.position.z-100);
  sunHalo.position.copy(sunSprite.position);
  moonSprite.position.set(camera.position.x-Math.cos(ang)*300, camera.position.y-Math.sin(ang)*300, camera.position.z+100);
  moonHalo.position.copy(moonSprite.position);
  sunSprite.material.opacity = Math.max(0, Math.min(1, Math.sin(ang)*2+0.4));
  sunHalo.material.opacity = sunSprite.material.opacity*0.8;
  moonSprite.material.opacity = Math.max(0, Math.min(1, -Math.sin(ang)*2+0.4));
  moonHalo.material.opacity = moonSprite.material.opacity*0.8;
  if (waterTex){ waterTex.offset.x=(waterTex.offset.x+dt*0.03)%1; waterTex.offset.y=(waterTex.offset.y+dt*0.011)%1; }
  if (waterMat) waterMat.emissiveIntensity = 0.35+0.15*Math.sin(performance.now()*0.0012);
  if (motes.visible){
    motes.position.set(camera.position.x, camera.position.y-6+Math.sin(performance.now()*0.0004)*1.2, camera.position.z);
    motes.rotation.y += dt*0.02;
  }
  for (const m of clouds){
    m.position.x += m.userData.vx*dt;
    if (m.position.x - camera.position.x > 280) m.position.x -= 560;
    if (m.position.x - camera.position.x < -280) m.position.x += 560;
    if (m.position.z - camera.position.z > 280) m.position.z -= 560;
    if (m.position.z - camera.position.z < -280) m.position.z += 560;
  }
  const selHit = raycastBlock();
  if (selHit && !invOpen){
    selBox.visible=true; selBox.position.set(selHit.x+0.5, selHit.y+0.5, selHit.z+0.5);
    selGlow.visible=true; selGlow.position.copy(selBox.position);
    selBox.material.opacity = 0.55+0.35*Math.sin(performance.now()*0.006);
  }
  else { selBox.visible=false; selGlow.visible=false; }
  for (let i=particles.length-1;i>=0;i--){
    const P=particles[i];
    P.life-=dt;
    P.vy-=12*dt;
    P.m.position.x+=P.vx*dt; P.m.position.y+=P.vy*dt; P.m.position.z+=P.vz*dt;
    P.m.scale.setScalar(Math.max(0.1,P.life*1.3));
    P.m.rotation.x += P.rx*dt; P.m.rotation.y += P.rx*0.7*dt;
    if (P.life<=0){ scene.remove(P.m); P.m.material.dispose(); particles.splice(i,1); }
  }
  const hh=Math.floor(timeOfDay*24), mm=Math.floor((timeOfDay*24%1)*60);
  dayEl.innerHTML=`${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')} — ${dayness>0.15?'☀ Jour':'☾ Nuit'}<br><span id="biomename">${biomeAt(p.x,p.z).name}</span>`;
}
function damagePlayer(v){
  if (!player.alive) return;
  player.hp-=v; renderBars();
  hurtVeil.classList.remove('show');
  void hurtVeil.offsetWidth;
  hurtVeil.classList.add('show');
  if (player.hp<=0){
    player.hp=0; player.alive=false; paused=true;
    document.exitPointerLock();
    document.getElementById('death').style.display='flex';
  }
}
const fpsVal=document.getElementById('fpsval');
let fpsFrames=0, fpsT=performance.now();
function loop(){
  requestAnimationFrame(loop);
  const now=performance.now();
  if (settings.fpsCap>0 && now-last < 1000/settings.fpsCap - 0.5) return;
  const dt=Math.min(0.05,(now-last)/1000); last=now;
  if (!paused && player.alive) tick(dt);
  if (settings.bloom) composer.render(); else renderer.render(scene,camera);
  fpsFrames++;
  if (now-fpsT>500){ fpsVal.textContent=Math.round(fpsFrames*1000/(now-fpsT)); fpsT=now; fpsFrames=0; }
}

/* ---------- Démarrage ---------- */
let overlayHidden=false;
spawnPlayer(false);
const newBtn=document.getElementById('newbtn');
if (save) newBtn.style.display='block';
document.getElementById('playbtn').addEventListener('pointerdown', e=>{
  e.preventDefault();
  document.getElementById('overlay').classList.add('hidden');
  overlayHidden=true;
  if (!inv.some(s=>s)) { addToInv('bois_pickaxe',1); addToInv('bois_axe',1); addToInv('baie',5); }
  if (IS_TOUCH) paused=false; else renderer.domElement.requestPointerLock();
}, {passive:false});
newBtn.addEventListener('pointerdown', e=>{
  e.preventDefault();
  localStorage.removeItem(SAVE_KEY);
  location.reload();
}, {passive:false});
document.getElementById('respawnbtn').addEventListener('pointerdown', e=>{
  e.preventDefault();
  document.getElementById('death').style.display='none';
  spawnPlayer(true); renderBars(); paused=false;
  if (!IS_TOUCH) renderer.domElement.requestPointerLock();
}, {passive:false});

renderHotbar(); renderBars(); renderInv();
bindSettingsUI(); applyResolution(); applyShadows(); applyClouds(); applyParticles(); applyShowFps();
updateChunks(player.pos.x, player.pos.z);
if ('serviceWorker' in navigator && location.protocol==='https:') navigator.serviceWorker.register('sw.js').catch(()=>{});
loop();
