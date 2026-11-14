/* ============================================================
   VOXELHEIM 2 — Les Chroniques de l'Éveil
   Contenu : blocs, items, recettes, biomes, lore
   ============================================================ */

export const B = {
  AIR:0, VELOUR:1, HUMUS:2, ANCRE:3, GRANIT:4, TRONC:5, FEUILLAGE:6,
  PLANCHES:7, SABLE:8, EPINE:9, GIVRE:10, LUMINITE:11, AETHERIUM:12,
  FERROSTEM:13, VIDE:14, ETABLI:15, LANTERNE:16, CRISTAL:17, CHAMPI:18,
  BRIQUE:19, COFFRE:20, AUTEL:21, PONT:22, EAU:23
};

/* def: nom, dureté, outil, couleurs, options */
export const BLOCKS = {
  [B.VELOUR]:    { name:'Herbe de Velours', hard:0.7, tool:'shovel', top:[106,170,64], side:[120,90,55] },
  [B.HUMUS]:     { name:'Humus', hard:0.6, tool:'shovel', all:[120,90,55] },
  [B.ANCRE]:     { name:'Pierre d\'Ancre', hard:2.5, tool:'pickaxe', all:[125,125,128] },
  [B.GRANIT]:    { name:'Granit des Pics', hard:3.0, tool:'pickaxe', all:[150,105,95] },
  [B.TRONC]:     { name:'Tronc de Sylve', hard:1.6, tool:'axe', top:[150,110,60], side:[95,70,40] },
  [B.FEUILLAGE]: { name:'Feuillage', hard:0.3, tool:null, all:[60,140,50] },
  [B.PLANCHES]:  { name:'Planches de Sylve', hard:1.4, tool:'axe', all:[168,128,80] },
  [B.SABLE]:     { name:'Sable d\'Étoile', hard:0.5, tool:'shovel', all:[218,205,160] },
  [B.EPINE]:     { name:'Épine des Dunes', hard:0.8, tool:null, all:[90,160,70] },
  [B.GIVRE]:     { name:'Givre', hard:0.9, tool:'shovel', all:[235,240,250] },
  [B.LUMINITE]:  { name:'Minerai de Luminite', hard:3.5, tool:'pickaxe', all:[110,112,120], spots:[255,240,140] },
  [B.AETHERIUM]: { name:'Minerai d\'Aethérium', hard:5.0, tool:'pickaxe', all:[100,105,118], spots:[110,230,255] },
  [B.FERROSTEM]: { name:'Minerai de Ferrostem', hard:3.8, tool:'pickaxe', all:[120,118,125], spots:[200,205,215] },
  [B.VIDE]:      { name:'Pierre du Vide', hard:6.0, tool:'pickaxe', all:[40,40,52] },
  [B.ETABLI]:    { name:'Établi des Anciens', hard:1.8, tool:'axe', top:[168,128,80], side:[140,100,60] },
  [B.LANTERNE]:  { name:'Lanterne de Luminite', hard:1.0, tool:null, all:[255,220,120], glow:true },
  [B.CRISTAL]:   { name:'Bloc d\'Aethérium', hard:4.0, tool:'pickaxe', all:[110,230,255], glow:true },
  [B.CHAMPI]:    { name:'Champignon de Brume', hard:0.4, tool:null, all:[150,110,190], glow:true },
  [B.BRIQUE]:    { name:'Brique des Anciens', hard:3.2, tool:'pickaxe', all:[140,120,100] },
  [B.COFFRE]:    { name:'Cache des Anciens', hard:1.2, tool:null, all:[130,95,60], spots:[255,215,120] },
  [B.AUTEL]:     { name:'Autel d\'Aethérium', hard:5.0, tool:'pickaxe', all:[70,75,95], spots:[110,230,255], glow:true },
  [B.PONT]:      { name:'Verre du Vide', hard:2.0, tool:null, all:[180,200,230], glow:true },
  [B.EAU]:       { name:'Eau d\'Aethérium', hard:Infinity, tool:null, all:[45,105,185], water:true }
};

