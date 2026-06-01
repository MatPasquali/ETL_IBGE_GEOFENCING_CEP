# Relatório de Análise — Pipeline ETL Setor Censitário × CEP × Renda (São Paulo)

> Documento técnico-analítico que consolida metodologia, resultados, decisões de design e limitações honestas do pipeline para São Paulo. Acompanha os notebooks da pasta [`Notebooks_Final/`](Notebooks_Final/).

---

## Sumário Executivo

O pipeline produz, no grão `(setor censitário CD2022, lista de CEPs, renda)`, uma base unificada que **não existe publicada pelo IBGE**. A entrega final para São Paulo cobre:

| Métrica | Valor | % |
|---|---:|---:|
| Setores totais no shapefile CD2022 SP | 102.599 | 100% |
| Setores com CEP atribuído | 102.591 | **99,99%** |
| Setores com renda (original + imputada) | 100.275 | **97,73%** |
| Setores legítimos sem renda (tipos especiais) | 2.323 | 2,26% |
| Setores sem CEP (legítimos) | 8 | 0,01% |

A cobertura de renda em **97,73%** representa, conforme análise honesta apresentada na Seção 4, o **teto saudável** sem inventar dado em setores que não possuem população residente típica (parques, áreas militares, terras indígenas, favelas com sigilo IBGE).

---

## 1. Metodologia — Pipeline em 8 etapas

O notebook [`Notebooks_Final/1_pipeline_etl_sp.ipynb`](Notebooks_Final/1_pipeline_etl_sp.ipynb) implementa o pipeline end-to-end:

| # | Etapa | O que faz |
|---|---|---|
| 1 | **Renda como driver** | Lê XLSX IBGE (`Agregados_por_setores_renda_responsavel_BR.xlsx`); classifica `motivo_renda` em `numerica`, `sigilo` (X), `ausente` |
| 2 | **Geofencing CNEFE → setor** | Para cada endereço CNEFE (lat, lng), faz point-in-polygon contra shapefile CD2022. Grava **dupla atribuição** em SQLite: pela geometria E pelo COD_SETOR original |
| 3 | **Agregar setor → CEPs** | Para cada setor, agrega CEPs em cascata: `setor_cep_geo` (geofencing) com fallback em `setor_cep_orig` (CNEFE original) |
| 4 | **Atributos do shapefile** | Carrega CD_BAIRRO, CD_DIST, CD_SUBDIST, CD_TIPO, etc., sem geometria |
| 5 | **Outer join driver=renda** | Junta com setor_ceps; setores em CNEFE mas fora do XLSX recebem `motivo_renda=fora_csv_ibge`; filtra para manter só os que estão na malha CD2022 |
| 6 | **Estatísticas intermediárias** | Cobertura antes da imputação |
| 7 | **Imputação cascateada** | Mediana por bairro → subdistrito → distrito → município, restrita a `CD_TIPO ∈ {0, 1}` |
| 8 | **Estatísticas finais + export** | Parquet + CSV + JSON resumo |

### 1.1 Insight central: geofencing supera o COD_SETOR do CNEFE

O `COD_SETOR` informado pelo CNEFE traz frequentemente sufixo `P` (preliminar) e aponta para uma malha **antiga ou intermediária**, gerando 7% de órfãos quando cruzado direto com o CD2022. Mas o CNEFE também traz **latitude e longitude em 100% das linhas** (98% em alta precisão). A solução: ignorar o código informado e atribuir cada endereço ao setor pela geometria (`gpd.sjoin(..., predicate='within')`).

### 1.2 Estratégia híbrida (resolve a borda)

Casos restantes do geofencing são micro-setores em borda (mediana 3.600 m² em SP) onde o sjoin não casa. Para esses, o pipeline cai num **fallback transparente** usando o `COD_SETOR` original do CNEFE, marcado com `origem_cep = cnefe_original` para auditabilidade.

