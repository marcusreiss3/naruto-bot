# Auditoria de balanceamento — Kugutsu e Shirogane

> **Status:** este relatório registra a auditoria e a proposta da etapa 2. O
> pacote aprovado foi implementado na etapa 3; para os valores e regras em
> vigor, consulte `BALANCEAMENTO_FINAL.txt` e as definições do código.

## Escopo

Relatório somente de leitura do estado do código antes da implementação da
etapa 3. A auditoria em si não alterou regras de gameplay.

Foram avaliados: carapaças, mecanismos, ações, recursos, sobrevivência,
destruição, reconstrução, economia e a árvore Shirogane.

## Resumo executivo

Kugutsu já possui contrapesos estruturais saudáveis: oficina, materiais,
tempo de construção, posição da marionete, alcance dos fios, ação do condutor
e destruição que exige reconstrução. Esses contrapesos sustentam a identidade
do sistema, mas não justificam que a categoria lidere dano, Barreira e controle
ao mesmo tempo.

Os principais desvios são:

1. As três carapaças recebem bônus-base ocultos além dos valores descritos na
   árvore.
2. Carapaça Resistente entrega Barreira muito acima das técnicas comparáveis e
   pode acumular com a própria reaplicação.
3. Carapaça de efeito amplia qualquer efeito, incluindo Imobilização e
   Atordoamento, para durações excessivas.
4. Shirogane reúne dano, custo, alcance, Barreira ignorada, economia de craft
   e terceira vaga; parte de seus bônus de efeitos não produz resultado prático
   com os mecanismos atuais.
5. A destruição da marionete é uma consequência relevante, mas não é uma perda
   de build: mecanismos permanecem instalados e a reconstrução pede somente
   metade dos materiais da carapaça, sem Ryō.

## 1. Estrutura atual de Kugutsu

| Aspecto | Regra atual |
|---|---|
| Oficina inicial | Nível 1, 5 pontos de Kugutsu |
| Mecanismos Grau I | Níveis 4–6 |
| Mecanismos Grau II | Níveis 10–15 |
| Mecanismos Grau III | Níveis 20–22 |
| Marionetes possuídas | Até 5 |
| Marionetes em campo | 1; 2 no nível 8; 3 no nível 24 |
| Mecanismos por marionete | 2; Shirogane libera 3 em uma única marionete |
| Alcance dos fios | 2; 3 no nível 6; 4 no nível 14; 5 no nível 22 |
| Ação de ataque | Do condutor, não da marionete |
| Chakra de técnicas | Do condutor, não da marionete |
| Movimento | Cada marionete tem o seu próprio movimento |
| Destruição | Impede invocação até reconstrução; mecanismos são preservados |
| Reconstrução | Metade dos materiais da carapaça, sem Ryō, duração de 2 horas |

### Leitura de design

O sistema não gera ações comuns ou reservas de Chakra extras. Isso é correto:
mais marionetes aumentam presença, bloqueio de espaço, alcance operacional e
combos, não o número normal de técnicas por turno.

O custo de destruição não deve ser usado como justificativa para dano acima da
régua. O jogador pode manter até cinco marionetes e a reconstrução não perde
mecanismos nem cobra Ryō; é um atraso persistente, não uma perda completa da
build.

## 2. Carapaça ofensiva

### Valores efetivos

| Marco da árvore | Bônus informado | Bônus efetivo no código |
|---|---:|---:|
| Inicial | +12% | +22% |
| Intermediário | +25% | +35% |
| Ápice | +35% | +45% |

O código adiciona +10% de dano-base à carapaça ofensiva e depois soma o bônus
da árvore. Os mecanismos de alvo único já nascem com cerca de 35% de dano-base
acima da referência de Bukijutsu; no ápice, os dois multiplicadores se somam
na mesma build.

| Nível | Mecanismos de dano disponíveis | Dano médio com carapaça ofensiva | Melhor golpe |
|---|---:|---:|---:|
| 10 | 4 | 33,25 | 50,02 |
| 20 | 7 | 48,89 | 73,95 |
| 30+ | 8 | 52,02 | 73,95 |

### Avaliação

