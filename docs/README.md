# Site MVP — Portfolio ETL IBGE Geofencing CEP

Site estático hospedado via GitHub Pages para apresentação do projeto.

## URL pública

`https://matpasquali.github.io/ETL_IBGE_GEOFENCING_CEP/`

## Como rodar localmente

Não precisa de build step. Qualquer servidor HTTP estático serve:

```bash
# Opção 1: Python (já instalado)
cd docs
python -m http.server 8000
# abre http://localhost:8000

# Opção 2: Node (se tiver)
npx serve docs

# Opção 3: VS Code Live Server
# instalar extensão "Live Server", clicar com botão direito no index.html → "Open with Live Server"
```

## Como configurar o GitHub Pages (uma única vez)

1. No GitHub, ir em **Settings → Pages**
2. Em **Build and deployment**:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Pasta: `/docs`
3. Salvar
4. Aguardar ~1-2 minutos
5. URL ficará: `https://matpasquali.github.io/ETL_IBGE_GEOFENCING_CEP/`

## Estrutura

```
docs/
├── index.html              ← Landing (Fase 1 ✅)
├── pipeline.html           ← Sankey + arquitetura (Fase 2 — em construção)
├── modelagem.html          ← XAI da modelagem (Fase 3 — em construção)
├── ivs.html                ← IVS mapa SP (Fase 4 — em construção)
├── explorar.html           ← Busca setor SP-capital (Fase 5 — em construção)
├── .nojekyll               ← desabilita processamento Jekyll
├── css/
│   └── custom.css          ← design system completo
├── js/
│   └── nav.js              ← navegação + interatividade base
└── data/                   ← JSONs pré-computados (a popular)
```

## Stack

- HTML5 + CSS puro (sem framework, sem build)
- Inter (Google Fonts)
- JetBrains Mono (Google Fonts)
- JavaScript vanilla
- **Adicionado nas próximas fases**: Plotly.js (charts), Leaflet.js (mapas), Apache Arrow JS (dados)

## Identidade visual

- Cores: navy `#1E3A5F` (primária) + laranja `#E67E22` (accent) + Mackenzie `#C8102E`
- Tipografia: Inter (textos), JetBrains Mono (código)
- Layout: responsive, mobile-friendly

## Roadmap

| Fase | Página | Status |
|---|---|---|
| 1 | Setup + Landing | ✅ Pronto |
| 2 | Pipeline (Sankey) | 🚧 Em construção |
| 3 | Modelagem (XAI) | 🚧 Em construção |
| 4 | IVS (mapa SP) | 🚧 Em construção |
| 5 | Explorar setor | 🚧 Em construção |

## Autor

**Mateus de Pasquali**
Mestrado em Computação Aplicada — Universidade Presbiteriana Mackenzie
[GitHub](https://github.com/MatPasquali) · [matpasqsi@gmail.com](mailto:matpasqsi@gmail.com)
