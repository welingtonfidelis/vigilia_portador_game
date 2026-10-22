/**
 * Lista exata do que sai de cada pack baixado (KayKit e, em teste para a vila, o Kenney Fantasy Town)
 * para public/assets/kaykit/<pack>/.
 * Os caminhos são relativos à pasta extraída do pack (packs/<pack>/<raiz do zip>/). As texturas que um
 * .gltf cita na mesma pasta vêm junto (o importador valida e copia).
 * Nada fora desta lista é copiado; ver docs/VIGILIA-PORTADOR.md §3.4.
 */
export interface PackEntry {
  /** Pasta de saída em public/assets/kaykit/. */
  out: string;
  /** Pasta do pack extraído (dentro de --src) e a raiz do zip. */
  dir: string;
  root: string;
  /** Pasta dentro da raiz e nomes base (sem extensão); `.gltf` puxa o `.bin`. */
  groups: { path: string; files: string[]; ext: '.glb' | '.gltf' | '.png'; keepPath?: string }[];
}

const DUNGEON = [
  'stairs',
  'floor_tile_large', 'floor_tile_large_rocks', 'floor_tile_small', 'floor_tile_small_broken_A',
  'floor_tile_small_broken_B', 'floor_tile_small_decorated', 'floor_tile_big_grate', 'floor_dirt_large',
  'wall', 'wall_corner', 'wall_doorway', 'wall_arched', 'wall_cracked', 'wall_broken', 'wall_pillar',
  'wall_shelves', 'wall_window_closed', 'pillar', 'pillar_decorated', 'column', 'torch_mounted', 'torch_lit',
  'chest', 'chest_gold', 'barrel_large', 'barrel_small', 'barrel_small_stack', 'box_large', 'box_small',
  'box_stacked', 'crates_stacked', 'rubble_large', 'rubble_half', 'banner_red', 'banner_patternA_red',
  'banner_thin_red', 'coin_stack_small', 'coin_stack_medium', 'candle_lit', 'candle_triple', 'table_medium_broken',
  'table_small', 'chair', 'stool', 'sword_shield_broken', 'keyring_hanging', 'bottle_A_green', 'trunk_medium_A',
  // As Minas Inundadas (M3.2): chão de terra, paredes escoradas e a armação de escora solta.
  'floor_dirt_large_rocky', 'wall_scaffold', 'wall_doorway_scaffold', 'wall_window_closed_scaffold', 'wall_open_scaffold', 'keg',
];

const FOREST = ['Tree_1_A', 'Tree_2_A', 'Tree_3_A', 'Tree_4_A', 'Bush_1_A', 'Bush_2_A', 'Rock_1_A', 'Rock_2_A', 'Grass_1_A', 'Grass_2_A'].map((n) => `${n}_Color1`);

const KENNEY_TOWN = [
  'wall-wood', 'wall-wood-door', 'wall-wood-window-shutters', 'wall-wood-window-glass', 'wall', 'wall-door', 'wall-window-glass',
  'wall-window-shutters', 'roof-gable', 'roof-gable-end', 'roof-gable-top', 'roof', 'roof-corner', 'roof-point', 'chimney', 'stall-red',
  'stall-green', 'stall-bench', 'fountain-round', 'fountain-round-detail', 'tree', 'tree-high', 'tree-crooked', 'lantern', 'cart', 'road',
  'fence', 'fence-gate', 'banner-red', 'windmill', 'rock-large', 'planks', 'hedge', 'watermill', 'overhang', 'pillar-wood',
  // M2.1: ruínas e obras, e o resto da vila.
  'wall-broken', 'wall-wood-broken', 'wall-half', 'wall-wood-half', 'poles', 'poles-horizontal', 'planks-half', 'planks-opening',
  'banner-green', 'rock-small', 'rock-wide', 'stairs-stone', 'fence-broken', 'hedge-large', 'stall',
  // Vila em diorama: enxaimel, telhado alto com janela de sótão e o resto da praça.
  'wall-wood-detail-cross', 'wall-wood-detail-diagonal', 'wall-wood-detail-horizontal', 'wall-wood-window-small', 'wall-window-small',
  'roof-high', 'roof-high-window', 'roof-window', 'chimney-base', 'chimney-top', 'stairs-wide-stone', 'stairs-wide-stone-handrail',
  'fence-curved', 'cart-high', 'stall-stool', 'wheel', 'wall-block', 'wall-block-half',
];