O dano sustentado fica alto, mas a categoria ainda paga Chakra e só usa a ação
do condutor. O excesso aparece principalmente quando esse bônus oculto se junta
ao Shirogane. A referência futura deve usar o bônus final anunciado na árvore,
sem uma camada-base invisível.

## 3. Carapaça defensiva

### Vida da marionete

A Vida-base da marionete é 20% da Vida do condutor, mais 0,2 ponto percentual
por nível até o nível 30, com mínimo de 35 HP. Isso equivale a 26% da Vida do
condutor no nível 30 ou maior.

| Marco da árvore | Bônus informado | Bônus efetivo de Vida/Barreira |
|---|---:|---:|
| Inicial | +15% | +27% |
| Intermediário | +30% | +42% |
| Ápice | +45% | +57% |

No topo, a marionete defensiva fica com aproximadamente 41% da Vida do
condutor antes de outros efeitos. Isso é uma resistência relevante, mas não é
o maior problema da carapaça.

### Carapaça Resistente

Essa técnica de Grau II, liberada no nível 15, protege o **condutor** e aplica
Imobilização nele por duas rodadas. A Barreira é composta por valor fixo mais
percentual da Vida máxima do condutor.

| Situação | Barreira atual |
|---|---:|
| Sem bônus de carapaça | 18 fixo + 35% da Vida máxima |
| Defensiva no nível 15 | 26 fixo + aproximadamente 50% da Vida máxima |
| Defensiva completa | 28 fixo + aproximadamente 55% da Vida máxima |

Como comparação, muitas Barreiras de outras categorias ficam entre 5–9 fixo e
6–13% da Vida máxima. Exemplos incluem Muralha de Água (7 + 9%) e Domo de
Iceberg (9 + 13%).

Além do valor alto, Carapaça Resistente não usa grupo de substituição: reaplicar
a técnica soma uma nova Barreira à existente. A Imobilização impede movimento,
mas não impede técnicas; portanto, ela não evita uma sequência de reaplicações.

### Escudo Luz Mecânica

Escudo Luz Mecânica protege a própria marionete, não o condutor. Seu valor é
8 fixo + 12% da Vida da marionete, ampliado pela carapaça defensiva. Como o HP
da marionete é bem menor que o do jogador, esse mecanismo não apresenta o mesmo
risco de excesso e pode ser mantido como referência defensiva local.

### Avaliação

Carapaça Resistente é o maior ponto de desequilíbrio confirmado fora do dano.
O relatório recomenda decidir seu novo valor somente após definir a faixa-alvo
de Barreiras para uma técnica de Grau II com Imobilização como contrapartida.

## 4. Carapaça de efeito

### Valores efetivos

| Marco da árvore | Duração extra informada | Duração extra efetiva |
|---|---:|---:|
| Inicial | +1 rodada | +2 rodadas |
| Intermediário | +2 rodadas | +3 rodadas |
| Ápice | +3 rodadas | +4 rodadas |

Existe uma rodada-base oculta, somada ao bônus da árvore. O código amplia todos
os efeitos da técnica da marionete, sem separar dano contínuo de controle.

| Mecanismo | Efeito original | Efeito no ápice da carapaça |
|---|---:|---:|
| Capturar | Imobilização por 1 rodada | Imobilização por 5 rodadas |
| Múltiplos Braços | 65% de Atordoamento por 1 rodada | 65% de Atordoamento por 5 rodadas |
| Lâmina Agulha | Veneno por 3 rodadas | Veneno limitado a 5 rodadas |
| Tiro Destrutivo | Sangramento por 2 rodadas | Sangramento por 6 rodadas |
| Lança-Chamas | Queimadura por 3 rodadas | Queimadura por 7 rodadas |

Veneno possui teto de cinco rodadas. Sangramento, Queimadura, Imobilização e
Atordoamento não têm teto geral de duração nesse fluxo.

O bônus de drenagem de Chakra é calculado e salvo na marionete, mas não é lido
na resolução de combate. Nenhum mecanismo atual aplica CHAKRA_DRAIN, portanto
essa parte da carapaça não produz efeito real.

### Avaliação

A carapaça de efeito precisa de identidade clara: desgaste contínuo ou
controle. No estado atual ela entrega ambos em intensidade alta. Estender
controle rígido para cinco rodadas é incompatível com a régua geral do combate.