| Origem CEP | Setores SP | Interpretação |
|---|---:|---|
| `geofencing` | 102.133 | Caso saudável; CEP atribuído pela geometria |
| `cnefe_original` | 458 | Fallback para micro-setor em borda |
| `sem_endereco_cnefe` | 8 | Setor sem nenhum endereço CNEFE (legítimo) |

---

## 2. Resultados SP

### 2.1 Distribuição final de `origem_renda`

Esta é a tabela mais importante — diferencia origem real, imputação por proximidade e ausência legítima:

| origem_renda | Setores | % |
|---|---:|---:|
| `original` (IBGE numérico direto) | 99.223 | 96,71% |
| `sem_dado_legitimo_tipo_4` (equipamentos públicos / parques) | 1.948 | 1,90% |
| `imputado_bairro` | 927 | 0,90% |
| `sem_dado_legitimo_tipo_7` (institucional — militar, hospital) | 196 | 0,19% |
| `sem_dado_legitimo_tipo_6` (favela com sigilo IBGE) | 148 | 0,14% |
| `imputado_subdistrito` | 114 | 0,11% |
| `sem_dado_legitimo_tipo_3` (terra indígena) | 14 | 0,01% |
| `imputado_municipio` | 11 | 0,01% |
| `sem_dado_legitimo_tipo_2` | 7 | 0,01% |
| `sem_dado_legitimo_tipo_5` | 5 | < 0,01% |
| `sem_dado_legitimo_tipo_9` | 5 | < 0,01% |
| `imputacao_sem_amostra` | 1 | < 0,01% |
| **TOTAL** | **102.599** | **100%** |

### 2.2 Cobertura por categoria

| Categoria | Setores | % do total |
|---|---:|---:|
| **Renda real do IBGE** (`original`) | 99.223 | 96,71% |
| **Renda imputada via cascata** | 1.052 | 1,03% |
| **Total com renda (oficial)** | **100.275** | **97,73%** |
| Legítimos sem renda (Tipo 2-9) | 2.323 | 2,26% |
| Falha residual (sem amostra) | 1 | < 0,01% |

### 2.3 Imputação cascateada — desempenho por nível

A cascata percorre 4 níveis de proximidade, parando no mais granular com amostra mínima de 5 vizinhos:

| Nível | Chave de agrupamento | Setores resolvidos | Significado |
|---|---|---:|---|
| bairro | `cod_mun + CD_DIST + CD_SUBDIST + CD_BAIRRO` | **927** | Vizinhos imediatos do mesmo bairro |
| subdistrito | `cod_mun + CD_DIST + CD_SUBDIST` | 114 | Bairros próximos do mesmo subdistrito |
| distrito | `cod_mun + CD_DIST` | 0 | (subdistrito já cobriu) |
| município | `cod_mun` | 11 | Fallback municipal |
| sem amostra | — | 1 | Município sem nenhuma amostra (raro) |

**Por que `CD_TIPO ∈ {0, 1}` apenas?** Os tipos especiais 2-9 são, por construção do IBGE, setores sem população residente típica:
- Tipo 4 (parques, equipamentos públicos) — sem moradores
- Tipo 6 (favelas) — sigilo intencional do IBGE para proteger privacidade
- Tipo 7 (militar, penitenciária, hospital) — população institucional, não familiar
- Tipos 2, 3, 5, 9 — outras categorias especiais

Imputar renda nesses casos **conceitualmente inventa moradores que não existem**. A decisão de design foi respeitar essa classificação do próprio IBGE.

---

## 3. Bug crítico descoberto e corrigido (2026-05-25)

Durante a fase de validação, identificamos que a função `parse_br_number` — desenhada para formato brasileiro (`1.560,08`) — tratava incorretamente o XLSX do IBGE, que armazena números nativamente em formato en-US (`1560.08`). O efeito era **multiplicar V06003, V06004 e V06005 por 100**.

### 3.1 Como o bug se manifestava

Setor `355030881000344` (Tremembé/SP) tinha no parquet:

| Variável | Antes do fix | Depois do fix | Valor correto IBGE |
|---|---:|---:|---:|
| V06003 (moradores/domicílio) | 224 | 2,24 | 2,24 |
| V06004 (renda média mensal) | R$ 156.008,00 | R$ 1.560,08 | R$ 1.560,08 |
| V06005 (soma renda mensal) | R$ 88.431.264 | R$ 884.312,64 | R$ 884.312,64 |
| V06006 (renda mediana) | R$ 1.300 | R$ 1.300 | R$ 1.300 |

V06001, V06002 e V06006 são inteiros no XLSX, então escapavam do bug (`str(255)` não tem ponto a remover).

### 3.2 Como detectamos

A pista veio do mapa interativo (`3_visualizacao_mapa.ipynb`): a renda média mostrada em setores residenciais comuns do Tremembé estava na casa de R$ 100k-300k, o que destoava completamente do esperado para a região (~R$ 2-5k). A mediana V06006, por estar correta (R$ 1.300), denunciava a inconsistência.

A confirmação veio comparando o parquet com o XLSX original:
- XLSX: `2453.03` (string interpretada como float en-US)
- `parse_br_number('2453.03')` → remove ponto → `'245303'` → `pd.to_numeric` → 245.303 ❌

### 3.3 Correção aplicada

Substituímos a função em todos os notebooks que leem o **XLSX** (3 notebooks) por:

```python
def parse_br_number(series):
    # XLSX do IBGE armazena numeros como float en-US (ponto decimal).
    # pd.to_numeric converte direto e devolve NaN para 'X' (sigilo).
    return pd.to_numeric(series, errors='coerce')
```

Os 4 notebooks/scripts que leem o **CSV** (formato BR real, com `2453,03`) foram mantidos com a função original.

### 3.4 Validação após fix

Com o XLSX corrigido, as distribuições brasileiras batem com o esperado do IBGE:
- V06004 mediana = R$ 2.102,73 (renda média mensal por responsável)
- V06006 mediana = R$ 1.500 (renda mediana mensal por responsável)
- Sigilo `X` = 9.241 setores detectados como NaN

---

## 4. Análise de modelagem — caminho para 100%

Após a imputação cascateada chegar a 97,73%, restaram 2.323 setores legítimos sem renda. O notebook [`Notebooks_Final/2_analises_diagnostico.ipynb`](Notebooks_Final/2_analises_diagnostico.ipynb) avalia duas alternativas para chegar mais perto de 100%.

### 4.1 KNN espacial (k=5)

**Método**: para cada setor sem renda, encontrar os 5 setores mais próximos geograficamente (pela distância euclidiana entre centróides) que tenham renda numérica, e atribuir a mediana.

**Validação**: leave-one-out aproximado em 1.000 setores aleatórios com renda real conhecida. Esconde a renda, prediz com KNN, mede o erro.

**Resultados**:
- Erro % mediano (P50): ~19% — equivalente à imputação por bairro (~20%)
- Erro % P75: ~42%
- Erro % P90: extremamente alto em setores de renda baixa (% relativo explode quando o denominador é pequeno)

**Conclusão**: KNN espacial **não traz ganho significativo** em relação à cascata por bairro/subdistrito. Onde funcionaria bem (Tipo 0/1 sem dado), a cascata já cobre.

### 4.2 Random Forest

**Método**: treinar um regressor com features simples — longitude, latitude, log(área), CD_TIPO numérico, total_endereços, qtd_CEPs, situação urbana — usando os 99.223 setores com renda como treino, prever para os 2.323 sem renda.

**Validação**: holdout 20%.

**Resultados**:
- R² = 0,49 (modesto — captura cerca de metade da variância)
- Erro % mediano (P50): ~23%
- Importância das features: `lon` (33%), `lat` (27%), `log_area` (17%), CD_TIPO (8%), `total_enderecos` (8%)

**Predições por CD_TIPO** (importante para a análise honesta):