/** Kenney Graveyard Kit 5.0: o cemitério do platô, a capela da Cripta e os pinheiros. */
const GRAVEYARD = [
  'crypt-large', 'crypt-large-door', 'crypt-large-roof', 'crypt', 'crypt-door', 'gravestone-round', 'gravestone-cross', 'gravestone-wide',
  'gravestone-broken', 'gravestone-bevel', 'gravestone-decorative', 'cross-wood', 'grave', 'grave-border', 'iron-fence', 'iron-fence-damaged',
  'iron-fence-border-gate', 'iron-fence-border-column', 'fence', 'fence-damaged', 'pine', 'pine-crooked', 'pine-fall', 'fire-basket',
  'lightpost-single', 'lightpost-double', 'lantern-candle', 'candle-multiple', 'debris', 'debris-wood', 'hay-bale', 'hay-bale-bundled', 'rocks',
  'rocks-tall', 'stone-wall', 'stone-wall-damaged', 'stone-wall-column', 'bench', 'bench-damaged', 'trunk', 'trunk-long', 'altar-stone',
  'pillar-obelisk', 'shovel-dirt', 'urn-round',
];

/** Kenney Castle Kit 2.0: a torre do Salão de Táticas, a muralha e as bandeiras. */
const CASTLE = [
  'tower-square-base', 'tower-square-base-border', 'tower-square-mid', 'tower-square-mid-windows', 'tower-square-mid-door', 'tower-square-top',
  'tower-square-top-roof', 'tower-square-top-roof-high', 'tower-square-roof', 'tower-top', 'flag', 'flag-banner-long', 'flag-banner-short',
  'flag-pennant', 'flag-wide', 'wall', 'wall-half', 'wall-corner', 'wall-doorway', 'wall-pillar', 'gate', 'stairs-stone', 'stairs-stone-square',
  'siege-ballista', 'rocks-large', 'rocks-small',
];

/** Kenney Cube Pets 2.0: só os bichos de casa da vila, no máximo 3 (pedido do usuário). */
const PETS = ['animal-dog', 'animal-cat', 'animal-chick'];

/** Kenney Survival Kit 2.0: as barracas do carroceiro, a forja ao ar livre e a lenha. */
const SURVIVAL = [
  'tent', 'tent-canvas', 'tent-canvas-half', 'campfire-pit', 'campfire-stand', 'workbench', 'workbench-anvil', 'workbench-grind', 'barrel',
  'barrel-open', 'box', 'box-large', 'box-open', 'chest', 'resource-wood', 'resource-planks', 'resource-stone', 'resource-stone-large',
  'signpost', 'signpost-single', 'fence', 'fence-doorway', 'fence-fortified', 'structure', 'structure-roof', 'structure-canvas', 'tool-axe',
  'tool-hammer', 'tool-shovel', 'tool-pickaxe', 'bucket', 'bedroll', 'tree-tall', 'tree', 'tree-log', 'tree-trunk', 'rock-a', 'rock-b',
  'rock-c', 'patch-grass', 'patch-grass-large', 'grass', 'grass-large', 'floor-old',
];

const TOOLS = ['anvil', 'grindstone', 'map', 'compass_base', 'blueprint', 'bucket_metal', 'axe', 'hammer', 'saw', 'shovel', 'lantern', 'pickaxe'];
const RESOURCE = [
  'Wood_Log_Stack', 'Wood_Planks_Stack_Medium', 'Stone_Bricks_Stack_Medium', 'Iron_Bars_Stack_Small', 'Textiles_Stack_Small', 'Pallet_Wood', 'Wood_Log_A',
  // Minério e pedra das minas (M3.2).
  'Iron_Nuggets', 'Iron_Nugget_Large', 'Stone_Chunks_Large', 'Stone_Chunks_Small', 'Wood_Planks_Stack_Small',
];
const FURNITURE = ['table_medium', 'chair_A_wood', 'bed_single_A', 'chair_stool_wood', 'shelf_A_small'];
const MIXED = ['flax_flower_A', 'flax_flower_B', 'guitar_A', 'circus_tent', 'umbrella_green', 'mining_helmet'];

