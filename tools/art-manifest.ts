/**
 * Lista exata do que sai de cada pack KayKit baixado para public/assets/kaykit/<pack>/.
 * Os caminhos são relativos à pasta extraída do pack (packs/<pack>/<raiz do zip>/).
 * Nada fora desta lista é copiado; ver docs/VIGILIA-PORTADOR.md §3.4.
 */
export interface PackEntry {
  /** Pasta de saída em public/assets/kaykit/. */
  out: string;
  /** Pasta do pack extraído (dentro de --src) e a raiz do zip. */
  dir: string;
  root: string;
  /** Pasta dentro da raiz e nomes base (sem extensão); `.gltf` puxa o `.bin`. */
  groups: { path: string; files: string[]; ext: '.glb' | '.gltf' | '.png' }[];
}

const DUNGEON = [
  'floor_tile_large', 'floor_tile_large_rocks', 'floor_tile_small', 'floor_tile_small_broken_A',
  'floor_tile_small_broken_B', 'floor_tile_small_decorated', 'floor_tile_big_grate', 'floor_dirt_large',
  'wall', 'wall_corner', 'wall_doorway', 'wall_arched', 'wall_cracked', 'wall_broken', 'wall_pillar',
  'wall_shelves', 'wall_window_closed', 'pillar', 'pillar_decorated', 'column', 'torch_mounted', 'torch_lit',
  'chest', 'chest_gold', 'barrel_large', 'barrel_small', 'barrel_small_stack', 'box_large', 'box_small',
  'box_stacked', 'crates_stacked', 'rubble_large', 'rubble_half', 'banner_red', 'banner_patternA_red',
  'banner_thin_red', 'coin_stack_small', 'coin_stack_medium', 'candle_lit', 'candle_triple', 'table_medium_broken',
  'table_small', 'chair', 'stool', 'sword_shield_broken', 'keyring_hanging', 'bottle_A_green', 'trunk_medium_A',
];

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
        files: ['Rig_Medium_General', 'Rig_Medium_MovementBasic', 'Rig_Medium_CombatMelee', 'Rig_Medium_Special'],
      },
    ],
  },
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