| CD_TIPO | Setores preditos | Predição mediana RF |
|---|---:|---:|
| 0 (urbano comum) | 1 | R$ 1.730,77 |
| 2 (favela com sigilo) | 7 | R$ 2.866,67 |
| 3 (terra indígena) | 14 | R$ 1.942,48 |
| 4 (parques/equipamentos) | **1.948** | R$ 1.635,77 |
| 5 | 5 | R$ 828,37 |
| 6 (favela rural) | 148 | R$ 1.625,33 |
| 7 (militar/institucional) | 196 | R$ 1.910,43 |
| 9 | 5 | R$ 396,84 |

### 4.3 Análise honesta: 100% é matematicamente possível, conceitualmente problemático

**KNN e RF chegam a 99,97% de cobertura** porque conseguem produzir um número para qualquer setor que receba como entrada. Mas observe o que esse número representa:

- Para os **1.948 setores de Tipo 4** (parques, equipamentos públicos), o modelo está atribuindo "renda média mensal" a **lugares que não têm moradores**. Um parque tem renda? Conceitualmente, não — a categoria simplesmente não se aplica.
- Para os **148 setores de Tipo 6** (favelas/aglomerados subnormais com sigilo), o IBGE **deliberadamente** removeu a renda por proteção de privacidade. Aplicar um modelo preditivo aqui significa **reverter uma decisão de privacy** do órgão de origem.
- Para os **196 setores de Tipo 7** (militar, hospital, penitenciária), a população é institucional, não familiar. Atribuir "renda do responsável pelo domicílio" é forçar uma categoria que não existe.

A predição mediana RF de R$ 1.635,77 para parques não está "errada estatisticamente" — está conceitualmente **fora do domínio**.

### 4.4 Decisão registrada: 97,73% é o teto honesto

O notebook 2, na Etapa 8, formaliza a decisão:

> 1. **Manter 97,73% como cobertura oficial** (do notebook 1).
> 2. Se o downstream precisar **0% NaN** mesmo a custo de invenção:
>    - Adicionar coluna opcional `renda_v06004_knn` ou `renda_v06004_modelo` com a predição
>    - Manter coluna `origem_renda` com flag claro (`predicao_knn`, `predicao_modelo`)
>    - Documentar pro consumidor que essas linhas são previsões, não dados
> 3. **Não sobrescrever** as colunas originais.

Essa separação preserva a integridade da renda IBGE oficial e ao mesmo tempo permite atender consumidores que precisem de cobertura 100% (com sinalização explícita do que é dado vs predição).

---

## 5. Atingindo 100% de cobertura — Stacking Ensemble

Após a recomendação da Seção 4, o `Notebooks_Final/2_analises_diagnostico.ipynb` evoluiu nas **Etapas 9-18** para concretamente entregar o 100% (com a integridade preservada via colunas separadas, conforme decisão da Seção 4.4). Foram avaliados **6 modelos** em CV honesta, e o vencedor foi um **stacking ensemble**.

### 5.1 Comparação de 6 modelos

Todos avaliados com a mesma amostra de 1.000 setores doadores (com renda real), em CV leave-one-out aproximado:

| # | Modelo | MAE | P50 erro % | P75 | P90 |
|---|---|---:|---:|---:|---:|
| 1 | KMeans v1 (K=100, features básicas) | R$ 1.828,73 | 28,03% | 51,32% | 73,82% |
| 2 | Cluster v2 — MiniBatchKMeans (K=500, +features de atividade) | R$ 1.779,77 | 25,27% | 50,59% | 71,19% |
| 3 | HistGBR v1 (linear, params padrão) | R$ 1.157,15 | 20,01% | 38,07% | 61,07% |
| 4 | HistGBR v2 (log-target + tunado) | R$ 1.099,34 | 18,06% | 32,62% | 49,97% |
| 5 | KNN espacial (k=5, mediana dos vizinhos) | R$ 1.091,62 | 15,28% | 30,63% | 50,40% |
| **6** | **🏆 STACKING (Ridge meta-learner)** | **R$ 1.023,37** | **17,88%** | **30,98%** | **49,70%** |

