# Patch notes — alterações após a correção de abertura do site

## Resumo

- Atualização visual das árvores com novos fundos de clãs.
- Padronização do enquadramento dos personagens conforme o modelo Uchiha.
- Correções anatômicas e de orientação em fundos específicos.
- Atualização do mapeamento de assets e do cache do site.
- Validação de resolução e carregamento HTTP dos fundos.

## Alterações completas

### Novos fundos de clãs

Foram criados e adicionados fundos individuais para:

- Sarutobi
- Hatake
- Yamanaka
- Kamaitachi, com Temari
- Hoshigaki
- Hozuki
- Kaguya, representando o clã da manipulação de ossos, não os Ōtsutsuki
- Yuki
- Chinoike
- Raikage
- Yotsuki
- Kamizuru
- Onoki
- Bakurei

Todos receberam identidade visual própria, paleta baseada na árvore correspondente, personagem no lado direito, centro livre para os nós e costas sem símbolos.

### Correções visuais

- Hozuki: removido o braço/mão extra; o personagem agora possui exatamente dois braços.
- Yuki: personagem reorientado para olhar para a esquerda, em direção ao centro da árvore.
- Chinoike: personagem reduzida para se aproximar do enquadramento Uchiha e corrigida a posição do braço, sem mão ou cotovelo quebrado atrás do corpo.
- Onoki: personagem ampliado para não ficar menor que os demais fundos.
- Nara: dedo corrigido e símbolo das costas removido.
- Iryō Ninjutsu: personagem ampliado e reenquadrado.
- Bukijutsu: personagem ampliado e reenquadrado.
- Genjutsu: personagem ampliado e reenquadrado.

### Padronização técnica

- Fundos convertidos para WebP em resolução exata de 1672×941.
- Mapeamento `CLAN_BACKGROUNDS` atualizado para todos os novos clãs.
- Versão de cache dos assets atualizada de `20260804-e` até `20260804-h` durante as substituições.
- Versões de cache de `app.js` atualizadas para garantir que o navegador baixe as imagens novas.
- Site reiniciado após as alterações.

### Validação

- `public/app.js` validado com `node --check`.
- Todos os fundos revisados com metadados de 1672×941.
- Página principal e os assets novos testados via HTTP, todos retornando status 200.

### Observação

Este patch note não inclui a correção original que permitiu abrir o site nem as mudanças de balanceamento, inventário, árvores e descrições documentadas no patch note geral.
