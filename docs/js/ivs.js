// Pagina ivs.html - mapa interativo + rankings + componentes
(function () {
  'use strict';

  const PALETTE = [
    { max: 20,  cor: '#FFEDA0', label: 'E - Muito baixa' },
    { max: 40,  cor: '#FED976', label: 'D - Baixa' },
    { max: 60,  cor: '#FD8D3C', label: 'C - Media' },
    { max: 80,  cor: '#FC4E2A', label: 'B - Alta' },
    { max: 100, cor: '#B10026', label: 'A - Muito alta' },
  ];

  function colorForIvs(ivs) {
    if (ivs === null || ivs === undefined || isNaN(ivs)) return '#CCCCCC';
    for (const p of PALETTE) {
      if (ivs <= p.max) return p.cor;
    }
    return PALETTE[PALETTE.length - 1].cor;
  }

  function classForIvs(ivs) {
    if (ivs === null || ivs === undefined || isNaN(ivs)) return null;
    for (const p of PALETTE) {
      if (ivs <= p.max) return p.label;
    }
    return null;
  }

  function fmtBRL(v) {
    if (v === null || v === undefined) return '—';
    return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtInt(v) {
    if (v === null || v === undefined) return '—';
    return Number(v).toLocaleString('pt-BR');
  }

  // ========================================================
  // MAPA LEAFLET INTERATIVO (645 municípios SP)
  // ========================================================
  let MAP_INSTANCE = null;
  let GEOJSON_LAYER = null;
  let GEOJSON_DATA = null;
  let CLASSE_ATIVA = 'todas';

  async function initMap() {
    const mapEl = document.getElementById('ivs-map');
    if (!mapEl || !window.L) return;

    mapEl.classList.add('loading');

    // Centro aproximado de SP
    MAP_INSTANCE = L.map('ivs-map', {
      preferCanvas: true,  // canvas renderiza poligonos 5-10x mais rapido em vol grandes
      zoomControl: true,
      attributionControl: false,
    }).setView([-22.7, -48.5], 7);

    // Tile CartoDB Positron (leve, neutro)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© OpenStreetMap, © CartoDB',
    }).addTo(MAP_INSTANCE);

    L.control.attribution({ position: 'bottomright', prefix: false })
      .addAttribution('Geometria: IBGE CD2022 · IVS: cálculo proprio')
      .addTo(MAP_INSTANCE);

    try {
      const res = await fetch('data/ivs_sp_municipios.geojson');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      GEOJSON_DATA = await res.json();
    } catch (err) {
      console.error('Erro carregando GeoJSON:', err);
      mapEl.classList.remove('loading');
      mapEl.innerHTML = '<div style="padding: 2rem; text-align: center; color: #6B7280;">⚠ Não foi possível carregar o mapa.</div>';
      return;
    }

    renderGeoJsonLayer();
    mapEl.classList.remove('loading');
  }

  function renderGeoJsonLayer() {
    if (GEOJSON_LAYER) MAP_INSTANCE.removeLayer(GEOJSON_LAYER);

    GEOJSON_LAYER = L.geoJSON(GEOJSON_DATA, {
      style: featureStyle,
      onEachFeature: bindFeatureEvents,
    }).addTo(MAP_INSTANCE);
  }

  function featureStyle(feature) {
    const p = feature.properties;
    const ivs = p.ivs_medio;
    const classe = classForIvs(ivs);
    const isFiltered = CLASSE_ATIVA !== 'todas' && classe !== CLASSE_ATIVA;
    return {
      fillColor: colorForIvs(ivs),
      weight: isFiltered ? 0.3 : 0.7,
      color: '#FFFFFF',
      fillOpacity: isFiltered ? 0.15 : 0.78,
    };
  }

  function bindFeatureEvents(feature, layer) {
    const p = feature.properties;
    const popup = `
      <h4 class="popup-title">${p.nm_mun || 'Município'}</h4>
      <div class="popup-row">
        <span class="popup-label">IVS médio</span>
        <span class="popup-value">${Number(p.ivs_medio).toFixed(2)}</span>
      </div>
      <div class="popup-row">
        <span class="popup-label">Classe</span>
        <span class="popup-value">${classForIvs(p.ivs_medio) || '—'}</span>
      </div>
      <div class="popup-row">
        <span class="popup-label">Renda mediana</span>
        <span class="popup-value">${fmtBRL(p.renda_mediana)}</span>
      </div>
      <div class="popup-row">
        <span class="popup-label">Coabitação mediana</span>
        <span class="popup-value">${p.coabitacao_mediana ? Number(p.coabitacao_mediana).toFixed(2) + ' mor/dom' : '—'}</span>
      </div>
      <div class="popup-row">
        <span class="popup-label">Setores</span>
        <span class="popup-value">${fmtInt(p.setores)}</span>
      </div>
      <div class="popup-row">
        <span class="popup-label">% classe A (alta vuln)</span>
        <span class="popup-value">${Number(p.pct_classe_a || 0).toFixed(1)}%</span>
      </div>
    `;
    layer.bindPopup(popup, { closeButton: true });

    layer.on({
      mouseover: (e) => {
        const l = e.target;
        l.setStyle({ weight: 2.5, color: '#1E3A5F', fillOpacity: 0.92 });
        if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) l.bringToFront();
      },
      mouseout: (e) => {
        GEOJSON_LAYER.resetStyle(e.target);
      },
      click: (e) => {
        MAP_INSTANCE.fitBounds(e.target.getBounds(), { padding: [20, 20], maxZoom: 10 });
      },
    });
  }

  // ========================================================
  // FILTRO POR CLASSE (A-E)
  // ========================================================
  function wireClassFilter() {
    const buttons = document.querySelectorAll('.class-filter-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        CLASSE_ATIVA = btn.dataset.classe;
        renderGeoJsonLayer();
      });
    });
  }

  // ========================================================
  // CARDS DOS 4 COMPONENTES
  // ========================================================
  function renderComponentes(componentes, container) {
    container.innerHTML = componentes.map(c => {
      const correlBadge = c.correlacao_ivs !== undefined && c.correlacao_ivs !== null
        ? `<span class="componente-correl">↻ correlação com IVS: ${Math.abs(c.correlacao_ivs).toFixed(2)}</span>`
        : '';
      return `
        <div class="componente-card">
          <div class="componente-header">
            <div class="componente-icon-wrap">${c.icone}</div>
            <div class="componente-peso">${(c.peso * 100).toFixed(0)}%</div>
          </div>
          <h3 class="componente-nome">${c.nome}</h3>
          <p class="componente-desc">${c.descricao}</p>
          <div class="componente-formula">${c.formula}</div>
          <p class="componente-just">${c.justificativa}</p>
          ${correlBadge}
        </div>
      `;
    }).join('');
  }

  // ========================================================
  // TABELAS DE RANKING (municipios e distritos)
  // ========================================================
  function rankingRow(item, i, isDistrito = false) {
    const nome = isDistrito ? item.NM_DIST : item.nm_mun;
    const ivs = Number(item.ivs_medio);
    const ivsColorClass = ivs >= 80 ? 'ivs-cor-altissima'
                        : ivs >= 60 ? 'ivs-cor-alta'
                        : ivs >= 40 ? 'ivs-cor-media'
                        : ivs >= 20 ? 'ivs-cor-baixa'
                        : 'ivs-cor-baixissima';
    const extra = isDistrito
      ? `${fmtBRL(item.renda_mediana)} · ${Number(item.coabitacao_mediana).toFixed(2)} mor/dom`
      : `${fmtBRL(item.renda_mediana)} · ${fmtInt(item.setores)} setores`;

    return `
      <div class="ranking-row">
        <span class="ranking-pos">${i + 1}</span>
        <div class="ranking-info">
          <div class="ranking-nome">${nome}</div>
          <div class="ranking-meta">${extra}</div>
        </div>
        <div class="ranking-ivs">
          <div class="ranking-ivs-value ${ivsColorClass}">${ivs.toFixed(1)}</div>
          <div class="ranking-ivs-label">IVS</div>
        </div>
      </div>
    `;
  }

  function renderRankings(data) {
    const ids = [
      { el: 'ranking-mun-top',     items: data.top_municipios_vulneraveis,            isDistrito: false },
      { el: 'ranking-mun-bottom',  items: data.top_municipios_menos_vulneraveis,      isDistrito: false },
      { el: 'ranking-dist-top',    items: data.top_distritos_sp_vulneraveis,          isDistrito: true },
      { el: 'ranking-dist-bottom', items: data.top_distritos_sp_menos_vulneraveis,    isDistrito: true },
    ];
    ids.forEach(({ el, items, isDistrito }) => {
      const container = document.getElementById(el);
      if (container && items) {
        container.innerHTML = items.map((it, i) => rankingRow(it, i, isDistrito)).join('');
      }
    });
  }

  // ========================================================
  // VALIDACAO + LIMITACOES
  // ========================================================
  function renderValidacao(metricas) {
    const setCorrel = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val !== undefined && val !== null ? val.toFixed(3) : '—';
    };
    setCorrel('correl-renda',     metricas.correlacao_ivs_renda);
    setCorrel('correl-densidade', metricas.correlacao_ivs_densidade);
    setCorrel('correl-coab',      metricas.correlacao_ivs_coabitacao);

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setVal('stat-setores',     fmtInt(metricas.total_setores));
    setVal('stat-municipios',  fmtInt(metricas.total_municipios));
    setVal('stat-cobertura',   metricas.cobertura_ivs_pct.toFixed(2) + '%');
  }

  function renderLimitacoes(limitacoes, container) {
    container.innerHTML = '<ul>' + limitacoes.map(l => `<li>${l}</li>`).join('') + '</ul>';
  }

  // ========================================================
  // BOOTSTRAP
  // ========================================================
  document.addEventListener('DOMContentLoaded', async () => {
    let data;
    try {
      const res = await fetch('data/ivs_data.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      data = await res.json();
    } catch (err) {
      console.error('Erro carregando ivs_data.json:', err);
      document.querySelectorAll('[data-needs-data]').forEach(el => {
        el.innerHTML = '<p style="padding: 2rem; text-align: center; color: var(--color-text-muted);">⚠ Não foi possível carregar os dados.</p>';
      });
      return;
    }

    // Renderiza componentes
    const compEl = document.getElementById('componentes-grid');
    if (compEl) renderComponentes(data.componentes, compEl);

    // Renderiza rankings
    renderRankings(data);

    // Validacao
    renderValidacao(data.metricas_gerais);

    // Limitacoes
    const limEl = document.getElementById('limitacoes-list');
    if (limEl) renderLimitacoes(data.limitacoes, limEl);

    // Mapa (carrega Leaflet sob demanda se nao estiver carregado)
    await initMap();
    wireClassFilter();
  });
})();
