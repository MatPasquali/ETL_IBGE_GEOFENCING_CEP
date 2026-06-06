# ETL IBGE - Setor Censitário × CEP × Renda (com Geofencing)

> **Engenharia de Dados aplicada a dados públicos do IBGE**: monta a base unificada `(setor censitário, CEP, renda média do responsável)` que o IBGE não publica diretamente, usando *geofencing* (point-in-polygon) para resolver inconsistências entre versões da malha territorial, imputação cascateada para preencher dados ausentes, e *stacking ensemble* para atingir **100% de cobertura** preservando integridade.

[![Site Interativo](https://img.shields.io/badge/🌐_Site_Interativo-matpasquali.github.io-1E3A5F?style=for-the-badge)](https://matpasquali.github.io/ETL_IBGE_GEOFENCING_CEP/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Python](https://img.shields.io/badge/Python-3.10%2B-blue)
![Pipeline](https://img.shields.io/badge/Pipeline-ETL%20%2B%20ML-green)
![Status](https://img.shields.io/badge/SP-99%2C99%25%20CEP%20%2F%20100%25%20Renda-success)

---

## 🌐 Site interativo do projeto

🔗 **[matpasquali.github.io/ETL_IBGE_GEOFENCING_CEP](https://matpasquali.github.io/ETL_IBGE_GEOFENCING_CEP/)**

Site MVP com 5 páginas e widgets interativos para explorar o projeto completo:

| Página | O que você encontra |
|---|---|
| 🏠 **[Início](https://matpasquali.github.io/ETL_IBGE_GEOFENCING_CEP/)** | Visão geral do projeto e métricas-chave |
| 🌊 **[Pipeline](https://matpasquali.github.io/ETL_IBGE_GEOFENCING_CEP/pipeline.html)** | Diagramas Sankey interativos do fluxo de dados + 8 etapas + bug crítico documentado |
| 🤖 **[Modelagem](https://matpasquali.github.io/ETL_IBGE_GEOFENCING_CEP/modelagem.html)** | **XAI interativa**: SHAP waterfall por caso clicável + calculadora do Stacking + comparação de 6 modelos |
| 🗺 **[IVS](https://matpasquali.github.io/ETL_IBGE_GEOFENCING_CEP/ivs.html)** | Mapa Leaflet com 645 municípios SP + filtros de classe A-E + rankings de distritos |
| 🔍 **[Explorar](https://matpasquali.github.io/ETL_IBGE_GEOFENCING_CEP/explorar.html)** | Busca interativa nos 27 mil setores de SP-capital + card detalhado + mini-mapa |

> Site estático no GitHub Pages, sem backend. Tudo HTML/CSS/JS puro com Plotly.js + Leaflet.

---

## 🎯 TL;DR

**O que faz**: cruza 3 datasets públicos do IBGE (CNEFE, Shapefile CD2022, Agregados de Renda) para produzir um parquet final onde cada linha é 1 setor censitário com seus CEPs e renda média do responsável.

**Como**: ignora o `COD_SETOR` informado pelo CNEFE (que pode estar numa versão preliminar da malha) e atribui cada endereço ao setor pela *geometria* (point-in-polygon com `geopandas.sjoin`). Depois preenche lacunas com imputação cascateada por bairro → subdistrito → distrito → município, e para os casos restantes (setores especiais como parques, militar, indígena), usa *stacking ensemble* (KNN + Gradient Boosting + KMeans via Ridge meta-learner).

**Resultado em São Paulo** (102.599 setores na malha CD2022):

| Cobertura | Atinge | Como |
|---|---:|---|
| **CEP** | **99,99%** | Geofencing + híbrido (fallback no `COD_SETOR` original em micro-setores de borda) |
| **Renda (honesta - só IBGE + cascata)** | **97,73%** | Dados originais (96,71%) + imputação cascateada (1,03%) |
| **Renda (100% com ML)** | **100%** | + Stacking ensemble (KNN + HistGBR + Cluster) com MAE R$ 1.023 |

**Tempo de execução total em SP**: ~15 min (ETL) + 5 min (modelagem). Para Brasil completo: ~20-40 min estimado (smoke test validou a arquitetura).

---

## 📑 Índice

1. [Por que esse projeto existe](#1-por-que-esse-projeto-existe)
2. [Os dados públicos do IBGE](#2-os-dados-públicos-do-ibge)
3. [O problema central e a descoberta do geofencing](#3-o-problema-central-e-a-descoberta-do-geofencing)
4. [Arquitetura do pipeline (8 etapas)](#4-arquitetura-do-pipeline-8-etapas)
5. [Imputação cascateada - chegando a 97,73%](#5-imputação-cascateada--chegando-a-9773)
6. [Modelagem para 100% - Stacking Ensemble](#6-modelagem-para-100--stacking-ensemble)
7. [Bug crítico que pegamos no caminho](#7-bug-crítico-que-pegamos-no-caminho)
8. [Visualizações - mapas folium interativos](#8-visualizações--mapas-folium-interativos)
9. [Pipeline para Brasil completo](#9-pipeline-para-brasil-completo)
10. [Schema do output final](#10-schema-do-output-final)
11. [Stack tecnológico](#11-stack-tecnológico)
12. [Como reproduzir](#12-como-reproduzir)
13. [Estrutura do repositório](#13-estrutura-do-repositório)
14. [Limitações e próximos passos](#14-limitações-e-próximos-passos)

---

## 1. Por que esse projeto existe

### O caso de uso

Imagine que você quer responder perguntas como:

- *"Qual a renda média de quem mora em determinado CEP?"*
- *"Quais áreas da cidade têm maior poder de compra?"*
- *"Como minha base de clientes (por CEP) se compara à renda do entorno?"*
- *"Em quais regiões abrir uma nova loja, baseado em renda da vizinhança?"*

Para responder isso, é preciso cruzar dois tipos de dado público do IBGE:

| O que | Como o IBGE publica |
|---|---|
| **Renda média do responsável pelo domicílio** | por **setor censitário** (códigos de 15 dígitos) |
| **Endereços com CEP** | no **CNEFE** - Cadastro Nacional de Endereços para Fins Estatísticos |

**O problema**: o IBGE não publica a ponte entre os dois. Cada CEP pode estar em N setores; cada setor pode ter M CEPs. E os códigos de setor entre os datasets nem sempre batem.

**Este projeto monta essa ponte** - de forma reprodutível, auditável e com cobertura quase total.

---

## 2. Os dados públicos do IBGE

### Três datasets necessários

| Dataset | Tamanho | O que contém | Onde baixar |
|---|---:|---|---|
| **CNEFE 2022** | ~18 GB extraído (27 CSVs, um por UF) | 150M+ endereços do Brasil com CEP, código de setor (informado) e **coordenadas (lat/lng)** em ~98% das linhas | [IBGE FTP - CNEFE](https://ftp.ibge.gov.br/) |
| **Shapefile CD2022** | ~2 GB | Geometria oficial dos 468.099 setores censitários do Brasil | [IBGE - Malhas de Setores](https://www.ibge.gov.br/geociencias/organizacao-do-territorio/estrutura-territorial/26565-malhas-de-setores-censitarios-divisoes-intramunicipais.html) |
| **Agregados de Renda (V06001-V06006)** | ~120 MB (XLSX e CSV) | Renda média mensal, mediana, etc. - por setor | [IBGE Censo 2022 - Agregados](https://biblioteca.ibge.gov.br/index.php/biblioteca-catalogo?view=detalhes&id=2102136) |

### As variáveis de renda IBGE

Para entender o output, é importante conhecer:

| Código | O que é |
|---|---|
| `V06001` | Domicílios particulares permanentes ocupados |
| `V06002` | Moradores em domicílios particulares ocupados |
| `V06003` | Moradores por domicílio |
| **`V06004`** | **Rendimento nominal médio mensal das pessoas responsáveis pelos domicílios particulares permanentes** (R$) |
| `V06005` | Soma do rendimento nominal mensal das pessoas responsáveis (R$) |
| **`V06006`** | **Rendimento nominal mediano mensal das pessoas responsáveis** (R$) |

Foco principal: `V06004` (média) e `V06006` (mediana).

---

## 3. O problema central e a descoberta do geofencing

### A primeira tentativa óbvia (e por que falha)

A abordagem natural é cruzar diretamente:

```
Para cada endereço CNEFE:
    cd_setor = COD_SETOR informado pelo CNEFE
    renda = lookup(cd_setor) no XLSX de renda
```

**Resultado em São Paulo**: **7% dos endereços (1,6 milhão) ficavam órfãos** - o código de setor que o CNEFE informava simplesmente *não existia* no shapefile oficial CD2022.

### Por quê?

A investigação descobriu:

- **8.779 setores em SP** com código que não casa com CD2022
- Decomposição revelou: município + distrito + subdistrito batem 100%, mas o **número final do setor** é diferente
- Setores no CNEFE com **sufixo `P`** → códigos de uma **versão preliminar** da malha (`P` de preliminar)
- Conclusão: o CNEFE foi compilado contra uma malha antiga/intermediária; o IBGE renumera e desmembra setores entre versões da malha territorial

### A virada - geofencing

**Insight central**: o CNEFE tem **latitude e longitude em 100% das linhas** (~98% com alta precisão segundo `NV_GEO_COORD ≤ 2`). Então, em vez de confiar no código de setor (que pode estar errado), faz **point-in-polygon** contra o shapefile CD2022:

```
Para cada endereço (lat, lng) do CNEFE:
    cd_setor = polígono do shapefile CD2022 que contém esse ponto
```

É uma **cerca virtual** (geofencing). **O ponto fala mais alto que o código.** A divergência de versão da malha desaparece.

### Implementação

Em código Python com `geopandas`:

```python
import geopandas as gpd

# Constrói GeoDataFrame de pontos a partir do CNEFE
pts = gpd.GeoDataFrame(
    cnefe_df,
    geometry=gpd.points_from_xy(cnefe_df['LONGITUDE'], cnefe_df['LATITUDE']),
    crs='EPSG:4674',  # SIRGAS 2000, padrão IBGE
)

# Point-in-polygon contra o shapefile CD2022
joined = gpd.sjoin(pts, shapefile_setores, how='left', predicate='within')

# Cada endereço agora tem 'cd_setor' atribuído pela geometria
```

### Estratégia híbrida - resolve o problema de borda

O geofencing puro chega em ~99,6% (sobram ~400 micro-setores). O motivo: setores urbanos muito pequenos (mediana **3.600 m²**, ~60×60 metros) podem ter seus endereços jogados para o vizinho por imprecisão de poucos metros nas coordenadas.

Solução: cascata híbrida com fallback transparente:

| Origem CEP | O que significa |
|---|---|
| `geofencing` | Caso saudável, atribuído por point-in-polygon |
| `cnefe_original` | Fallback: setor estava vazio após geofencing, usa o `COD_SETOR` original do CNEFE |
| `sem_endereco_cnefe` | Setor sem nenhum endereço no CNEFE (legitimamente raro - parques, áreas industriais) |

### Resultados em SP

| Métrica | Baseline (driver=CNEFE) | Driver=renda (sem geofencing) | **Geofencing puro** | **Geofencing + híbrido** |
|---|---:|---:|---:|---:|
| Setores com CEP | n/a | 91.097 | 100.521 | **102.591** |
| **Cobertura** | n/a | 90,26% | 99,60% | **99,99%** |
| Setores sem CEP | n/a | 9.831 | 407 | **8** (legítimos) |

Os **8 setores** restantes são parques, áreas industriais sem domicílios. Nenhuma técnica de cruzamento resolve.

---

## 4. Arquitetura do pipeline (8 etapas)

O notebook [`notebooks/1_pipeline_etl_sp.ipynb`](notebooks/1_pipeline_etl_sp.ipynb) implementa o pipeline end-to-end. Cada etapa tem responsabilidade clara:

```
┌────────────────────────────────────────────────────────────────────────┐
│  Pipeline ETL (8 etapas)                                              │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  1. Renda como driver       ── Lê XLSX IBGE                            │
│     ↓                          Classifica numerica/sigilo/ausente     │
│  2. Geofencing CNEFE        ── sjoin point-in-polygon                  │
│     ↓                          Grava dupla atribuição em SQLite       │
│  3. Agregar setor → CEPs    ── Cascata geo → orig (fallback)          │
│     ↓                                                                  │
│  4. Atributos shapefile     ── CD_BAIRRO, CD_DIST, CD_SUBDIST          │
│     ↓                          (necessário pra imputação)             │
│  5. Outer join driver=renda ── Categoriza fora_csv_ibge               │
│     ↓                                                                  │
│  6. Stats intermediárias    ── Cobertura antes da imputação           │
│     ↓                                                                  │
│  7. Imputação cascateada    ── bairro → subdist → distrito → mun      │
│     ↓                          só pra CD_TIPO ∈ {0, 1}                │
│  8. Export                  ── parquet + CSV + JSON resumo            │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Decisões de design importantes

**SQLite como camada intermediária para geofencing**
- 22,9M endereços em SP × 103k polígonos = `sjoin` pesado se fizer tudo em memória
- Processa CNEFE em chunks de 250k linhas
- Grava resultados em SQLite com `INSERT OR UPDATE` (idempotente)
- Tabelas separadas: `setor_cep_geo` (geometria) e `setor_cep_orig` (fallback CNEFE)
- Tempo SP: ~5 min (vs OOM tentando fazer em memória)

**Resumibility via tabela `status_ingest`** (versão Brasil)
- Cada CSV CNEFE processado é registrado
- Se o kernel cair durante o ingest, basta reiniciar com `REBUILD_SQLITE=False`
- O loop pula arquivos já processados

**Driver = renda (não CNEFE)**
- O CNEFE tem códigos antigos (alguns com sufixo `P`) que não existem no CD2022
- Usar renda como driver e fazer outer join evita gerar linhas "fantasma" do CNEFE
- A categoria `fora_csv_ibge` captura setores com CEP mas sem renda no XLSX (setores novos que ainda não saíram no agregado)

---

## 5. Imputação cascateada - chegando a 97,73%

### O problema

Mesmo com geofencing resolvendo o CEP em 99,99%, sobra renda faltando: o XLSX do IBGE só tem ~99k dos 103k setores SP. Os outros ~4k estão fora do XLSX ou marcados com **sigilo** (marcador `"X"` no XLSX).

### A solução: imputação em camadas

Cascata **do mais fino para o mais grosso** - tenta o nível N, se tem ≥ `MIN_VIZINHOS=5` setores com renda na mesma chave, usa a **mediana** desse nível. Se não, sobe pro próximo:

| Nível | Chave de agrupamento | Setores resolvidos (SP) |
|---|---|---:|
| `imputado_bairro` | `cod_mun + CD_DIST + CD_SUBDIST + CD_BAIRRO` | **927** |
| `imputado_subdistrito` | `cod_mun + CD_DIST + CD_SUBDIST` | 114 |
| `imputado_distrito` | `cod_mun + CD_DIST` | 0 |
| `imputado_municipio` | `cod_mun` | 11 |
| `imputacao_sem_amostra` | (fallback, raríssimo) | 1 |

### Filtro crítico: só imputa `CD_TIPO ∈ {0, 1}`

Setores no Brasil são classificados pelo IBGE com `CD_TIPO`:

| CD_TIPO | O que é | Imputa? |
|---|---|:-:|
| 0 | Urbano comum (bairro residencial) | ✅ |
| 1 | Rural comum | ✅ |
| 2 | Aglomerado subnormal urbano (favela) | ❌ |
| 3 | Aldeia / Terra indígena | ❌ |
| 4 | Equipamentos públicos / parques | ❌ |
| 5–9 | Outros setores especiais (militar, hospital, etc.) | ❌ |

**Por quê não imputar 2-9?** São setores onde **não há população residente típica** ou onde o IBGE marcou **sigilo intencional** (privacidade). Imputar renda lá é:
- **Inventar moradores que não existem** (caso parques)
- **Reverter uma decisão de privacy** do IBGE (caso favelas com sigilo)
- **Forçar uma categoria que não se aplica** (caso militar/hospital)

A decisão de design respeita a classificação do próprio IBGE.

### Resultado

| Métrica | Valor |
|---|---:|
| Total setores no shapefile SP | 102.599 |
| Com renda original (`origem_renda='original'`) | 99.223 (96,71%) |
| Com renda imputada (`imputado_*`) | 1.052 (1,03%) |
| **Total com renda** | **100.275 (97,73%)** |
| Legítimos sem renda (CD_TIPO 2-9) | 2.323 (2,26%) |

---

## 6. Modelagem para 100% - Stacking Ensemble

Os 2,26% restantes são setores legítimos sem renda. Para downstream que exige **0% NaN**, o notebook [`notebooks/2_analises_diagnostico.ipynb`](notebooks/2_analises_diagnostico.ipynb) avalia 6 modelos e escolhe o mais robusto.

### A regra de ouro: integridade preservada

O parquet final tem **2 colunas paralelas**:
- `renda_v06004_estimada` - só dados reais + imputação cascateada (97,73%, **integridade IBGE**)
- `renda_v06004_final_100` - + predições do stack pros 2.324 restantes (100%, **com flag explícito**)

Quem consome decide qual usar.

### 6 modelos comparados (CV honesta com 1.000 holdout)

| # | Modelo | MAE | P50 erro % | P75 | P90 |
|---|---|---:|---:|---:|---:|
| 1 | KMeans v1 (K=100, features básicas) | R$ 1.828 | 28,03% | 51,32% | 73,82% |
| 2 | Cluster v2 - MiniBatchKMeans (K=500, +atividade) | R$ 1.779 | 25,27% | 50,59% | 71,19% |
| 3 | HistGBR v1 (linear, params padrão) | R$ 1.157 | 20,01% | 38,07% | 61,07% |
| 4 | HistGBR v2 (log-target + tunado) | R$ 1.099 | 18,06% | 32,62% | 49,97% |
| 5 | KNN espacial (k=5, mediana dos vizinhos) | R$ 1.091 | **15,28%** | 30,63% | 50,40% |
| **6** | **🏆 STACKING (Ridge meta-learner)** | **R$ 1.023** | 17,88% | 30,98% | **49,70%** |

### Por que o Stacking venceu

O meta-learner Ridge aprendeu pesos:

| Modelo base | Peso V06004 (renda média) |
|---|---:|
| KNN | **0,530** |
| HistGBR v2 | **0,540** |
| Cluster v2 | 0,119 |
| bias | -381,67 |

**Insight central**: KNN e HistGBR v2 são quase complementares:
- **KNN** ganha em P50 (15,28%) - preciso em casos típicos com vizinhos homogêneos
- **HistGBR v2** ganha em P90 (49,97%) - robusto em casos atípicos (alto valor + alta variância)

O stack pega o melhor dos dois → vence em MAE absoluto (R$ 1.023, **redução de ~6,3% sobre o melhor modelo individual**).

Cluster v2 entra com peso baixo (~12%) - é estruturalmente fraco pra esse problema, mas contribui marginalmente.

### Features usadas pelo HistGBR v2 (componente vencedor)

| Tipo | Features |
|---|---|
| Espaciais | `lat`, `lon` |
| Físicas do setor | `log_area`, `cd_tipo_num`, `is_urbana` |
| Atividade | `log_qtd_ceps`, `log_total_enderecos` |
| **Target encoding hierárquico** (mediana renda dos doadores) | `te_bairro`, `te_subdistrito`, `te_distrito`, `te_municipio` |

Target encoding hierárquico = pra cada setor, calcula a mediana de renda dos doadores no mesmo bairro / subdistrito / distrito / município. Captura padrões administrativos que KNN/cluster espaciais perdem.

### Ajustes técnicos críticos no HistGBR v2

| Ajuste | Por quê |
|---|---|
| `np.log1p(renda)` no fit, `np.expm1(pred)` no predict | Elimina predições negativas (renda tem distribuição log-normal); estabiliza variância |
| `min_samples_leaf=5` (era 20), `l2=0.01` (era 0.1) | Permite capturar variações finas locais |
| `max_iter=2000` + `early_stopping=True` | Convergência natural sem overfitting |

### Floor humanamente atingível

P50 erro de **15-18%** está próximo do floor com as features disponíveis. Renda dentro do mesmo bairro varia organicamente (condomínios de luxo ao lado de vilas operárias é regra em SP).

Para baixar mais significativamente seriam necessários **dados externos** (preços imobiliários, IPTU, IDH-Bairro) ou modelos espaciais dedicados (GWR). Outro projeto.

### Distribuição final de `origem_renda_100` (com stacking)

| Origem | Setores | % |
|---|---:|---:|
| `original` (IBGE) | 99.223 | 96,71% |
| `predicao_stack` | 2.324 | 2,27% |
| `imputado_bairro` | 927 | 0,90% |
| `imputado_subdistrito` | 114 | 0,11% |
| `imputado_municipio` | 11 | 0,01% |
| **TOTAL** | **102.599** | **100,0%** |

---

## 7. Bug crítico que pegamos no caminho

### O bug

A função `parse_br_number` original assumia formato brasileiro (`1.560,08` - ponto = milhar, vírgula = decimal):

```python
def parse_br_number(series):
    norm = (series.fillna('').astype(str).str.strip()
            .str.replace('.', '', regex=False)    # remove milhar
            .str.replace(',', '.', regex=False))  # vírgula → ponto
    return pd.to_numeric(norm, errors='coerce')
```

Funciona corretamente quando o input vem em formato BR (CSV do IBGE).

**Falha** quando o input vem em formato en-US (XLSX do IBGE: `'2453.03'`):
1. `'2453.03'` → remove ponto → `'245303'`
2. `pd.to_numeric('245303')` → 245.303 (multiplicado por 100 ❌)

### Como detectamos

O sintoma apareceu no mapa interativo: setor 355030881000344 (Tremembé/SP) mostrava **renda média de R$ 156.008,00**, claramente absurdo pra um bairro residencial comum. Mediana (V06006, formato inteiro no XLSX) estava OK em R$ 1.300, denunciando a inconsistência.

Confirmamos no XLSX original: V06004 = `1560.08`, não `156008`. Bug confirmado.

### Como corrigimos

Substituímos a função em todos os 3 notebooks que leem o **XLSX** por:

```python
def parse_br_number(series):
    # XLSX do IBGE armazena numeros como float en-US (ponto decimal).
    # pd.to_numeric converte direto e devolve NaN para 'X' (sigilo).
    return pd.to_numeric(series, errors='coerce')
```

Os 4 notebooks/scripts legados que leem o **CSV** (formato BR real, `2453,03`) foram mantidos com a função original.

### Lição registrada

> Sempre que um pipeline lê arquivos XLSX gerados por terceiros, NÃO assumir formato BR. Excel armazena numbers natively como floats; `pd.read_excel(dtype=str)` retorna strings no formato Python padrão (en-US). Para esses casos, usar `pd.to_numeric(errors='coerce')` direto.
>
> Heurística rápida de debugging: olhe um valor com decimal conhecido. Se a fonte é BR, vai aparecer com vírgula. Se é en-US, com ponto.

**Validação pós-fix**: V06004 mediana brasileira = R$ 2.102,73 (renda média mensal por responsável - bate com o esperado IBGE).

---

## 8. Visualizações - mapas folium interativos

Dois notebooks de visualização:

### [`notebooks/3_visualizacao_mapa_sp.ipynb`](notebooks/3_visualizacao_mapa_sp.ipynb)

Mapa folium de SP-capital (27.301 setores) com tooltip completo por setor:
- Setor, Município, Distrito, Bairro
- CD_TIPO, Situação Urbana/Rural
- Renda média e mediana (formatadas em R$)
- Origem renda (`original` / `imputado_*` / `sem_dado_legitimo_*`)
- Origem CEP (`geofencing` / `cnefe_original` / `sem_endereco_cnefe`)
- Qtd CEPs, Faixa CEP, Endereços, Lista de CEPs

Salva HTML standalone (~15 MB) em `saida_etl_final_sp/`. Abre em qualquer browser sem dependências.

### [`notebooks/5_visualizacao_mapa_brasil.ipynb`](notebooks/5_visualizacao_mapa_brasil.ipynb)

**4 mapas complementares** otimizados pra escala Brasil:

| Mapa | O que mostra | Polígonos | HTML |
|---|---|---:|---|
| **A) Brasil agregado** | Choropleth por município (renda + cobertura CEP) | ~5.570 (Brasil full) | ~5-15 MB |
| **B) Drill UF** | Setores de uma UF inteira (configurável) | 7k-25k | 10-50 MB |
| **C) Drill município** | Setores de 1 município com tooltip completo | 100-30k | 0,5-100 MB |
| **D) Bônus SP-capital** | Lê parquet SP, renderiza SP-capital | 27k | 15 MB |

Otimizações importantes:
- **Geometria simplificada** (`shapely.simplify(tolerance=0.005)`) no mapa Brasil - viável até pra 5.570 municípios
- **Sanitização robusta de NaN** (`None` pra numéricas, `''` pra textuais) - evita o bug clássico `TypeError: '<=' not supported between instances of 'str' and 'float'` no `_repr_html_` do folium

---

## 9. Pipeline para Brasil completo

O notebook [`notebooks/4_pipeline_etl_brasil.ipynb`](notebooks/4_pipeline_etl_brasil.ipynb) adapta a mesma estrutura de 8 etapas, mas itera sobre os 27 arquivos CNEFE com resumibility.

### Smoke test validado (RO + AC + RR)

| UF | Setores | CEP | Renda |
|---|---:|---:|---:|
| RO | 3.349 | 99,85% | 95,82% |
| AC | 2.144 | 100,00% | 94,73% |
| RR | 1.679 | 99,88% | 73,50% |
| **Total** | **7.172** | **99,90%** | **90,27%** |

Tempo: **0,1 min** para processar 1,6M endereços CNEFE (cascata respeitou UF, status_ingest registrou os 3 checkpoints).

### Extrapolação Brasil completo

- Smoke 1,6M endereços → 0,1 min
- Brasil ~150M endereços → **~10-15 min** de geofencing
- + carga shapefile (468k polígonos) + agregação + imputação + export
- **Total estimado: 20-40 min**

Para rodar o full: `TEST_MODE = False` na célula `paths-config` e Run All.

### Cobertura Norte ≠ SP - por quê

Renda menor (90,27% vs 97,73% SP) é caracterização real, não bug:
- 567 setores Tipo 5 no Norte (~7,91%) vs < 0,01% em SP
- RR tem muita terra indígena e áreas isoladas onde IBGE legitimamente não publica
- Imputação cascateada atua só onde faz sentido (Tipo 0/1)

---

## 10. Schema do output final

Cada linha = 1 setor censitário CD2022.

### Parquet honesto: `renda_setor_cep_sp_final.parquet` (97,73% renda)

| Coluna | Tipo | Descrição |
|---|---|---|
| `cd_setor` | string (15) | Código IBGE do setor (CD2022) |
| `sigla_uf`, `cod_uf`, `nm_uf` | string | UF |
| `cod_mun`, `nm_mun` | string | Município |
| `CD_DIST`, `NM_DIST` | string | Distrito |
| `CD_SUBDIST`, `NM_SUBDIST` | string | Subdistrito |
| `CD_BAIRRO`, `NM_BAIRRO` | string | Bairro |
| `SITUACAO` | string | Urbana / Rural |
| `CD_TIPO` | string | 0=urbano, 1=rural, 2-9=especiais |
| `area_km2` | float | Área do setor |
| `motivo_renda` | string | `numerica` / `sigilo` / `ausente` / `fora_csv_ibge` |
| `origem_renda` | string | `original` / `imputado_*` / `sem_dado_legitimo_tipo_X` |
| `renda_v06001..06` | float | Variáveis brutas do XLSX IBGE |
| **`renda_v06004_estimada`** | float | **Renda média (R$) - original + imputação cascateada** |
| **`renda_v06006_estimada`** | float | **Renda mediana (R$)** |
| `origem_cep` | string | `geofencing` / `cnefe_original` / `sem_endereco_cnefe` |
| `tem_cep` | int (0/1) | Flag de cobertura |
| `qtd_ceps` | int | CEPs distintos no setor |
| `cep_inicial`, `cep_final`, `faixa_cep` | string | Limites |
| `total_enderecos` | int | Endereços CNEFE agregados |
| `lista_ceps` | string | CEPs separados por `\|` |

### Parquet 100%: `renda_setor_cep_sp_100pct.parquet` (com colunas extras)

Tudo do honesto + colunas adicionais:
- `renda_v06004_knn`, `renda_v06004_cluster`, `renda_v06004_cluster_v2`, `renda_v06004_hgbr`, `renda_v06004_hgbr_v2`, `renda_v06004_stack` (predições individuais)
- **`renda_v06004_final_100`** - recomendado para 0% NaN
- **`origem_renda_100`** - flag explícito

---

## 11. Stack tecnológico

- **Python 3.10+**
- **`pandas`**, **`pyarrow`** - manipulação de tabular + Parquet
- **`geopandas`** + **`shapely`** - geometria e operações espaciais (point-in-polygon)
- **`sqlite3`** - agregação intermediária em streaming, sem carregar tudo em memória
- **`scikit-learn`** - KNN, KMeans, MiniBatchKMeans, HistGradientBoostingRegressor, Ridge
- **`folium`** + **`branca`** - mapas interativos via Leaflet
- **`openpyxl`** - leitura do XLSX
- **`numpy`** - operações numéricas
- **`matplotlib`** - visualizações estáticas auxiliares

Versões fixadas em [`requirements.txt`](requirements.txt).

---

## 12. Como reproduzir

### 1. Baixar os dados brutos do IBGE

Não incluímos os dados brutos no repositório (são GB). Baixe das fontes:

| Dado | Onde colocar |
|---|---|
| **CNEFE 2022** (CSVs por UF) | `<projeto>/saida_cnefe_uf/extraido/SEM_UF/{UF_CODIGO}_{UF_SIGLA}.csv` |
| **Shapefile CD2022** | `<projeto>/BR_setores_CD2022/BR_setores_CD2022.{shp,dbf,shx,prj,cpg}` |
| **Agregados de Renda** | `<projeto>/Agregados_por_setores_renda_responsavel_BR_csv/Agregados_por_setores_renda_responsavel_BR.xlsx` |

Links de download estão na [Seção 2](#2-os-dados-públicos-do-ibge).

### 2. Estrutura de diretório esperada

```
seu_projeto/
├── saida_cnefe_uf/extraido/SEM_UF/
│   ├── 11_RO.csv
│   ├── 12_AC.csv
│   ├── ...
│   └── 53_DF.csv
├── BR_setores_CD2022/
│   ├── BR_setores_CD2022.shp
│   ├── BR_setores_CD2022.dbf
│   └── ...
├── Agregados_por_setores_renda_responsavel_BR_csv/
│   └── Agregados_por_setores_renda_responsavel_BR.xlsx
└── notebooks/    ← clone deste repo aqui
```

### 3. Instalar dependências

```bash
git clone https://github.com/MatPasquali/ETL_IBGE_GEOFENCING_CEP.git
cd ETL_IBGE_GEOFENCING_CEP
pip install -r requirements.txt
```

### 4. Rodar os notebooks (em ordem)

Os notebooks usam `find_project_root()` que descobre os dados automaticamente subindo na árvore.

| Notebook | O que faz | Tempo |
|---|---|---|
| `1_pipeline_etl_sp.ipynb` | ETL completo SP (CNEFE → geofencing → imputação → parquet honesto) | ~15 min |
| `2_analises_diagnostico.ipynb` | Análises + 6 modelos + stacking → 100% | ~5 min |
| `3_visualizacao_mapa_sp.ipynb` | Mapa interativo SP-capital | ~1 min |
| `4_pipeline_etl_brasil.ipynb` (smoke) | Validação com RO+AC+RR | ~1 min |
| `4_pipeline_etl_brasil.ipynb` (full) | Brasil completo | **~20-40 min** |
| `5_visualizacao_mapa_brasil.ipynb` | 4 mapas Brasil | ~2-5 min |

---

## 13. Estrutura do repositório

```
ETL_IBGE_GEOFENCING_CEP/
├── README.md                          ← este documento (visão geral)
├── RELATORIO_TECNICO.md               ← detalhes técnicos e análises aprofundadas
├── requirements.txt                   ← dependências Python
├── .gitignore
├── LICENSE                            ← MIT
└── notebooks/                         ← os 5 notebooks finais
    ├── 1_pipeline_etl_sp.ipynb        ← ETL end-to-end SP (8 etapas)
    ├── 2_analises_diagnostico.ipynb   ← Análises + modelagem 100% (18 etapas)
    ├── 3_visualizacao_mapa_sp.ipynb   ← Mapa folium SP-capital
    ├── 4_pipeline_etl_brasil.ipynb    ← Pipeline Brasil (smoke + full)
    └── 5_visualizacao_mapa_brasil.ipynb ← 4 mapas Brasil (agregado, UF, mun, SP)
```

---

## 14. Limitações e próximos passos

### Limitações conhecidas

- **Versão da malha CD2022**: publicada em 2024. Atualizações posteriores do IBGE exigem rerodar.
- **Precisão de coordenadas CNEFE**: ~1,6% dos endereços têm `NV_GEO_COORD ≥ 3` (estimadas). Podem cair em setores vizinhos em casos extremos - estratégia híbrida mitiga.
- **Setores legítimamente vazios**: ~8 em SP (proporcional em outras UFs) são parques/áreas industriais sem domicílios. Nenhuma técnica resolve.
- **Tabela de compatibilização IBGE 2010 ↔ 2022**: existe como documentação PDF, sem versão machine-readable pública. Geofencing torna isso desnecessário.
- **Floor do erro de modelagem**: P50 ~15-18% é o teto humanamente atingível com as features disponíveis. Renda dentro do mesmo bairro varia organicamente.

### Próximos passos sugeridos

1. **Rodar Brasil definitivo** (`4_pipeline_etl_brasil.ipynb` com `TEST_MODE=False`) - gera parquet Brasil completo em ~20-40 min
2. **Replicar modelagem 100% sobre o Brasil** - aplicar mesmo stacking (Etapas 9-18 do nb 2) sobre o parquet Brasil
3. **Validação de CEPs**:
   - Spot-check manual (CEP no buscacep dos Correios)
   - Cruzamento com base externa Correios
   - Auto-consistência geométrica (CEPs do setor caem no polígono)
4. **Dados externos para melhorar modelo** - preços imobiliários (Zap/OLX), IPTU, IDH-Bairro
5. **Modelos espaciais dedicados** - GWR (Geographically Weighted Regression) é o caminho técnico ideal pra heterogeneidade espacial

---

## 📚 Documentos relacionados

- [**RELATORIO_TECNICO.md**](RELATORIO_TECNICO.md) - detalhes técnicos profundos, tabelas completas, decisões de design

## 👤 Autor

**Mateus Pasquali** - [matpasqsi@gmail.com](mailto:matpasqsi@gmail.com)

## 📄 Licença

MIT - veja [LICENSE](LICENSE).
