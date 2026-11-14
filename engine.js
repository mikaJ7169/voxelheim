/* ============================================================
   VOXELHEIM 2 — Les Chroniques de l'Éveil
   Moteur : monde, rendu, joueur, tactile (Pointer Events), sauvegarde
   ============================================================ */
import * as THREE from 'three';
import { B, BLOCKS, ITEMS, RECIPES, defaultKey, BIOMES, PAGES, TOOL_TYPES, TOOL_MATS } from './content.js';

const CHUNK = 16, HEIGHT = 64;
const IS_TOUCH = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
const RADIUS = IS_TOUCH ? 2 : 4;
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
      }
      if (b===B.ANCRE || b===B.VIDE){
        const r = hash(wx*3+y*7, wz*5-y*11);
        if (y<12 && r>0.994) b = B.AETHERIUM;
        else if (y<20 && r>0.988) b = B.LUMINITE;
        else if (y<28 && r>0.984) b = B.FERROSTEM;
      }
      data[idx(lx,y,lz)] = b;
    }
    // arbres / cactus / champignons
    if (top>10 && lx>2 && lx<13 && lz>2 && lz<13){
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

/* ---------- Textures & matériaux ---------- */
function makeTexture(def, face){
  const cv=document.createElement('canvas'); cv.width=cv.height=16;
  const g=cv.getContext('2d');
  const base = def.all || (face==='top'?def.top:def.side);
  for (let y=0;y<16;y++) for (let x=0;x<16;x++){
    const n = (hash(x*7+base[0], y*13+base[2])*18-9)|0;
    let r=base[0]+n, gg=base[1]+n, b=base[2]+n;
    if (def.spots && hash(x*31+seed, y*57) > 0.82){ r=def.spots[0]; gg=def.spots[1]; b=def.spots[2]; }
    if (def.glow){ r=Math.min(255,r+60); gg=Math.min(255,gg+50); b=Math.min(255,b+30); }
    g.fillStyle=`rgb(${r|0},${gg|0},${b|0})`; g.fillRect(x,y,1,1);
  }
  const t=new THREE.CanvasTexture(cv); t.magFilter=THREE.NearestFilter; t.minFilter=THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const blockMats = {};
function buildMaterials(){
  for (const id of Object.keys(BLOCKS)){
    const def=BLOCKS[id];
    const em = def.glow ? new THREE.Color(def.all[0]/255,def.all[1]/255,def.all[2]/255) : 0x000000;
    const ei = def.glow ? 0.55 : 0;
    const top = new THREE.MeshLambertMaterial({ map: makeTexture(def,'top'), emissive:em, emissiveIntensity:ei });
    const side = new THREE.MeshLambertMaterial({ map: makeTexture(def,'side'), emissive:em, emissiveIntensity:ei });
    const bottom = new THREE.MeshLambertMaterial({ map: makeTexture(def,'side') });
    blockMats[id] = [side, side, top, bottom, side, side];
  }
}
buildMaterials();

/* ---------- Scène ---------- */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b5e0);
scene.fog = new THREE.Fog(0x87b5e0, IS_TOUCH?14:30, IS_TOUCH?42:90);
const camera = new THREE.PerspectiveCamera(72, innerWidth/innerHeight, 0.1, 300);
const renderer = new THREE.WebGLRenderer({ antialias:false });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(IS_TOUCH ? 1 : Math.min(devicePixelRatio,2));
document.getElementById('game').appendChild(renderer.domElement);
addEventListener('resize', ()=>{ camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); });

const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(50,100,30); scene.add(sun);
const amb = new THREE.AmbientLight(0xbcd3ee, 0.7); scene.add(amb);

const FACES = [
  { dir:[1,0,0],  corners:[[1,1,1],[1,0,1],[1,1,0],[1,0,0]] },
  { dir:[-1,0,0], corners:[[0,1,0],[0,0,0],[0,1,1],[0,0,1]] },
  { dir:[0,1,0],  corners:[[0,1,1],[1,1,1],[0,1,0],[1,1,0]] },
  { dir:[0,-1,0], corners:[[0,0,0],[1,0,0],[0,0,1],[1,0,1]] },
  { dir:[0,0,1],  corners:[[0,1,1],[0,0,1],[1,1,1],[1,0,1]] },
  { dir:[0,0,-1], corners:[[1,1,0],[1,0,0],[0,1,0],[0,0,0]] },
];
const UV = [[0,1],[0,0],[1,1],[1,0]];

