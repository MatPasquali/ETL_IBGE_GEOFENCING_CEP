// Pagina explorar.html - busca interativa + card detalhado + mini-mapa
(function () {
  'use strict';

  const COLORS = {
    primary: '#1E3A5F',
    accent: '#E67E22',
    success: '#27AE60',
    danger: '#C0392B',
  };

  let SETORES_DATA = null;
  let SETOR_ATIVO = null;
  let CLASSE_FILTRO = 'todas';
  let MINI_MAP_INSTANCE = null;

  // === Mapeamentos ===
  const CD_TIPO_LABELS = {
    '0': 'Urbano comum',
    '1': 'Rural comum',
    '2': 'Aglomerado subnormal (favela urbana)',
    '3': 'Terra indígena',
    '4': 'Equipamentos públicos / parques',
    '5': 'Setor especial',
    '6': 'Aglomerado subnormal rural',
    '7': 'Militar / hospital / penitenciária',
    '8': 'Outros',
    '9': 'Quilombola',
  };

  const ORIGEM_RENDA_LABELS = {
    'original': { label: 'Dado IBGE original', cor: '#27AE60', icone: '✓' },
    'imputado_bairro': { label: 'Imputação por bairro', cor: '#CA8A04', icone: '~' },
    'imputado_subdistrito': { label: 'Imputação por subdistrito', cor: '#CA8A04', icone: '~' },
    'imputado_distrito': { label: 'Imputação por distrito', cor: '#CA8A04', icone: '~' },
    'imputado_municipio': { label: 'Imputação por município', cor: '#CA8A04', icone: '~' },
    'predicao_stack': { label: 'Predição do Stacking', cor: '#E67E22', icone: '⚡' },
    'predicao_knn': { label: 'Predição KNN', cor: '#E67E22', icone: '⚡' },
    'predicao_hgbr': { label: 'Predição HistGBR', cor: '#E67E22', icone: '⚡' },
    'predicao_hgbr_v2': { label: 'Predição HistGBR v2', cor: '#E67E22', icone: '⚡' },
    'predicao_cluster': { label: 'Predição Cluster', cor: '#E67E22', icone: '⚡' },
  };

  const ORIGEM_CEP_LABELS = {
    'geofencing': { label: 'Geofencing (point-in-polygon)', cor: '#27AE60', icone: '📍' },
    'cnefe_original': { label: 'CNEFE original (fallback híbrido)', cor: '#3498DB', icone: '🔄' },
    'sem_endereco_cnefe': { label: 'Sem endereço CNEFE', cor: '#95A5A6', icone: '✗' },
  };

  const CLASSE_LABELS = {
    'A': { label: 'A - Muito alta vulnerabilidade', cor: '#991B1B' },
    'B': { label: 'B - Alta vulnerabilidade', cor: '#9A3412' },
    'C': { label: 'C - Vulnerabilidade média', cor: '#92400E' },
    'D': { label: 'D - Baixa vulnerabilidade', cor: '#065F46' },
    'E': { label: 'E - Muito baixa vulnerabilidade', cor: '#1E40AF' },
  };

  function fmtBRL(v) {
    if (v === null || v === undefined) return '—';
    return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtInt(v) {
    if (v === null || v === undefined) return '—';
    return Number(v).toLocaleString('pt-BR');
  }

  // ============================================================
  // CARREGA DATASET (8 MB) - lazy
  // ============================================================
  async function loadData() {
    if (SETORES_DATA) return SETORES_DATA;
    const resultsList = document.getElementById('results-list');
    if (resultsList) {
      resultsList.innerHTML = `
        <div class="loading-state">
          <div class="loading-spinner"></div>
          <div>Carregando 27.252 setores de SP-capital...</div>
        </div>
      `;
    }
    try {
      const res = await fetch('data/sp_capital_setores.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      SETORES_DATA = await res.json();

      // Update meta stats
      const meta = SETORES_DATA.metadata;
      const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };
      set('stat-total',     fmtInt(meta.total_setores));
      set('stat-distritos', fmtInt(meta.total_distritos));
      set('stat-ivs',       Number(meta.media_ivs).toFixed(1));
      set('stat-renda',     fmtBRL(meta.mediana_renda));

      return SETORES_DATA;
    } catch (err) {
      console.error('Erro carregando setores:', err);
      if (resultsList) {
        resultsList.innerHTML = '<div class="results-empty"><div class="results-empty-icon">⚠</div>Não foi possível carregar os dados.</div>';
      }
      return null;
    }
  }

  // ============================================================
  // BUSCA
  // ============================================================
  function search(query, classeFilter) {
    if (!SETORES_DATA) return [];
    const q = (query || '').trim().toLowerCase();
    if (q.length < 2 && classeFilter === 'todas') return [];

    let filtered = SETORES_DATA.setores;

    // Filtro classe
    if (classeFilter !== 'todas') {
      filtered = filtered.filter(s => s.cv === classeFilter);
    }

    // Filtro texto
    if (q.length >= 2) {
      filtered = filtered.filter(s => {
        if (s.id && s.id.toLowerCase().includes(q)) return true;
        if (s.dt && s.dt.toLowerCase().includes(q)) return true;
        if (s.br && s.br.toLowerCase().includes(q)) return true;
        if (s.fc && s.fc.toLowerCase().includes(q)) return true;
        if (s.lc && s.lc.toLowerCase().includes(q)) return true;
        return false;
      });
    }

    return filtered.slice(0, 100);  // limite pra renderizar
  }

  function renderResults(results) {
    const container = document.getElementById('results-list');
    if (!container) return;
    if (!results || results.length === 0) {
      container.innerHTML = `
        <div class="results-empty">
          <div class="results-empty-icon">🔍</div>
          Nenhum setor encontrado.
        </div>
      `;
      return;
    }
    container.innerHTML = results.map(s => `
      <div class="result-item" data-id="${s.id}">
        <div class="result-info">
          <p class="result-setor">${s.id}</p>
          <p class="result-distrito">${s.dt || 'Distrito não disponível'}</p>
        </div>
        <div class="result-ivs">
          <div class="result-ivs-value">${s.iv !== null ? Number(s.iv).toFixed(1) : '—'}</div>
          <span class="result-classe classe-${s.cv || ''}">${s.cv || ''}</span>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.result-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        container.querySelectorAll('.result-item').forEach(e => e.classList.remove('active'));
        el.classList.add('active');
        const setor = SETORES_DATA.setores.find(s => s.id === id);
        if (setor) renderCard(setor);
      });
    });
  }

  function updateResultsCount(count, total) {
    const el = document.getElementById('results-count');
    if (el) {
      if (total > 100) {
        el.innerHTML = `<span class="results-count">${count}</span> resultados (mostrando primeiros 100)`;
      } else {
        el.innerHTML = `<span class="results-count">${count}</span> ${count === 1 ? 'resultado' : 'resultados'}`;
      }
    }
  }

  // ============================================================
  // CARD DO SETOR ATIVO
  // ============================================================
  function renderCard(setor) {
    SETOR_ATIVO = setor;
    const card = document.getElementById('setor-card');
    if (!card) return;

    const origem = ORIGEM_RENDA_LABELS[setor.or] || { label: setor.or || '—', cor: '#6B7280', icone: '?' };
    const origemCep = ORIGEM_CEP_LABELS[setor.oc] || { label: setor.oc || '—', cor: '#6B7280', icone: '?' };
    const classeInfo = CLASSE_LABELS[setor.cv] || { label: '—', cor: '#6B7280' };
    const tipoLabel = CD_TIPO_LABELS[setor.tp] || `Tipo ${setor.tp}`;

    const rendaClass = (setor.or && setor.or.startsWith('predicao'))
      ? 'origem-predicao'
      : (setor.or && setor.or.startsWith('imputado'))
        ? 'origem-imputado'
        : '';

    const cepsTopList = setor.lc ? setor.lc.split(',').filter(c => c && c !== '...') : [];
    const cepsMore = (setor.lc || '').includes('...');

    const ceps = cepsTopList.map(c => `<span class="cep-badge">${c}</span>`).join('');
    const cepsExtra = cepsMore || (setor.qc > cepsTopList.length)
      ? `<span class="cep-badge more">+${setor.qc - cepsTopList.length} outros</span>`
      : '';

    card.innerHTML = `
      <div class="card-header">
        <div class="card-header-eyebrow">Setor Censitário CD2022</div>
        <h2 class="card-setor">${setor.id}</h2>
        <div class="card-localizacao">
          ${setor.dt || 'Distrito não disponível'} · São Paulo, SP
        </div>
        <div class="card-tags">
          <span class="card-tag">CD_TIPO ${setor.tp} · ${tipoLabel}</span>
          <span class="card-tag">Ranking #${fmtInt(setor.rk)} de 27.252</span>
        </div>
      </div>

      <div class="card-section">
        <h3 class="card-section-title">Vulnerabilidade Socioambiental</h3>
        <div class="ivs-display">
          <div class="ivs-gauge" style="background: ${classeInfo.cor};">${setor.iv !== null ? Number(setor.iv).toFixed(0) : '—'}</div>
          <div class="ivs-meta">
            <div class="ivs-class" style="color: ${classeInfo.cor};">${classeInfo.label}</div>
            <div class="ivs-rank">IVS = ${setor.iv !== null ? Number(setor.iv).toFixed(2) : '—'} / 100 · Posição #${fmtInt(setor.rk)} em SP-capital</div>
          </div>
        </div>

        <div class="card-stats-grid" style="margin-top: 1rem;">
          <div class="card-stat">
            <div class="card-stat-label">Densidade</div>
            <div class="card-stat-value">${fmtInt(setor.ds)}</div>
            <div class="card-stat-sub">hab/km²</div>
          </div>
          <div class="card-stat">
            <div class="card-stat-label">Coabitação</div>
            <div class="card-stat-value">${setor.cb !== null ? Number(setor.cb).toFixed(2) : '—'}</div>
            <div class="card-stat-sub">moradores/domicílio</div>
          </div>
        </div>
      </div>

      <div class="card-section">
        <h3 class="card-section-title">Renda Média Mensal (V06004)</h3>
        <div class="renda-box ${rendaClass}">
          <div class="renda-valor">${fmtBRL(setor.rd)}</div>
          <div class="renda-meta">
            Origem: <strong>${origem.icone} ${origem.label}</strong>
          </div>
          ${setor.re !== setor.rd && setor.re !== null
            ? `<div class="renda-meta" style="margin-top: 0.5rem;">
                 Valor honesto (sem predição): <strong>${fmtBRL(setor.re)}</strong>
               </div>` : ''}
          ${setor.rm !== null
            ? `<div class="renda-meta" style="margin-top: 0.5rem;">
                 Mediana V06006: <strong>${fmtBRL(setor.rm)}</strong>
               </div>` : ''}
        </div>
      </div>

      <div class="card-section">
        <h3 class="card-section-title">CEPs do setor (${setor.qc} no total)</h3>
        <div class="ceps-display">
          ${setor.fc ? `<div class="cep-faixa">${setor.fc.replace(' - ', ' → ')}</div>` : ''}
          <div class="cep-lista">
            ${ceps}
            ${cepsExtra}
          </div>
          <div style="margin-top: 0.875rem; font-size: 0.8125rem; color: var(--color-text-muted);">
            Origem CEP: <strong style="color: ${origemCep.cor};">${origemCep.icone} ${origemCep.label}</strong>
            · ${fmtInt(setor.te)} endereços CNEFE agregados
          </div>
        </div>
      </div>

      ${setor.la && setor.lo ? `
      <div class="card-section">
        <h3 class="card-section-title">Localização Geográfica</h3>
        <div class="mini-map-wrapper">
          <div id="mini-map" class="mini-map"></div>
        </div>
        <div style="margin-top: 0.625rem; font-size: 0.75rem; color: var(--color-text-muted); font-family: 'JetBrains Mono', monospace;">
          centróide: ${setor.la.toFixed(5)}, ${setor.lo.toFixed(5)}
        </div>
      </div>
      ` : ''}
    `;

    // Renderiza mini mapa apos o DOM ser atualizado
    if (setor.la && setor.lo && window.L) {
      setTimeout(() => renderMiniMap(setor), 50);
    }

    // Scroll suave pro card em mobile
    if (window.innerWidth < 980) {
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function renderMiniMap(setor) {
    const mapEl = document.getElementById('mini-map');
    if (!mapEl || !window.L) return;

    if (MINI_MAP_INSTANCE) {
      MINI_MAP_INSTANCE.remove();
      MINI_MAP_INSTANCE = null;
    }

    MINI_MAP_INSTANCE = L.map(mapEl, {
      zoomControl: true,
      attributionControl: false,
    }).setView([setor.la, setor.lo], 14);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
      maxZoom: 18,
    }).addTo(MINI_MAP_INSTANCE);

    L.marker([setor.la, setor.lo], {
      icon: L.divIcon({
        className: 'custom-marker',
        html: `<div style="background: ${COLORS.accent}; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-weight: 800; font-size: 11px; font-family: 'JetBrains Mono', monospace;">${setor.cv || '?'}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      })
    })
    .bindPopup(`<b>${setor.id}</b><br>${setor.dt || ''}<br>IVS: ${setor.iv !== null ? setor.iv.toFixed(2) : '—'}`)
    .addTo(MINI_MAP_INSTANCE);
  }

  function renderEmptyCard() {
    const card = document.getElementById('setor-card');
    if (!card) return;
    card.innerHTML = `
      <div class="setor-card-empty">
        <div class="setor-card-empty-icon">🔍</div>
        <h3>Selecione um setor para explorar</h3>
        <p>Digite um código de setor (15 dígitos), nome de distrito ou CEP no campo ao lado. Os resultados aparecem em tempo real.</p>
      </div>
    `;
  }

  // ============================================================
  // BOOTSTRAP
  // ============================================================
  let searchDebounce = null;

  async function doSearch() {
    if (!SETORES_DATA) {
      await loadData();
      if (!SETORES_DATA) return;
    }
    const query = document.getElementById('search-input').value;
    const results = search(query, CLASSE_FILTRO);
    updateResultsCount(results.length, results.length);
    if (query.length < 2 && CLASSE_FILTRO === 'todas') {
      const container = document.getElementById('results-list');
      if (container) {
        container.innerHTML = `
          <div class="results-empty">
            <div class="results-empty-icon">⌨</div>
            Digite algo pra começar a buscar.<br>
            <small style="font-size: 0.8rem;">Ou use os filtros de classe acima.</small>
          </div>
        `;
        updateResultsCount(0, 0);
      }
      return;
    }
    renderResults(results);
  }

  function wireEvents() {
    const input = document.getElementById('search-input');
    const clearBtn = document.getElementById('search-clear');

    if (input) {
      input.addEventListener('input', () => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(doSearch, 180);
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (input) input.value = '';
        doSearch();
      });
    }

    // Filtros classe
    document.querySelectorAll('.search-class-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.search-class-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        CLASSE_FILTRO = btn.dataset.classe;
        doSearch();
      });
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    renderEmptyCard();
    wireEvents();

    // Pre-carrega dados em background
    await loadData();

    // Estado inicial
    const container = document.getElementById('results-list');
    if (container) {
      container.innerHTML = `
        <div class="results-empty">
          <div class="results-empty-icon">⌨</div>
          Digite algo pra começar a buscar.<br>
          <small style="font-size: 0.8rem;">Ou use os filtros de classe acima.</small>
        </div>
      `;
    }

    // Carrega um exemplo pra demonstrar o card
    if (SETORES_DATA && SETORES_DATA.setores.length > 0) {
      // Pega um setor de exemplo bonitinho: Moema ou similar, classe E (baixa vuln)
      const exemplo = SETORES_DATA.setores.find(s => s.dt === 'Moema' && s.cv === 'E')
        || SETORES_DATA.setores.find(s => s.cv === 'E')
        || SETORES_DATA.setores[0];
      if (exemplo) renderCard(exemplo);
    }
  });
})();
