# Site MVP - Portfolio ETL IBGE Geofencing CEP

Site estático hospedado via GitHub Pages para apresentação do projeto.

## URL pública

🌐 **https://matpasquali.github.io/ETL_IBGE_GEOFENCING_CEP/**

## Como rodar localmente

Não precisa de build step. Qualquer servidor HTTP estático serve:

```bash
# Opção 1: Python (já instalado)
cd docs
python -m http.server 8000
# abre http://localhost:8000

# Opção 2: VS Code Live Server
# instalar extensão "Live Server", clicar com botão direito no index.html → "Open with Live Server"
```

## Configurar o GitHub Pages (uma única vez)

1. No GitHub, ir em **Settings → Pages**
2. Em **Build and deployment**:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Pasta: `/docs`
3. Salvar e aguardar ~1-2 minutos

## Estrutura

```
docs/
├── index.html              ← Landing
├── pipeline.html           ← Sankey + 8 etapas do pipeline
├── modelagem.html          ← XAI interativo (SHAP waterfall + calculadora stacking)
├── ivs.html                ← IVS - mapa Leaflet de 645 municípios SP
├── explorar.html           ← Busca interativa em 27k setores SP-capital
├── .nojekyll
├── css/
│   ├── custom.css          ← Design system base
│   ├── pipeline.css
│   ├── modelagem.css
│   ├── ivs.css
│   └── explorar.css
├── js/
│   ├── nav.js              ← Nav mobile + smooth scroll
│   ├── sankey.js           ← Plotly Sankey + cards 8 etapas
│   ├── modelagem.js        ← Charts + SHAP waterfall + calculadora Stacking
│   ├── ivs.js              ← Leaflet choropleth + filtros + rankings
│   └── explorar.js         ← Search + card detalhado + mini-mapa
└── data/                   ← JSONs / GeoJSONs pré-computados
    ├── sankey_data.json            (8 KB)
    ├── modelagem_data.json         (12 KB)
    ├── ivs_data.json               (16 KB)
    ├── ivs_sp_municipios.geojson   (8.0 MB - 645 municípios)
    └── sp_capital_setores.json     (8.3 MB - 27.252 setores)
```

## Páginas e funcionalidades interativas

| Página | Funcionalidade interativa |
|---|---|
| **index.html** | Landing com 4 métricas-chave e cards das seções |
| **pipeline.html** | 2 Sankeys interativos (geofencing + cobertura de renda) + 8 etapas + box do bug XLSX |
| **modelagem.html** | ⚡ SHAP waterfall por caso (4 tabs) + ⚡ Calculadora do Stacking + comparação dos 6 modelos |
| **ivs.html** | ⚡ Mapa Leaflet 645 municípios SP com hover/click/popup + filtro por classe A-E + rankings |
| **explorar.html** | ⚡ Busca em 27k setores com debounce + card detalhado + mini-mapa Leaflet centrado no setor |

## Stack

- HTML5 + CSS puro (sem framework, sem build)
- Inter + JetBrains Mono (Google Fonts)
- **Plotly.js 2.35** via CDN (Sankey, charts)
- **Leaflet 1.9.4** via CDN (mapas choropleth + mini-mapa)
- JavaScript vanilla (módulos IIFE)

## Identidade visual

- **Cores**: navy `#1E3A5F` (primária) + laranja `#E67E22` (accent) + Mackenzie `#C8102E`
- **Tipografia**: Inter (textos), JetBrains Mono (código/números)
- **Layout**: responsivo, mobile-friendly

## Tamanho total

- HTML/CSS/JS: ~150 KB
- Dados (JSON/GeoJSON): ~16 MB (~4 MB comprimido pelo gzip do GitHub Pages)
- **Tempo de primeiro load**: 3-6 segundos no 3G+

## Autor

**Mateus de Pasquali**
Mestrado em Computação Aplicada - Universidade Presbiteriana Mackenzie
[GitHub](https://github.com/MatPasquali) · [LinkedIn](https://www.linkedin.com/in/mateuspasquali/) · [matpasqsi@gmail.com](mailto:matpasqsi@gmail.com)