## 5. Mecanismos e picos de combate

| Mecanismo | Nível | Dano-base | Chakra | Limites relevantes |
|---|---:|---:|---:|---|
| Tiro de Mecanismo Destrutivo | 4 | 22 | 18 | Sangramento por 2 rodadas |
| Lâmina Agulha | 5 | 22 | 22 | Veneno por 3 rodadas |
| Ataque da Super Arma | 6 | 24 | 32 | Área e Veneno por 3 rodadas |
| Múltiplos Braços | 10 | 41 | 42 | 65% de Atordoamento, alcance 1 |
| Lança-Chamas | 13 | 35 | 36 | Queimadura por 3 rodadas |
| Cauda de Escorpião | 14 | 41 | 56 | Veneno e Sangramento |
| Dama de Ferro | 20 | 51 | 66 | Duas marionetes, alvo Imobilizado, uma vez por combate |
| Atacando de Ambos os Lados | 22 | 51 | 66 | Duas marionetes, inesquivável, uma vez por combate |

Os mecanismos de Grau III já têm contrapartidas adequadas e podem continuar
como picos de execução. O ajuste deve priorizar dano sustentado, Barreira e
duração de efeitos antes de reduzir esses combos.

Ataque Descuidado permite uma técnica ofensiva adicional com ação bônus depois
da ação comum. O preço é o próximo golpe recebido acertar sem Esquiva,
Bloqueio ou Aparo. A regra é conceitualmente boa e já não concede Chakra ou
ação comum extra; precisa apenas de teste de integração para preservar a
penalidade em todos os caminhos de combate.

## 6. Shirogane

### Benefícios atuais

| Nó | Benefício atual | Situação na prática |
|---|---|---|
| Domínio dos Fios | -10% Chakra; -10% Ryō e materiais de criar/reconstruir | Funciona |
| Engenharia Letal | +10% dano de Kugutsu | Funciona |
| Fios Precisos | +1 alcance de Kugutsu | Funciona |
| Venenos Calibrados | +15 p.p. Veneno; +10 p.p. Sangramento | Não muda mecanismos atuais, que já têm 100% de chance |
| Oficina Mestra | Mais 12% de desconto de craft | Funciona; total aproximado de 21% |
| Braço Extra | Terceiro mecanismo em uma marionete | Funciona |
| Mestre Marionetista | +15% dano e ignora Barreira | Funciona |

No ápice, Engenharia Letal e Mestre Marionetista se multiplicam: 1,10 × 1,15
= 1,265. Somados à carapaça ofensiva efetiva de 1,45, o resultado atual é
1,834× sobre o mecanismo-base.

| Cenário no nível 22 | Dano médio | Melhor golpe | Custo/dano |
|---|---:|---:|---:|
| Carapaça ofensiva, sem Shirogane | 52,02 | 73,95 | 0,81 |
| Carapaça ofensiva + Shirogane completo | 65,80 | 93,55 | 0,58 |

### Avaliação

Shirogane deve continuar sendo a melhor especialização para Kugutsu, mas hoje
acumula melhorias de dano, economia, alcance, terceira vaga e perfuração de
Barreira. A combinação fica acima de uma especialização de clã convencional.

O nó Venenos Calibrados precisa ser substituído ou ter seus mecanismos
associados revisados; um bônus que não gera mudança mensurável não deve ocupar
um ponto da árvore.

## 7. Cobertura de testes atual

Os testes atuais verificam dados estáticos importantes: dano-base dos
mecanismos, custo de Chakra, limite de dois/três mecanismos e passivas de
Shirogane. Faltam testes de combate que validem:

- valor final de cada carapaça no participante de combate;
- Barreira de Carapaça Resistente e comportamento ao reaplicar;
- alvo correto de cada Barreira;
- duração final de cada efeito por carapaça;
- ausência ou presença real de Dreno de Chakra;
- uso de ação comum/bônus e a punição de Ataque Descuidado;
- custo de Chakra com Shirogane;
- destruição, reconstrução e preservação de mecanismos.

## 8. Decisões necessárias para a etapa 2

1. Qual é a faixa-alvo de Barreira para Carapaça Resistente, comparada às
   Barreiras de Grau II e às técnicas de rank alto?
