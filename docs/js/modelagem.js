// Renderiza os charts + WIDGETS INTERATIVOS XAI da pagina modelagem.html
(function () {
  'use strict';

  const COLORS = {
    primary: '#1E3A5F',
    accent: '#E67E22',
    success: '#27AE60',
    danger: '#C0392B',
    muted: '#95A5A6',
    cluster: '#A569BD',
    gbm: '#3498DB',
    knn: '#16A085',
    ensemble: '#E67E22',
  };

  const PLOTLY_CONFIG = { displayModeBar: false, responsive: true };

  function fmtBRL(v) {
    if (v === null || v === undefined) return '—';
    return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtPct(v) {
    if (v === null || v === undefined) return '—';
    return Number(v).toFixed(2) + '%';
  }
  function colorForModelType(tipo, ehVencedor) {
    if (ehVencedor) return COLORS.ensemble;
    if (tipo === 'cluster') return COLORS.cluster;
    if (tipo === 'gbm')     return COLORS.gbm;
    if (tipo === 'knn')     return COLORS.knn;
    return COLORS.muted;
  }

  // ============================================================
  // CHART 1 — Bar chart de MAE dos 6 modelos
  // ============================================================
  function renderMaeChart(modelos, container) {
    const sorted = [...modelos].sort((a, b) => b.mae - a.mae);
    const x = sorted.map(m => m.mae);
    const y = sorted.map(m => m.nome);
    const colors = sorted.map(m => colorForModelType(m.tipo, m.ehVencedor));
    const text = sorted.map(m => `R$ ${m.mae.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

    const trace = {
      type: 'bar',
      orientation: 'h',
      x, y, text,
      textposition: 'outside',
      textfont: { family: 'Inter, sans-serif', size: 13, color: COLORS.primary },
      marker: { color: colors, line: { color: 'white', width: 1 } },
      hovertemplate: '<b>%{y}</b><br>MAE: R$ %{x:,.2f}<extra></extra>',
    };
    const layout = {
      font: { family: 'Inter, sans-serif', size: 12.5, color: '#2C3E50' },
      paper_bgcolor: '#FFFFFF', plot_bgcolor: '#FFFFFF',
      margin: { l: 230, r: 90, t: 20, b: 50 },
      height: 380,
      xaxis: { title: { text: 'MAE em R$ (menor = melhor)', font: { size: 12, color: '#6B7280' } }, gridcolor: '#F3F4F6', zeroline: false },
      yaxis: { tickfont: { size: 13 } },
      showlegend: false,
    };
    Plotly.newPlot(container, [trace], layout, PLOTLY_CONFIG);
  }

  // ============================================================
  // CHART 2 — Donut dos pesos Ridge
  // ============================================================
  function renderRidgeDonut(weights, container) {
    const trace = {
      type: 'pie',
      labels: ['KNN espacial', 'HistGBR v2', 'Cluster v2'],
      values: [weights.knn, weights.hgbr_v2, weights.cluster_v2],
      hole: 0.62,
      marker: { colors: [COLORS.knn, COLORS.gbm, COLORS.cluster], line: { color: 'white', width: 2 } },
      textinfo: 'label+percent',
      textposition: 'outside',
      textfont: { family: 'Inter, sans-serif', size: 12.5, color: COLORS.primary },
      hovertemplate: '<b>%{label}</b><br>Peso: %{value:.3f} (%{percent})<extra></extra>',
      sort: false,
    };
    const layout = {
      font: { family: 'Inter, sans-serif', color: '#2C3E50' },
      paper_bgcolor: '#FFFFFF', plot_bgcolor: '#FFFFFF',
      margin: { l: 30, r: 30, t: 20, b: 20 },
      height: 320,
      showlegend: false,
      annotations: [
        { x: 0.5, y: 0.55, xref: 'paper', yref: 'paper', text: '<b>Stacking</b>', showarrow: false, font: { size: 18, color: COLORS.primary, family: 'Inter, sans-serif' } },
        { x: 0.5, y: 0.43, xref: 'paper', yref: 'paper', text: 'Ridge', showarrow: false, font: { size: 12, color: '#6B7280', family: 'Inter, sans-serif' } },
      ],
    };
    Plotly.newPlot(container, [trace], layout, PLOTLY_CONFIG);
  }

  // ============================================================
  // CHART 3 — Feature importance
  // ============================================================
  function renderFeatureImportance(features, container) {
    const sorted = [...features].sort((a, b) => a.valor - b.valor);
    const colors = sorted.map(f => {
      if (f.feature.startsWith('te_')) return COLORS.accent;
      if (f.feature === 'lat' || f.feature === 'lon') return COLORS.primary;
      return COLORS.muted;
    });
    const trace = {
      type: 'bar',
      orientation: 'h',
      x: sorted.map(f => f.valor),
      y: sorted.map(f => f.feature),
      text: sorted.map(f => f.valor.toFixed(0)),
      textposition: 'outside',
      textfont: { family: 'Inter, sans-serif', size: 11, color: COLORS.primary },
      marker: { color: colors, line: { color: 'white', width: 1 } },
      customdata: sorted.map(f => f.desc),
      hovertemplate: '<b>%{y}</b><br>%{customdata}<br>Importância: %{x:.0f}<extra></extra>',
    };
    const layout = {
      font: { family: 'Inter, sans-serif', size: 12, color: '#2C3E50' },
      paper_bgcolor: '#FFFFFF', plot_bgcolor: '#FFFFFF',
      margin: { l: 180, r: 60, t: 20, b: 50 },
      height: 420,
      xaxis: { title: { text: 'Aumento médio do MAE (R$) ao embaralhar feature', font: { size: 11, color: '#6B7280' } }, gridcolor: '#F3F4F6', zeroline: false },
      yaxis: { tickfont: { size: 12 } },
      showlegend: false,
    };
    Plotly.newPlot(container, [trace], layout, PLOTLY_CONFIG);
  }

  // ============================================================
  // 🎯 INTERATIVO 1 — SHAP Waterfall por caso
  // Usuário seleciona um caso (tabs) → vê waterfall do HGBR pra esse setor
  // ============================================================
  let SHAP_DATA = null;
  let SHAP_CASO_ATIVO = 'tipico';

  function renderShapTabs(casos, container) {
    container.innerHTML = casos.map(c => `
      <button
        class="shap-tab ${c.id === SHAP_CASO_ATIVO ? 'active' : ''}"
        data-caso="${c.id}"
        type="button">
        <span class="shap-tab-icon">${c.icone}</span>
        <span class="shap-tab-label">${c.label}</span>
      </button>
    `).join('');
    container.querySelectorAll('.shap-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        SHAP_CASO_ATIVO = btn.dataset.caso;
        container.querySelectorAll('.shap-tab').forEach(b => b.classList.toggle('active', b === btn));
        renderShapDetail();
      });
    });
  }

  function renderShapDetail() {
    if (!SHAP_DATA) return;
    const caso = SHAP_DATA.shap_casos.find(c => c.id === SHAP_CASO_ATIVO);
    if (!caso) return;

    const baseline = SHAP_DATA.shap_baseline_log;
    const baselineRenda = SHAP_DATA.shap_baseline_renda;

    // Header com info do caso
    const headerEl = document.getElementById('shap-caso-header');
    if (headerEl) {
      const realHtml = caso.renda_real !== null
        ? `<div class="caso-valor"><span class="caso-valor-label">Renda REAL</span><span class="caso-valor-num">${fmtBRL(caso.renda_real)}</span></div>`
        : `<div class="caso-valor"><span class="caso-valor-label">Renda REAL</span><span class="caso-valor-num" style="color: var(--color-text-muted);">não tem (parque)</span></div>`;
      const erroHtml = caso.erro_pct !== null
        ? `<div class="caso-valor"><span class="caso-valor-label">Erro</span><span class="caso-valor-num" style="color: ${caso.erro_pct < 10 ? COLORS.success : caso.erro_pct < 25 ? COLORS.accent : COLORS.danger};">${fmtPct(caso.erro_pct)}</span></div>`
        : '';

      headerEl.innerHTML = `
        <div class="shap-meta">
          <code class="shap-setor">${caso.setor}</code>
          <span class="shap-localizacao">${caso.distrito} · ${caso.municipio}</span>
        </div>
        <div class="shap-valores">
          ${realHtml}
          <div class="caso-valor">
            <span class="caso-valor-label">Renda PREDITA (HGBR)</span>
            <span class="caso-valor-num" style="color: ${COLORS.gbm};">${fmtBRL(caso.renda_predita)}</span>
          </div>
          ${erroHtml}
        </div>
        <p class="shap-interpretacao">${caso.interpretacao}</p>
      `;
    }

    // Waterfall plot
    const plotEl = document.getElementById('chart-shap-waterfall');
    if (plotEl) {
      // Ordena features por |shap value|
      const sorted = [...caso.shap_values].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

      // Eixos pro waterfall
      const labels = ['Baseline E[f(x)]', ...sorted.map(s => s.feature), 'Predição final'];
      const measures = ['absolute', ...sorted.map(() => 'relative'), 'total'];
      const values = [baseline, ...sorted.map(s => s.value), 0];
      const text = [
        `log = ${baseline.toFixed(3)}<br>(${fmtBRL(baselineRenda)})`,
        ...sorted.map(s => (s.value >= 0 ? '+' : '') + s.value.toFixed(3)),
        `log = ${(baseline + sorted.reduce((a, s) => a + s.value, 0)).toFixed(3)}<br>(${fmtBRL(caso.renda_predita)})`
      ];

      const trace = {
        type: 'waterfall',
        orientation: 'v',
        measure: measures,
        x: labels,
        y: values,
        text: text,
        textposition: 'outside',
        textfont: { family: 'Inter, sans-serif', size: 11, color: COLORS.primary },
        connector: { line: { color: '#D1D5DB', dash: 'dot' } },
        increasing: { marker: { color: COLORS.success } },
        decreasing: { marker: { color: COLORS.danger } },
        totals:     { marker: { color: COLORS.primary } },
        hovertemplate: '<b>%{x}</b><br>Contribuição: %{y:.4f} (log-renda)<extra></extra>',
      };

      const layout = {
        title: { text: 'Decomposição SHAP — como cada feature empurrou a predição', font: { size: 13, color: '#6B7280' }, x: 0, xanchor: 'left' },
        font: { family: 'Inter, sans-serif', size: 11.5, color: '#2C3E50' },
        paper_bgcolor: '#FFFFFF', plot_bgcolor: '#FFFFFF',
        margin: { l: 50, r: 30, t: 50, b: 110 },
        height: 460,
        xaxis: { tickangle: -35, tickfont: { size: 10.5 } },
        yaxis: { title: { text: 'log-renda (espaço de treino)', font: { size: 11, color: '#6B7280' } }, gridcolor: '#F3F4F6' },
        showlegend: false,
      };
      Plotly.newPlot(plotEl, [trace], layout, PLOTLY_CONFIG);
    }

    // Atualiza tambem o painel de lineage (ja usa o caso ativo)
    renderLineagePanel(caso);
  }

  // ============================================================
  // 🎯 INTERATIVO 2 — Calculadora Stacking (lineage interativo)
  // Usuário ajusta predições KNN/HGBR/Cluster e vê resultado
  // Pré-popula com o caso ativo, mas pode editar
  // ============================================================
  let CALC_VALUES = { knn: 0, hgbr: 0, cluster: 0 };
  let CALC_WEIGHTS = null;

  function renderLineagePanel(caso) {
    // Reset valores pro caso ativo
    CALC_VALUES = {
      knn: caso.knn_pred,
      hgbr: caso.hgbr_pred,
      cluster: caso.cluster_pred,
    };
    // Atualiza os inputs no DOM
    ['knn', 'hgbr', 'cluster'].forEach(m => {
      const input = document.getElementById('calc-' + m);
      if (input) input.value = CALC_VALUES[m].toFixed(2);
    });
    updateCalcOutput();
  }

  function updateCalcOutput() {
    if (!CALC_WEIGHTS) return;
    const w = CALC_WEIGHTS;
    const c = CALC_VALUES;

    const contribKnn = w.knn * c.knn;
    const contribHgbr = w.hgbr_v2 * c.hgbr;
    const contribClu = w.cluster_v2 * c.cluster;
    const bias = w.bias;
    const total = contribKnn + contribHgbr + contribClu + bias;

    // Atualiza spans de contribuição
    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setText('contrib-knn',     fmtBRL(contribKnn));
    setText('contrib-hgbr',    fmtBRL(contribHgbr));
    setText('contrib-cluster', fmtBRL(contribClu));
    setText('contrib-bias',    fmtBRL(bias));
    setText('contrib-total',   fmtBRL(total));

    // Mini bar chart das contribuições
    const calcChart = document.getElementById('chart-calc-contrib');
    if (calcChart && window.Plotly) {
      const labels = ['KNN × 0.530', 'HGBR × 0.540', 'Cluster × 0.119', 'Bias'];
      const vals   = [contribKnn, contribHgbr, contribClu, bias];
      const colors = [COLORS.knn, COLORS.gbm, COLORS.cluster, COLORS.muted];

      const trace = {
        type: 'bar',
        x: labels, y: vals,
        marker: { color: colors },
        text: vals.map(v => fmtBRL(v)),
        textposition: 'outside',
        textfont: { family: 'Inter, sans-serif', size: 11 },
        hovertemplate: '<b>%{x}</b><br>%{y:.2f}<extra></extra>',
      };
      const layout = {
        font: { family: 'Inter, sans-serif', size: 12, color: '#2C3E50' },
        paper_bgcolor: '#FFFFFF', plot_bgcolor: '#FFFFFF',
        margin: { l: 60, r: 20, t: 30, b: 70 },
        height: 280,
        yaxis: { gridcolor: '#F3F4F6', zeroline: true, zerolinecolor: '#9CA3AF' },
        xaxis: { tickfont: { size: 11 } },
        title: { text: 'Contribuição de cada modelo (R$)', font: { size: 12, color: '#6B7280' } },
      };
      Plotly.newPlot(calcChart, [trace], layout, PLOTLY_CONFIG);
    }
  }

  function wireCalculator() {
    ['knn', 'hgbr', 'cluster'].forEach(m => {
      const input = document.getElementById('calc-' + m);
      if (!input) return;
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        if (!isNaN(v)) {
          CALC_VALUES[m] = v;
          updateCalcOutput();
        }
      });
    });
  }

  // ============================================================
  // Tabela dos 6 modelos
  // ============================================================
  function renderModelosTable(modelos, container) {
    const rows = modelos.map(m => {
      const isWinner = m.ehVencedor;
      const medal = isWinner ? '🏆 ' : '';
      const winnerCls = isWinner ? 'modelos-row-winner' : '';
      return `
        <tr class="${winnerCls}">
          <td><strong>${medal}${m.nome}</strong><div class="modelos-row-desc">${m.desc}</div></td>
          <td>${fmtBRL(m.mae)}</td>
          <td>${m.p50.toFixed(2)}%</td>
          <td>${m.p75.toFixed(2)}%</td>
          <td>${m.p90.toFixed(2)}%</td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <div class="modelos-table-wrapper">
        <table class="modelos-table">
          <thead>
            <tr>
              <th>Modelo</th>
              <th>MAE</th>
              <th>P50 erro %</th>
              <th>P75 erro %</th>
              <th>P90 erro %</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  // ============================================================
  // Cards de confiabilidade por CD_TIPO
  // ============================================================
  function renderConfiancaCards(confianca, container) {
    const NIVEL_INFO = {
      alta:       { label: 'Alta',       cor: COLORS.success, icone: '✓' },
      conceitual: { label: 'Conceitual', cor: COLORS.accent,  icone: '⚠' },
      baixa:      { label: 'Baixa',      cor: COLORS.danger,  icone: '⚠' },
    };
    container.innerHTML = confianca.map(c => {
      const info = NIVEL_INFO[c.nivel] || NIVEL_INFO.baixa;
      return `
        <div class="confianca-card" style="border-left-color: ${info.cor};">
          <div class="confianca-header">
            <span class="confianca-tipo">CD_TIPO ${c.tipo}</span>
            <span class="confianca-badge" style="background: ${info.cor}1A; color: ${info.cor};">
              ${info.icone} ${info.label}
            </span>
          </div>
          <h4 class="confianca-label">${c.label}</h4>
          <p class="confianca-desc">${c.explicacao}</p>
        </div>
      `;
    }).join('');
  }

  // ============================================================
  // BOOTSTRAP
  // ============================================================
  document.addEventListener('DOMContentLoaded', async () => {
    let data;
    try {
      const res = await fetch('data/modelagem_data.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      data = await res.json();
    } catch (err) {
      console.error('Erro carregando modelagem_data.json:', err);
      document.querySelectorAll('[data-needs-data]').forEach(el => {
        el.innerHTML = '<p style="padding: 2rem; text-align: center; color: var(--color-text-muted);">⚠ Não foi possível carregar os dados.</p>';
      });
      return;
    }

    SHAP_DATA = data;
    CALC_WEIGHTS = data.ridge_weights;

    // Espera Plotly carregar (defer)
    await new Promise((resolve) => {
      if (window.Plotly) return resolve();
      const tick = setInterval(() => { if (window.Plotly) { clearInterval(tick); resolve(); } }, 50);
    });

    // Charts estaticos
    const el = id => document.getElementById(id);
    if (el('chart-mae'))       renderMaeChart(data.modelos, el('chart-mae'));
    if (el('chart-ridge'))     renderRidgeDonut(data.ridge_weights, el('chart-ridge'));
    if (el('chart-features'))  renderFeatureImportance(data.feature_importance, el('chart-features'));
    if (el('tabela-modelos'))  renderModelosTable(data.modelos, el('tabela-modelos'));
    if (el('confianca-grid'))  renderConfiancaCards(data.confianca_por_tipo, el('confianca-grid'));

    // Texto interpretação Ridge
    const ridgeInterp = el('ridge-interpretacao');
    if (ridgeInterp) ridgeInterp.textContent = data.ridge_weights.interpretacao;

    // 🎯 Widget interativo SHAP
    const shapTabs = el('shap-tabs');
    if (shapTabs) {
      renderShapTabs(data.shap_casos, shapTabs);
      renderShapDetail();  // render inicial do caso default ('tipico')
    }

    // 🎯 Widget interativo Calculadora
    wireCalculator();
  });
})();
