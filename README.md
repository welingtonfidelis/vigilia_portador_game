# Vigília: O Portador da Chama

RPG idle em 3D no navegador. Um herói desce sozinho à Cripta, luta contra grupos de esqueletos e sempre volta para a vila: vitorioso, ferido ou carregado. Você não controla a luta. Você escolhe o que ele veste, o que aprende, as regras que segue e até onde ele desce. A vila cresce com o que ele traz.

![Luta no anel de contato](docs/img/luta-elite.jpg)

- **Jogar no navegador** (computador ou celular): [https://welingtonfidelis.github.io/vigilia_portador_game/](https://welingtonfidelis.github.io/vigilia_portador_game/)
- **Documentação única** (GDD, estado, arquitetura, arte e balanceamento): [`docs/VIGILIA-PORTADOR.md`](docs/VIGILIA-PORTADOR.md)
- **Licenças da arte:** [`LICENSES.md`](LICENSES.md)

## Rodar

```bash
npm install
npm run dev        # http://localhost:5173 · com --host, abre no celular pela rede
npm test           # testes da simulação
npm run balance    # balanceador: confere as metas do GDD (§2.12)
```

A arte já vem no repositório, em `public/assets/kaykit/`: só as peças que o jogo usa, tiradas dos packs. `npm run art` serve apenas para trocar ou acrescentar peças. Ele recopia dos zips originais, baixados fora do repositório, o que está listado em `tools/art-manifest.ts`. As fontes e as licenças estão em `LICENSES.md`.

Stack: TypeScript, Vite, Three.js e Preact. A simulação (`src/sim`) é pura, determinística e serializada em JSON; o 3D só mostra o que ela decide.

## Créditos

Arte 3D: **KayKit**, de Kay Lousberg (www.kaylousberg.com); a vila, do **Kenney** (www.kenney.nl); os monstros dos Fungos, do **Quaternius** (quaternius.com). Tudo sob CC0 1.0 (detalhes em [`LICENSES.md`](LICENSES.md)). A estrutura do jogo nasceu do [Vigília](../vigilia).