export const PACKS: PackEntry[] = [
  {
    out: 'adventurers',
    dir: 'adventurers',
    root: 'KayKit_Adventurers_2.0_FREE',
    groups: [
      { path: 'Characters/gltf', ext: '.glb', files: ['Barbarian', 'Knight', 'Mage', 'Ranger', 'Rogue', 'Rogue_Hooded'] },
      {
        path: 'Assets/gltf', ext: '.gltf',
        files: ['sword_1handed', 'sword_2handed', 'axe_1handed', 'axe_2handed', 'dagger', 'shield_round', 'shield_square', 'shield_spikes'],
      },
      { path: 'Assets/gltf', ext: '.png', files: ['knight_texture', 'barbarian_texture', 'rogue_texture'] },
    ],
  },
  {
    out: 'skeletons',
    dir: 'skeletons',
    root: 'KayKit_Skeletons_1.1_FREE',
    groups: [
      { path: 'characters/gltf', ext: '.glb', files: ['Skeleton_Minion', 'Skeleton_Warrior', 'Skeleton_Rogue', 'Skeleton_Mage'] },
      { path: 'assets/gltf', ext: '.gltf', files: ['Skeleton_Blade', 'Skeleton_Axe', 'Skeleton_Staff', 'Skeleton_Shield_Small_A', 'Skeleton_Shield_Large_A'] },
      { path: 'assets/gltf', ext: '.png', files: ['skeleton_texture'] },
    ],
  },
  {
    out: 'animations',
    dir: 'animations',
    root: 'KayKit_Character_Animations_1.1',
    groups: [
      {
        path: 'Animations/gltf/Rig_Medium', ext: '.glb',
        files: [
          'Rig_Medium_General', 'Rig_Medium_MovementBasic', 'Rig_Medium_CombatMelee', 'Rig_Medium_CombatRanged', 'Rig_Medium_Special',
          'Rig_Medium_Simulation', 'Rig_Medium_Tools',
        ],
      },
    ],
  },
  {
    out: 'hexagon',
    dir: 'hexagon',
    root: 'KayKit_Medieval_Hexagon_Pack_1.0_FREE',
    groups: [
      // Só o alvo e o suporte de armas do treinador (ampliados). Os prédios do Hexagon perderam para o
      // Kenney no teste lado a lado (docs §3.1) e não entram no jogo.
      { path: 'Assets/gltf/decoration/props', ext: '.gltf', files: ['target', 'weaponrack'] },
    ],
  },
  {
    // KayKit Fantasy Weapons Bits 1.0: as armas do Ato II (martelo, lança e alabarda, M3.1) e as malhas
    // das bases antigas dos tiers 6 em diante (M3.2).
    out: 'weapons',
    dir: 'weapons',
    root: 'KayKit_FantasyWeaponsBits_1.0_FREE',
    groups: [
      {
        path: 'Assets/gltf', ext: '.gltf',
        files: [
          'hammer_A', 'hammer_B', 'hammer_C', 'spear_A', 'halberd', 'sword_B', 'sword_C', 'sword_E',
          'axe_A', 'axe_B', 'axe_C', 'dagger_A', 'dagger_B', 'shield_B', 'shield_C',
        ],
      },
    ],
  },
  {
    out: 'tools',
    dir: 'tools',
    root: 'KayKit_RPGToolsBits_1.0_FREE',
    groups: [
      { path: 'Assets/gltf', ext: '.gltf', files: TOOLS },
    ],
  },
  {
    out: 'resource',
    dir: 'resource',
    root: 'KayKit_ResourceBits_1.0_FREE',
    groups: [
      { path: 'Assets/gltf', ext: '.gltf', files: RESOURCE },
    ],
  },
  {
    out: 'furniture',
    dir: 'furniture',
    root: 'KayKit_Furniture_Bits_1.0_FREE',
    groups: [
      { path: 'Assets/gltf', ext: '.gltf', files: FURNITURE },
    ],
  },
  {
    out: 'mixed',
    dir: 'mixedbag',
    root: 'KayKit_Mixed_Bag_1_FREE',
    groups: [
      { path: 'Assets/gltf', ext: '.gltf', files: MIXED },
    ],
  },
  {
    out: 'forest',
    dir: 'forest',
    root: 'KayKit_Forest_Nature_Pack_1.0_FREE',
    groups: [
      { path: 'Assets/gltf', ext: '.gltf', files: FOREST },
      { path: 'Assets/gltf', ext: '.png', files: ['forest_texture'] },
    ],
  },
  {
    // Kenney Fantasy Town Kit 2.0 (CC0): os prédios da vila (docs §3.1).
    out: 'kenney-town',
    dir: 'kenney-fantasy-town',
    root: 'Models/GLB format',
    groups: [
      { path: '', ext: '.glb', files: KENNEY_TOWN },
      { path: 'Textures', ext: '.png', files: ['colormap'], keepPath: 'Textures' },
    ],
  },
  ...([['kenney-graveyard', GRAVEYARD], ['kenney-castle', CASTLE], ['kenney-survival', SURVIVAL], ['kenney-cube-pets', PETS]] as const).map(([name, files]): PackEntry => ({
    // Kenney Graveyard, Castle, Survival e Cube Pets (CC0): o diorama da vila e os bichos (docs §14.3).
    out: name,
    dir: name,
    root: 'Models/GLB format',
    groups: [
      { path: '', ext: '.glb', files: [...files] },
      { path: 'Textures', ext: '.png', files: ['colormap'], keepPath: 'Textures' },
    ],
  })),
  {
    out: 'dungeon',
    dir: 'dungeon',
    root: 'KayKit_Dungeon_Pack_1.1_FREE',
    groups: [
      { path: 'Assets/gltf', ext: '.gltf', files: DUNGEON },
      { path: 'Assets/gltf', ext: '.png', files: ['dungeon_texture'] },
    ],
  },
];

export const ALLOWED_EXT = ['.gltf', '.bin', '.glb', '.png'];
export const MAX_BYTES = 4 * 1024 * 1024;
