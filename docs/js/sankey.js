// Renderiza os 2 sankeys e os cards das 8 etapas da pagina pipeline.html
(function () {
  'use strict';

  const PLOTLY_CONFIG = {
    displayModeBar: false,
    responsive: true,
  };

  const SANKEY_LAYOUT = (title) => ({
    title: {
      text: title,
      font: { family: 'Inter, sans-serif', size: 15, color: '#6B7280' },
      x: 0,
      xanchor: 'left',
    },
    font: { family: 'Inter, sans-serif', size: 12.5, color: '#2C3E50' },
    paper_bgcolor: '#FFFFFF',
    plot_bgcolor: '#FFFFFF',
    margin: { l: 10, r: 10, t: 40, b: 10 },
    height: 420,
  });

  function fmtNumber(v) {
    return v.toLocaleString('pt-BR');
  }

  function buildSankey(data) {
    const nodeLabels = data.nodes.map(n => n.label);
    const nodeColors = data.nodes.map(n => n.color);

    // Cor dos links com opacidade baseada na cor do node fonte
    const linkColors = data.links.map(l => {
      const c = data.nodes[l.source].color;
      return hexToRgba(c, 0.35);
    });

    const customLinkLabels = data.links.map(l => l.label || '');

    return {
      type: 'sankey',
      orientation: 'h',
      arrangement: 'snap',
      valueformat: ',',
      valuesuffix: ' setores',
      node: {
        pad: 18,
        thickness: 22,
        line: { color: 'rgba(255,255,255,0.85)', width: 1 },
        label: nodeLabels,
        color: nodeColors,
        hovertemplate: '<b>%{label}</b><br>%{value:,} setores<extra></extra>',
      },
      link: {
        source: data.links.map(l => l.source),
        target: data.links.map(l => l.target),
        value:  data.links.map(l => l.value),
        color:  linkColors,
        label:  customLinkLabels,
        hovertemplate:
          '%{source.label} → %{target.label}<br>' +
          '<b>%{value:,} setores</b><br>' +
          '%{label}<extra></extra>',
      },
    };
  }

  function hexToRgba(hex, alpha) {
    const cleanHex = hex.replace('#', '');
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function renderEtapasCards(etapas, container) {
    container.innerHTML = etapas.map(e => `
      <div class="etapa-card">
        <div class="etapa-header">
          <span class="etapa-num">${e.n}</span>
          <span class="etapa-icon" aria-hidden="true">${e.icon}</span>
        </div>
        <h3 class="etapa-titulo">${e.titulo}</h3>
        <p class="etapa-descricao">${e.descricao}</p>
        <span class="etapa-tech">${e.tech}</span>
      </div>
    `).join('');
  }

  function showError(container, msg) {
    container.innerHTML = `
      <div style="padding: 2rem; text-align: center; color: var(--color-text-muted);">
        <p>⚠ ${msg}</p>
      </div>
    `;
  }

  // === BOOTSTRAP ===
  document.addEventListener('DOMContentLoaded', async () => {
    let data;
    try {
      const res = await fetch('data/sankey_data.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      data = await res.json();
    } catch (err) {
      console.error('Erro carregando sankey_data.json:', err);
      ['sankey-geofencing', 'sankey-cobertura', 'etapas-grid'].forEach(id => {
        const el = document.getElementById(id);
        if (el) showError(el, 'Não foi possível carregar os dados do pipeline.');
      });
      return;
    }

    // Sankey 1 - Geofencing
    const geoEl = document.getElementById('sankey-geofencing');
    if (geoEl && window.Plotly) {
      Plotly.newPlot(
        geoEl,
        [buildSankey(data.geofencing)],
        SANKEY_LAYOUT(data.geofencing.subtitle),
        PLOTLY_CONFIG
      );
    }

    // Sankey 2 - Cobertura de renda
    const covEl = document.getElementById('sankey-cobertura');
    if (covEl && window.Plotly) {
      Plotly.newPlot(
        covEl,
        [buildSankey(data.cobertura_renda)],
        SANKEY_LAYOUT(data.cobertura_renda.subtitle),
        PLOTLY_CONFIG
      );
    }

    // Cards das 8 etapas
    const etapasEl = document.getElementById('etapas-grid');
    if (etapasEl && data.etapas) {
      renderEtapasCards(data.etapas, etapasEl);
    }
  });
})();
