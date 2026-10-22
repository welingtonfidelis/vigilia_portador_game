# Licenças da arte

Toda a arte 3D do Vigília: O Portador da Chama vem da família **KayKit**, de **Kay Lousberg** (https://kaylousberg.com, https://kaylousberg.itch.io). Todos os packs usados estão sob **Creative Commons Zero v1.0 Universal (CC0 1.0)**: domínio público, uso livre (inclusive comercial) e sem crédito obrigatório. Mesmo assim, o jogo credita "Kay Lousberg, www.kaylousberg.com" no menu e no README.

O autor também pede que não se revendam cópias sem modificação nem se apresentem os modelos como próprios. Isso é um pedido, não uma condição da licença, e o projeto segue o pedido.

Download feito em **2026-10-22**, da versão **Free** de cada pack, pela página de download do itch.io. Os arquivos ficam fora do repositório, em `~/Downloads/vigilia-portador-kaykit/`, e são tratados como dados não confiáveis (`docs/VIGILIA-PORTADOR.md`, §3.4). Só os arquivos listados em `tools/art-manifest.ts` são copiados para `public/assets/kaykit/`.

## Packs

| Pack | Versão | Página | Licença na página de download | Licença no `License.txt` do zip | Arquivo baixado | Tamanho | SHA-256 do zip |
|---|---|---|---|---|---|---|---|
| KayKit - Character Pack : Adventurers | 2.0 (Free) | https://kaylousberg.itch.io/kaykit-adventurers | Asset license: Creative Commons Zero v1.0 Universal | "License: (Creative Commons Zero, CC0)", criado em 22/10/2025 | Free 2.0 → `adventurers.zip` | 13 024 345 B | `abe48f4763fba0896bab486ee9e6d08ca6b5b3884b9601f235c8847ae94dc479` |
| KayKit - Character Pack : Skeletons | 1.1 (Free) | https://kaylousberg.itch.io/kaykit-skeletons | Asset license: Creative Commons Zero v1.0 Universal | "License: (Creative Commons Zero, CC0)", criado em 22/10/2025 | Free 1.1 → `skeletons.zip` | 8 177 445 B | `21fbad59ee6cc1d7bed12d0e425acab8ebe564b8620bbc1d017aedb29dd8a3d2` |
| KayKit - Character Animations | 1.1 (Free) | https://kaylousberg.itch.io/kaykit-character-animations | Asset license: Creative Commons Zero v1.0 Universal | "License: (Creative Commons Zero, CC0)", criado em 10/12/2025 | Free 1.1 → `animations.zip` | 14 858 957 B | `65882f31f905ad2e953819648a59287cdeab8f623908d5ef701971d3758be20f` |
| KayKit - Dungeon Pack | 1.1 (Free) | https://kaylousberg.itch.io/kaykit-dungeon-pack | Asset license: Creative Commons Zero v1.0 Universal | "License: (Creative Commons Zero, CC0)", criado em 16/07/2026 | Free 1.1 → `dungeon.zip` | 32 868 755 B | `6acb859d1aefae074f937d1e6f13656a7312b2bdb6d9f1232ebdade8d93d6a1c` |
| KayKit - Medieval Hexagon Pack | 1.0 (Free) | https://kaylousberg.itch.io/kaykit-medieval-hexagon | Asset license: Creative Commons Zero v1.0 Universal | "License: (Creative Commons Zero, CC0)", criado em 26/04/2024 | Free → `hexagon.zip` | 35 251 508 B | `4fbb374c45732c88522bd3439e9415bf568c683236ede336b4e61d161155ba12` |
| KayKit : Fantasy Weapons Bits | 1.0 (Free) | https://kaylousberg.itch.io/fantasy-weapons-bits | Asset license: Creative Commons Zero v1.0 Universal | "License: (Creative Commons Zero, CC0)", criado em 19/02/2026 | Free → `weapons.zip` | 3 375 694 B | `1017144f85a994f405b731befa71ced360f5b60ed0b9c00c72e711c1633ce2d2` |

Texto da licença (o mesmo nos seis `License.txt`):

> License: (Creative Commons Zero, CC0)
> http://creativecommons.org/publicdomain/zero/1.0/
> This content is free to use in personal, educational and commercial projects.
> If you wish to credit me you can do so by crediting "Kay Lousberg, www.kaylousberg.com" (this is not mandatory)

## O que entrou no jogo

A lista exata, com o tamanho e o SHA-256 de cada arquivo copiado, é gerada por `npm run art` em `public/assets/kaykit/manifest.json`. Resumo:

| Pack | Arquivos usados |
|---|---|
| Adventurers 2.0 | `Characters/gltf/{Barbarian,Knight,Mage,Ranger,Rogue}.glb` e as texturas; `Assets/gltf/{sword_1handed,sword_2handed,axe_1handed,axe_2handed,dagger,shield_round,shield_square,shield_spikes}` (`.gltf` + `.bin`) |
| Skeletons 1.1 | `characters/gltf/Skeleton_{Minion,Warrior,Rogue,Mage}.glb` e a textura; `assets/gltf/Skeleton_{Blade,Axe,Staff,Shield_Small_A}` |
| Character Animations 1.1 | `Animations/gltf/Rig_Medium/Rig_Medium_{General,MovementBasic,CombatMelee,CombatRanged,Special}.glb` (o CombatRanged entrou no M1, para o mago e o Senhor da Cripta) |
| Dungeon 1.1 | Piso, paredes, porta, pilares, tochas, baús, barris, caixas, entulho, estandartes e moedas (lista no manifesto) |
| Medieval Hexagon 1.0 | Ainda não usado no M0 (reservado para a vila em 3D, M2) |
| Fantasy Weapons Bits 1.0 | Ainda não usado no M0 (reservado para as armas dos atos seguintes) |

## Fora da família (nenhum por enquanto)

| Fonte | Licença | Situação |
|---|---|---|
| Mixamo (Adobe) | Termos da Adobe, **não** CC0 | Não usado. Se um dia entrar, conferir os termos do dia e registrar aqui |
| Packs EXTRA e SOURCE do KayKit | CC0, mas pagos | Não comprados. A compra é decisão do usuário |