2. A carapaça de efeito deve ser focada em dano contínuo, em controle leve ou
   em uma mistura limitada dos dois?
3. O bônus de drenagem de Chakra deve virar um mecanismo real, outra melhoria
   funcional ou sair da árvore?
4. Shirogane deve manter dois bônus de dano, ou ficar com apenas um e preservar
   seus diferenciais de alcance, oficina e terceiro mecanismo?
5. A Barreira de Carapaça Resistente deve substituir a própria Barreira anterior
   ou acumular? A recomendação técnica é substituir/refrescar, não acumular.

## Próximas etapas, após aprovação

### Etapa 2 — proposta de rebalanceamento

Definir números e efeitos finais para cada carapaça, mecanismos e Shirogane a
partir desta auditoria. Nenhum valor será escolhido sem sua aprovação.

### Etapa 3 — implementação conjunta

Aplicar o pacote aprovado de forma atômica: código, árvores, descrições,
testes e `BALANCEAMENTO_FINAL.txt` no mesmo conjunto de mudanças.

### Etapa 4 — validação e entrega

Executar testes, revisar os cenários de combate, criar o commit e fazer push
somente depois da validação final.

**Concluída:** os testes focados de Kugutsu, passivas, efeitos, movimento,
alvos, balanceamento e guias foram executados após a implementação. O
typecheck e a verificação de diff também foram concluídos antes da entrega.

## 9. Etapa 2 — proposta de rebalanceamento para aprovação

Esta seção registra a proposta que foi aprovada e aplicada ao código, às
árvores e ao site na etapa 3.

### 9.1 Princípios usados

1. Kugutsu deve ser recompensador por execução, posicionamento e preparo, não
   por ultrapassar as demais categorias em todo atributo.
2. A carapaça define uma especialidade. Ela não deve conceder um bônus oculto
   além da especialidade mostrada ao jogador.
3. Shirogane continua sendo o melhor clã para Kugutsu, mas sua recompensa deve
   vir principalmente de precisão, oficina e opções de montagem.
4. Técnicas de duas marionetes podem manter picos altos porque já têm requisitos
   de montagem e uso único por combate.

### 9.2 Pacote recomendado — carapaça ofensiva

| Marco | Atual efetivo | Proposta |
|---|---:|---:|
| Inicial | +22% dano | +10% dano |
| Intermediário | +35% dano | +18% dano |
| Ápice | +45% dano | +25% dano |

Implementação proposta:

- Remover os +10% ocultos da carapaça ao entrar em combate.
- Ajustar os nós da árvore para +10%, +18% e +25%, como valores totais.
- Manter o prêmio de dano-base já existente nos mecanismos de alvo único; ele
  já representa a oficina, a peça instalada e a vaga limitada.

Projeção de dano sem Shirogane:

| Nível | Atual | Proposta |
|---|---:|---:|
| 10 | 33,25 | 29,98 |
| 20 | 48,89 | 42,14 |
| 30+ | 52,02 | 44,84 |

O melhor golpe de Grau III passa de 73,95 para 63,75 antes de Shirogane. Isso
mantém Kugutsu acima de uma técnica comum quando a montagem está pronta, sem
transformar o dano sustentado em teto universal.

### 9.3 Pacote recomendado — carapaça defensiva

| Aspecto | Atual efetivo | Proposta |
|---|---:|---:|
| Vida da marionete no ápice | +57% | +45% |
| Escudo Luz Mecânica | Amplificado pela carapaça | Mantido; protege apenas a marionete |
| Carapaça Resistente | 28 + 55% da Vida; acumula | 7 + 10% da Vida; 2 rodadas; substitui/refresca a própria Barreira |

Implementação proposta:

- Remover os +12% ocultos de Vida/força de Barreira da carapaça defensiva.
- Manter a árvore em +15%, +30% e +45% de Vida para a marionete.
- Aplicar o bônus de força de Barreira somente ao Escudo Luz Mecânica, que
  protege a própria marionete.
- Carapaça Resistente continua protegendo o condutor, custa 18 de Chakra, usa
  ação comum e aplica Imobilização por 2 rodadas, mas sua Barreira não recebe o
  multiplicador da carapaça defensiva.