### 5.2 Por que o Stacking venceu

O meta-learner Ridge aprendeu pesos:

| Modelo base | Peso V06004 | Peso V06006 |
|---|---:|---:|
| KNN | **0,530** | 0,480 |
| HistGBR v2 | **0,540** | 0,596 |
| Cluster v2 | 0,119 | 0,129 |
| bias | -381,67 | -352,38 |

**Insight**: KNN e HistGBR v2 são quase complementares — pesos quase iguais. Olhando as métricas individuais:
- **KNN** ganha em **P50** (15,28%) — é mais preciso em casos típicos com vizinhos homogêneos
- **HistGBR v2** ganha em **P90** (49,97%) — mais robusto em casos atípicos

O stack pega o melhor dos dois → vence em MAE absoluto (R$ 1.023 vs R$ 1.091 do KNN puro), com **redução de ~6,3%** sobre o melhor modelo individual.

Cluster v2 entra com peso baixo (~12%) — confirma que é estruturalmente limitado, mas ainda contribui marginalmente.

### 5.3 Aplicação final — parquet `_100pct.parquet`

Output salvo em **arquivo separado** (preserva integridade do parquet honesto de 97,73%):

```
saida_etl_final_sp/renda_setor_cep_sp_100pct.parquet  (10,2 MB)
```

Colunas adicionais:
- Predições individuais: `renda_v06004_knn`, `renda_v06004_cluster`, `renda_v06004_cluster_v2`, `renda_v06004_hgbr`, `renda_v06004_hgbr_v2`, **`renda_v06004_stack`**
- **`renda_v06004_final_100`** e **`renda_v06006_final_100`** — cascata original → imputado → stack (recomendado para 0% NaN)
- **`origem_renda_100`** — flag explícito da fonte

Distribuição final de `origem_renda_100`:

| Origem | Setores | % |
|---|---:|---:|
| `original` (IBGE) | 99.223 | 96,71% |
| `predicao_stack` | 2.324 | 2,27% |
| `imputado_bairro` | 927 | 0,90% |
| `imputado_subdistrito` | 114 | 0,11% |
| `imputado_municipio` | 11 | 0,01% |
| **TOTAL** | **102.599** | **100%** |

### 5.4 Floor humanamente atingível

P50 erro de **15-18%** está provavelmente próximo do floor com as features disponíveis. Renda dentro do mesmo bairro varia organicamente (condomínios de luxo ao lado de vilas operárias é a regra em SP).

Para baixar mais significativamente seriam necessários:
- **Dados externos** (preços imobiliários, IPTU, IDH-Bairro, contas de luz)
- **Modelos espaciais dedicados** (GWR — Geographically Weighted Regression)
- **CatBoost com categorical encoding nativo** de `cod_mun`/`CD_DIST` (alta cardinalidade)

**Stacking R$ 1.023 MAE é o teto saudável dentro do escopo deste projeto.**

### 5.5 Distinção crítica para o consumidor

O parquet `_100pct.parquet` tem **2 colunas paralelas de renda**:

- `renda_v06004_estimada` — só dados reais + imputação por cascata bairro (97,73% cobertura, **integridade IBGE preservada**)
- `renda_v06004_final_100` — inclui predição do stack pros 2.324 restantes (100% cobertura, **com predição estatística**)

| Caso de uso | Coluna recomendada |
|---|---|
| Análises que exigem integridade do dado IBGE | `renda_v06004_estimada` (do parquet honesto `renda_setor_cep_sp_final.parquet`) |
| Downstream que exige 0% NaN | `renda_v06004_final_100` (filtrar por `origem_renda_100`) |

---

## 6. Conclusões

1. **Geofencing supera o cruzamento direto por código** — saímos de 90,26% (baseline driver=CNEFE) para **99,99%** de cobertura de CEP por setor, validando que coordenadas são uma fonte mais confiável que o `COD_SETOR` rotulado do CNEFE.