function buildChunk(cx,cz){
  const c = getChunk(cx,cz);
  if (c.mesh){ scene.remove(c.mesh); c.mesh.traverse(o=>{ if(o.geometry) o.geometry.dispose(); }); }
  const groups = {};
  const ox=cx*CHUNK, oz=cz*CHUNK;
  for (let y=0;y<HEIGHT;y++) for (let z=0;z<CHUNK;z++) for (let x=0;x<CHUNK;x++){
    const b=c.data[idx(x,y,z)]; if (b===B.AIR) continue;
    for (let f=0;f<6;f++){
      const d=FACES[f].dir;
      if (getBlock(ox+x+d[0], y+d[1], oz+z+d[2]) !== B.AIR) continue;
      const g = (groups[b] ||= {pos:[],uv:[],nor:[],grps:[]});
      const cs=FACES[f].corners;
      g.grps.push([g.pos.length/3, 6, f]);
      for (const i of [0,1,2, 2,1,3]){
        const p=cs[i];
        g.pos.push(ox+x+p[0], y+p[1], oz+z+p[2]);
        g.uv.push(UV[i][0], UV[i][1]);
        g.nor.push(d[0],d[1],d[2]);
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
    for (const [start,count,mi] of g.grps) geo.addGroup(start,count,mi);
    mesh.add(new THREE.Mesh(geo, blockMats[b]));
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
    const x=8,z=8;
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
        if (getBlock(x,y,z)!==B.AIR) return true;
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
  const cv=document.createElement('canvas'); cv.width=cv.height=32;
  const g=cv.getContext('2d');
  const d=ITEMS[id];
  if (!d){ return ''; }
  if (d.kind==='block'){
    const def=BLOCKS[d.block];
    const base = def.all || def.side;
    for (let y=0;y<32;y++) for (let x=0;x<32;x++){
      const n=(hash(x*7+id.length,y*13)*16-8)|0;
      let r=base[0]+n, gg=base[1]+n, b=base[2]+n;
      if (def.spots && hash(x*3,y*5)>0.85){ r=def.spots[0]; gg=def.spots[1]; b=def.spots[2]; }
      if (def.glow){ r=Math.min(255,r+60); gg=Math.min(255,gg+50); b=Math.min(255,b+30); }
      g.fillStyle=`rgb(${r|0},${gg|0},${b|0})`; g.fillRect(x,y,1,1);
    }
  } else {
    const c=d.color;
    if (d.kind==='tool'){
      g.fillStyle='rgb(150,110,60)'; g.fillRect(14,16,4,14);
      g.fillStyle=`rgb(${c[0]},${c[1]},${c[2]})`;
      if (d.tool==='pickaxe'){ g.fillRect(6,6,20,5); g.fillRect(6,11,4,6); g.fillRect(22,11,4,6); }
      if (d.tool==='axe'){ g.fillRect(12,4,12,10); g.fillRect(8,6,6,6); }
      if (d.tool==='shovel'){ g.fillRect(12,3,8,9); }
      if (d.tool==='sword'){ g.fillRect(13,3,6,16); g.fillRect(9,18,14,4); g.fillStyle='rgb(150,110,60)'; g.fillRect(14,22,4,8); }
    } else if (d.kind==='food'){
      g.fillStyle=`rgb(${c[0]},${c[1]},${c[2]})`;
      g.beginPath(); g.arc(16,16,9,0,7); g.fill();
      g.fillStyle='rgba(255,255,255,.4)'; g.beginPath(); g.arc(13,13,3,0,7); g.fill();
    } else {
      g.fillStyle=`rgb(${c[0]},${c[1]},${c[2]})`;
      g.beginPath();
      g.moveTo(16,4); g.lineTo(27,16); g.lineTo(16,28); g.lineTo(5,16); g.closePath(); g.fill();
      g.fillStyle='rgba(255,255,255,.35)'; g.fillRect(14,8,4,12);
    }
  }
  iconCache[id]=cv.toDataURL();
  return iconCache[id];
}

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
function renderHotbar(){
  for (let i=0;i<9;i++){
    const el=hotbarEl.children[i]; el.innerHTML='';
    el.className='slot'+(i===hotbarSel?' selected':'');
    const s=inv[i];
    if (s) el.innerHTML=`<img src="${iconURL(s.id)}"><span class="count">${s.n>1?s.n:''}</span>`;
  }
  const s=inv[hotbarSel];
  itemnameEl.textContent = s ? itemDef(s.id).name : '';
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
}, (i,e)=>{ const s=inv[i]; if(s){ tooltip.textContent=itemDef(s.id).name; tooltip.style.display='block'; tooltip.style.left=(e.clientX+12)+'px'; tooltip.style.top=(e.clientY-24)+'px'; } });

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
    if (b!==B.AIR) return {x,y,z,block:b,face};
  }
  return null;
}