export const ITEMS = {
  velour:    { kind:'block', block:B.VELOUR, name:'Herbe de Velours' },
  humus:     { kind:'block', block:B.HUMUS, name:'Humus' },
  ancre:     { kind:'block', block:B.ANCRE, name:'Pierre d\'Ancre' },
  granit:    { kind:'block', block:B.GRANIT, name:'Granit des Pics' },
  tronc:     { kind:'block', block:B.TRONC, name:'Tronc de Sylve' },
  feuillage: { kind:'block', block:B.FEUILLAGE, name:'Feuillage' },
  planches:  { kind:'block', block:B.PLANCHES, name:'Planches de Sylve' },
  sable:     { kind:'block', block:B.SABLE, name:'Sable d\'Étoile' },
  epine:     { kind:'block', block:B.EPINE, name:'Épine des Dunes' },
  givre:     { kind:'block', block:B.GIVRE, name:'Givre' },
  etabli:    { kind:'block', block:B.ETABLI, name:'Établi des Anciens' },
  lanterne:  { kind:'block', block:B.LANTERNE, name:'Lanterne de Luminite' },
  cristal:   { kind:'block', block:B.CRISTAL, name:'Bloc d\'Aethérium' },
  champi:    { kind:'block', block:B.CHAMPI, name:'Champignon de Brume' },
  brique:    { kind:'block', block:B.BRIQUE, name:'Brique des Anciens' },
  autel:     { kind:'block', block:B.AUTEL, name:'Autel d\'Aethérium' },
  pont:      { kind:'block', block:B.PONT, name:'Verre du Vide' },
  eclat_lum:   { kind:'mat', name:'Éclat de Luminite', color:[255,240,140] },
  eclat_aeth:  { kind:'mat', name:'Éclat d\'Aethérium', color:[110,230,255] },
  frag_ferro:  { kind:'mat', name:'Fragment de Ferrostem', color:[200,205,215] },
  lingot:      { kind:'mat', name:'Lingot de Ferrostem', color:[225,230,240] },
  baton:       { kind:'mat', name:'Bâton de Sylve', color:[150,110,60] },
  page:        { kind:'mat', name:'Chronique', color:[235,220,180] },
  coeur:       { kind:'mat', name:'Cœur d\'Aethérium', color:[110,230,255] },
  baie:    { kind:'food', food:3, heal:1, name:'Baie de Sylve', color:[210,40,90] },
  datte:   { kind:'food', food:4, heal:1, name:'Datte des Dunes', color:[200,150,60] },
  tarte:   { kind:'food', food:6, heal:3, name:'Tarte aux Baies', color:[190,110,60] },
  elixir:  { kind:'food', food:2, heal:8, buff:'speed', name:'Élixir d\'Aethérium', color:[110,230,255] },
  ragout:  { kind:'food', food:9, heal:4, name:'Ragoût des Anciens', color:[170,120,80] },
  champi_r: { kind:'food', food:2, heal:5, name:'Champignon Grillé', color:[170,120,180] }
};

export const TOOL_TYPES = { pickaxe:'Pioche', axe:'Hache', shovel:'Pelle', sword:'Lame' };
export const TOOL_MATS = {
  bois:      { speed:2, dmg:2, color:[168,128,80] },
  ancre:     { speed:4, dmg:3, color:[125,125,128] },
  ferrostem: { speed:6, dmg:4, color:[210,215,225] },
  aetherium: { speed:9, dmg:6, color:[110,230,255] }
};
const MAT_LABEL = { bois:'en Planches', ancre:'d\'Ancre', ferrostem:'de Ferrostem', aetherium:'d\'Aethérium' };
for (const m of Object.keys(TOOL_MATS))
  for (const t of Object.keys(TOOL_TYPES))
    ITEMS[m+'_'+t] = { kind:'tool', tool:t, speed:TOOL_MATS[m].speed, dmg:TOOL_MATS[m].dmg,
                       name:`${TOOL_TYPES[t]} ${MAT_LABEL[m]}`, color:TOOL_MATS[m].color };
ITEMS.lame_vide = { kind:'tool', tool:'sword', speed:12, dmg:9, name:'Lame du Vide', color:[120,90,200] };

const TOOL_SHAPES = {
  pickaxe:['XXX',' S ',' S '],
  axe:    ['XX','XS',' S'],
  shovel: ['X',' S',' S'],
  sword:  ['X','X',' S']
};
const MAT_ITEM = { bois:'planches', ancre:'ancre', ferrostem:'lingot', aetherium:'eclat_aeth' };