2. **Imputação cascateada por proximidade administrativa funciona bem** para setores residenciais comuns sem dado (Tipo 0/1) — recuperamos 1.052 setores com erro mediano ~20%, levando a cobertura final de renda para **97,73%**.

3. **O teto natural é 97,73%, não 100%** — os 2,26% restantes são setores de tipos especiais (parques, militar, indígena, favela com sigilo). Imputar lá inventa dado.

4. **100% de cobertura via Stacking Ensemble** — para downstream que exija 0% NaN, o stacking (KNN + HistGBR v2 + Cluster v2 via Ridge meta-learner) atinge MAE R$ 1.023 e cobertura 100%. Os 2.324 setores especiais ficam com `origem_renda_100 = predicao_stack` (flag explícito). Coluna separada `renda_v06004_final_100` preserva a integridade do dado IBGE original em `renda_v06004_estimada`.

5. **Bug crítico identificado e corrigido** — função de parse multiplicava silenciosamente V06003/V06004/V06005 por 100 ao ler o XLSX. Detecção via sanity check no mapa interativo. Pipeline atual e dados re-gerados.

6. **Pipeline Brasil validado em smoke test** — `Notebooks_Final/4_pipeline_etl_brasil.ipynb` rodou RO+AC+RR sem erros (7.172 setores, 99,90% CEP, 90,27% renda) em ~0,1 min de geofencing. Extrapolação pro Brasil completo: ~20-40 min. Resumibility via SQLite garante recuperação caso o kernel caia.

---

## 6. Estrutura da entrega

| Pasta / Arquivo | Conteúdo |
|---|---|
| [`Notebooks_Final/1_pipeline_etl_sp.ipynb`](Notebooks_Final/1_pipeline_etl_sp.ipynb) | ETL completo end-to-end SP, 8 etapas |
| [`Notebooks_Final/2_analises_diagnostico.ipynb`](Notebooks_Final/2_analises_diagnostico.ipynb) | Análises + **6 modelos comparados + Stacking → 100% cobertura** (Etapas 1-18) |
| [`Notebooks_Final/3_visualizacao_mapa.ipynb`](Notebooks_Final/3_visualizacao_mapa.ipynb) | Mapa interativo folium do output final SP |
| [`Notebooks_Final/4_pipeline_etl_brasil.ipynb`](Notebooks_Final/4_pipeline_etl_brasil.ipynb) | Pipeline Brasil (smoke validado, pronto pro full) |
| [`Notebooks_Final/5_visualizacao_mapa_brasil.ipynb`](Notebooks_Final/5_visualizacao_mapa_brasil.ipynb) | 4 mapas folium do Brasil: agregado por município + drill UF + drill município + SP-capital bônus |
| [`notebooks/`](notebooks/) | Notebooks históricos de exploração e diagnóstico |
| [`RELATORIO_ANALISE_SP.md`](RELATORIO_ANALISE_SP.md) | Este documento |

---

## 7. Próximos passos sugeridos

- **Rodar Brasil completo** no `4_pipeline_etl_brasil.ipynb` (TEST_MODE=False, **~20-40 min** estimado após validação do smoke)
- **Replicar modelagem 100% pro Brasil** — aplicar mesma estratégia de stacking (Etapas 9-18 do nb 2) sobre o parquet Brasil
- **Validar CEPs** com cruzamento externo (base Correios, spot-check, ou auto-consistência geométrica)
- **Documentação consumer-facing** para quem vai usar o parquet downstream
- **(Opcional) Modelos espaciais dedicados** (GWR) ou **dados externos** (preços imobiliários, IPTU) — para baixar erro abaixo do floor atual de ~R$ 1.023 MAE

---

*Documento gerado em 2026-05-29. Última atualização: 2026-06-01 (Seção 5 — Stacking ensemble + 100% cobertura + smoke Brasil validado).*