- Adicionar um grupo próprio de substituição à Carapaça Resistente: reaplicar
  renova/substitui a Barreira daquela técnica, sem acumulá-la.

O valor proposto fica na faixa das Barreiras comuns (Muralha de Água: 7 + 9%)
e abaixo das maiores Barreiras. A diferença é que Carapaça Resistente cobra
ação comum, Chakra e dois turnos sem movimento; ela continua sendo uma opção
defensiva útil, não uma Barreira de rank alto disfarçada.

### 9.4 Pacote recomendado — carapaça de efeito

Identidade recomendada: **desgaste contínuo**, não controle rígido.

| Efeito | Regra proposta |
|---|---|
| Veneno, Sangramento e Queimadura | Recebem +1 rodada no primeiro nó e +2 rodadas no segundo; teto de 5 rodadas |
| Imobilização e Atordoamento | Não recebem duração extra da carapaça |
| Bônus-base oculto | Removido |
| Drenagem de Chakra | Sai da descrição e da árvore até existir um mecanismo que a aplique de verdade |

Proposta para o ápice, **Mestre dos Dispositivos**:

- Técnicas de marionete da carapaça de efeito que apliquem Veneno,
  Sangramento ou Queimadura custam 10% menos Chakra.

Isso mantém o ápice útil sem transformar o ramo em controle de cinco rodadas.
O desconto fica restrito a mecanismos de desgaste e não se soma a técnicas sem
efeito contínuo.

### 9.5 Pacote recomendado — Shirogane

| Nó | Atual | Proposta |
|---|---|---|
| Domínio dos Fios | -10% Chakra e -10% craft | -10% Chakra |
| Engenharia Letal | +10% dano | Mantido |
| Fios Precisos | +1 alcance | Mantido |
| Venenos Calibrados | Chance extra inócua | +1 rodada de Veneno e Sangramento, limitado ao teto de duração |
| Oficina Mestra | Mais 12% de craft | -15% de Ryō e materiais de criar/reconstruir |
| Braço Extra | 3º mecanismo em uma marionete | Mantido |
| Mestre Marionetista | +15% dano e ignora Barreira | Ignora Barreira, sem dano adicional |

Com a ofensiva proposta, Shirogane completo ficaria em 1,25 × 1,10 = 1,375×
de dano sobre o mecanismo-base, em vez dos atuais 1,834×. No nível 22, isso
projeta aproximadamente:

| Cenário | Dano médio | Melhor golpe | Custo/dano |
|---|---:|---:|---:|
| Ofensiva sem Shirogane | 44,84 | 63,75 | 0,94 |
| Ofensiva com Shirogane | 49,32 | 70,13 | 0,77 |

Shirogane continuaria sendo a combinação de referência para Kugutsu: ganha
economia de Chakra, alcance, oficina, terceira vaga e perfuração de Barreira,
mas deixa de converter a mesma build na maior fonte de dano sustentado.

### 9.6 Mudanças de segurança e testes

Independentemente dos números aprovados, a implementação deve adicionar testes
para:

- impedir acumulação da Barreira de Carapaça Resistente;
- confirmar o alvo de cada Barreira;
- garantir que carapaça de efeito não amplie Imobilização/Atordoamento;
- confirmar o teto de duração dos efeitos contínuos;
- garantir o custo reduzido do ápice de efeito somente nos mecanismos corretos;
- validar os multiplicadores finais de ofensiva e Shirogane;
- preservar a punição do Ataque Descuidado.

### 9.7 Pontos para sua aprovação

1. Aprovar ofensiva em +10% / +18% / +25% e remoção do bônus-base oculto.
2. Aprovar Carapaça Resistente em 7 + 10% da Vida, substituindo a própria
   Barreira ao reaplicar.
3. Aprovar efeito como ramo de desgaste contínuo, sem prolongar Imobilização ou
   Atordoamento.
4. Aprovar o ápice de efeito como -10% Chakra para mecanismos que aplicam dano
   contínuo.
5. Aprovar Shirogane com somente +10% de dano total e ápice de ignorar Barreira.
6. Aprovar a troca de Venenos Calibrados para +1 rodada de Veneno/Sangramento.