export const RECIPES = [
  { shape:['P'], out:{id:'planches',n:4}, key:{P:'tronc'} },
  { shape:['P','P'], out:{id:'baton',n:4} },
  { shape:['PP','PP'], out:{id:'etabli',n:1} },
  { shape:['AS','SA'], out:{id:'brique',n:4}, key:{A:'ancre',S:'sable'} },
  { shape:['LL','LL'], out:{id:'lanterne',n:1}, key:{L:'eclat_lum'} },
  { shape:['AA','AA'], out:{id:'cristal',n:1}, key:{A:'eclat_aeth'} },
  { shape:['F','F'], out:{id:'lingot',n:1}, key:{F:'frag_ferro'} },
  { shape:['FF','FF'], out:{id:'pont',n:2}, key:{F:'frag_ferro'} },
  { shape:['BB','BP','PP'], out:{id:'tarte',n:1}, key:{B:'baie',P:'planches'} },
  { shape:[' E ','BAB',' E '], out:{id:'elixir',n:1}, key:{E:'eclat_aeth',A:'eclat_lum',B:'baie'} },
  { shape:['RHR','RPR','RRR'], out:{id:'ragout',n:1}, key:{R:'humus',H:'baie',P:'planches'} },
  { shape:['C','C'], out:{id:'champi_r',n:2}, key:{C:'champi'} },
  { shape:['CBC','BLB','BBB'], out:{id:'autel',n:1}, key:{C:'cristal',B:'brique',L:'lingot'} },
  { shape:['K','K',' S'], out:{id:'lame_vide',n:1}, key:{K:'coeur',S:'baton'} }
];
for (const m of Object.keys(MAT_ITEM)) for (const t of Object.keys(TOOL_SHAPES))
  RECIPES.push({ shape:TOOL_SHAPES[t], key:{X:MAT_ITEM[m], S:'baton'}, out:{id:m+'_'+t, n:1} });

export function defaultKey(ch){
  const map = { P:'planches', L:'eclat_lum', A:'eclat_aeth', F:'frag_ferro', B:'baie', S:'baton',
               R:'humus', H:'baie', E:'eclat_aeth', C:'champi', K:'coeur', X:null };
  return map[ch] ?? null;
}

/* ---------- Biomes ---------- */
export const BIOMES = {
  DUNES:   { name:'Dunes d\'Étoile', surface:B.SABLE, tree:null, amp:6,  base:16 },
  PLAINE:  { name:'Plaines de Velours', surface:B.VELOUR, tree:0.05, amp:5, base:16 },
  SYLVE:   { name:'Forêt de Sylve', surface:B.VELOUR, tree:0.22, amp:7, base:17, mushrooms:true },
  PICS:    { name:'Pics d\'Ancre', surface:B.GRANIT, tree:0, amp:16, base:22, snow:34 }
};

/* ---------- Chroniques (lore à collectionner) ---------- */
export const PAGES = [
  { id:0, title:'L\'Éveil', text:'Tu ouvres les yeux sur l\'herbe de Velours. Le monde semble retenir son souffle. Dernier Éveillé, tu portes en toi une étincelle du Cœur perdu. Les ruines chuchotent : cherche les Caches des Anciens.' },
  { id:1, title:'Le Cœur d\'Aethérium', text:'Avant la Fracture, un cristal battait au centre du monde : le Cœur d\'Aethérium. Sa lumière nourrissait les arbres, apaisait les Dunes et tenait l\'Abîme fermé.' },
  { id:2, title:'La Fracture', text:'Les Anciens, voulant tout comprendre, brisèrent le Cœur pour en compter les facettes. Le ciel se fendit. Le cristal vola en éclats qui tombèrent dans la pierre : la Luminite, larmes de lumière.' },
  { id:3, title:'Les Anciens', text:'Ils bâtirent des tours de Brique et des Autels pour rassembler les éclats. Trop tard. Le Vide monta des profondeurs et leur civilisation s\'éteignit dans le silence.' },
  { id:4, title:'La Luminite', text:'Chaque éclat de Luminite garde une mémoire de lumière. Réunis en Lanternes, ils éclairent les ruines et repoussent le sommeil du Vide.' },
  { id:5, title:'Le Ferrostem', text:'Ossature du monde, le Ferrostem lie la pierre au ciel. Fondu en lingots, il forgea les outils des Anciens — et forgera les tiens.' },
  { id:6, title:'L\'Abîme', text:'Sous la Pierre du Vide dort ce qui reste du Cœur brisé. Ceux qui descendent trop profond entendent un battement. Certains ne remontent pas.' },
  { id:7, title:'La Renaissance', text:'Si un Éveillé rassemble huit Éclats d\'Aethérium et les offre à un Autel, le Cœur renaîtra. Alors Voxelheim respirera de nouveau. C\'est ton chemin.' },
  { id:8, title:'Les Ombres du Vide', text:'Quand le C\u0153ur s\u2019est bris\u00e9, des fragments de nuit ont pris vie : les Ombres. Elles fuient la lumi\u00e8re du jour et r\u00f4dent apr\u00e8s le cr\u00e9puscule. Frapp\u00e9es, elles rendent la lumi\u00e8re vol\u00e9e \u2014 de la Luminite pure. Les Nuagelets, eux, n\u2019ont rien oubli\u00e9 de la douceur d\u2019avant la Fracture.' }
];