/* ---------- Casser / poser / interagir ---------- */
let breaking=null, breakProgress=0;
let breakingHeld=false;
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
  if (getBlock(nx,ny,nz)!==B.AIR) return;
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
addEventListener('keydown', e=>{
  keys[e.code]=true;
  if (e.code==='KeyE'){ if (!paused) invOpen ? closeInv() : openInv(false); }
  if (e.code==='KeyL' && !paused && !invOpen) openLore();
  if (e.code==='KeyF' && !paused && !invOpen) eatSelected();
  if (e.code.startsWith('Digit')){ const n=+e.code.slice(5); if(n>=1&&n<=9){ hotbarSel=n-1; renderHotbar(); } }
});
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
  bindHold('tjump', ()=>keys.Space=true, ()=>keys.Space=false);
  document.getElementById('tplace').addEventListener('pointerdown', e=>{ e.preventDefault(); tryPlaceOrUse(); }, {passive:false});
  document.getElementById('tinv').addEventListener('pointerdown', e=>{ e.preventDefault(); if (!paused) invOpen ? closeInv() : openInv(false); }, {passive:false});
  document.getElementById('teat').addEventListener('pointerdown', e=>{ e.preventDefault(); if (!paused && !invOpen) eatSelected(); }, {passive:false});
  document.getElementById('tlore').addEventListener('pointerdown', e=>{ e.preventDefault(); openLore(); }, {passive:false});
  document.getElementById('tsave').addEventListener('pointerdown', e=>{ e.preventDefault(); persist(); toast('💾 Monde sauvegardé'); }, {passive:false});

  for (let i=0;i<9;i++){
    const idx2=i;
    hotbarEl.children[i].addEventListener('pointerdown', e=>{ e.preventDefault(); hotbarSel=idx2; renderHotbar(); }, {passive:false});
  }
}

/* ---------- Boucle ---------- */
let last=performance.now(), timeOfDay = save?.time ?? 0.25;
const dayEl=document.getElementById('daytime');
function tick(dt){
  const speed = (keys.ShiftLeft?1.6:1) * (player.speedBuff>0?1.5:1) * 4.3;
  const fwd=new THREE.Vector3(-Math.sin(player.yaw),0,-Math.cos(player.yaw));
  const right=new THREE.Vector3(-fwd.z,0,fwd.x);
  const move=new THREE.Vector3();
  if (keys.KeyW||keys.KeyZ) move.add(fwd);
  if (keys.KeyS) move.sub(fwd);
  if (keys.KeyD) move.add(right);
  if (keys.KeyA||keys.KeyQ) move.sub(right);
  if (touchMove.x||touchMove.y){ move.addScaledVector(fwd,-touchMove.y); move.addScaledVector(right,touchMove.x); }
  if (move.lengthSq()>0) move.normalize().multiplyScalar(speed*dt);
  player.vel.x=move.x; player.vel.z=move.z;
  if (keys.Space && player.onGround){ player.vel.y=8.2; player.onGround=false; }
  player.vel.y-=25*dt; if (player.vel.y<-40)player.vel.y=-40;

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

  camera.position.set(p.x, p.y+player.eye, p.z);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');

  updateChunks(p.x,p.z);
  renderBars();

  timeOfDay=(timeOfDay+dt/300)%1;
  const dayness = Math.max(0, Math.sin(timeOfDay*Math.PI*2));
  const sky=new THREE.Color(0x87b5e0).multiplyScalar(0.15+dayness*0.85);
  scene.background=sky; scene.fog.color=sky;
  sun.intensity=0.15+dayness*1.3; amb.intensity=0.25+dayness*0.5;
  const hh=Math.floor(timeOfDay*24), mm=Math.floor((timeOfDay*24%1)*60);
  dayEl.textContent=`${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')} — ${dayness>0.15?'Jour':'Nuit'}`;
}
function damagePlayer(v){
  if (!player.alive) return;
  player.hp-=v; renderBars();
  if (player.hp<=0){
    player.hp=0; player.alive=false; paused=true;
    document.exitPointerLock();
    document.getElementById('death').style.display='flex';
  }
}
function loop(){
  requestAnimationFrame(loop);
  const now=performance.now();
  const dt=Math.min(0.05,(now-last)/1000); last=now;
  if (!paused && player.alive) tick(dt);
  renderer.render(scene,camera);
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
updateChunks(player.pos.x, player.pos.z);
if ('serviceWorker' in navigator && location.protocol==='https:') navigator.serviceWorker.register('sw.js').catch(()=>{});
loop();
