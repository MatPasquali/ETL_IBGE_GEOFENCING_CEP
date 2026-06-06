// Chat XAI - busca semantica fuzzy via Fuse.js sobre conhecimento do projeto
(function () {
  'use strict';

  let KB_DATA = null;
  let FUSE_FAQ = null;
  let FUSE_CHUNKS = null;
  let CATEGORIA_ATIVA = 'todas';

  const CAT_LABELS = {
    'todas':       { label: 'Todas',       icon: '✨' },
    'pipeline':    { label: 'Pipeline',    icon: '🌊' },
    'modelagem':   { label: 'Modelagem',   icon: '🤖' },
    'ivs':         { label: 'IVS',         icon: '🗺' },
    'bug':         { label: 'Bug fix',     icon: '🐛' },
    'conceitos':   { label: 'Conceitos',   icon: '📚' },
    'site':        { label: 'Site/Autor',  icon: '👤' },
    'visualizacao':{ label: 'Mapas',       icon: '📍' },
  };

  // ============================================================
  // CARREGA knowledge_base.json e indexa via Fuse.js
  // ============================================================
  async function loadKnowledgeBase() {
    try {
      const res = await fetch('data/knowledge_base.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      KB_DATA = await res.json();

      // Indexa FAQ (busca em pergunta + resposta + keywords)
      FUSE_FAQ = new Fuse(KB_DATA.faq, {
        keys: [
          { name: 'pergunta', weight: 3 },
          { name: 'resposta', weight: 1 },
          { name: 'keywords', weight: 2 },
        ],
        threshold: 0.4,
        ignoreLocation: true,
        includeScore: true,
        minMatchCharLength: 3,
      });

      // Indexa chunks (busca em title + content + keywords)
      FUSE_CHUNKS = new Fuse(KB_DATA.chunks, {
        keys: [
          { name: 'title', weight: 2 },
          { name: 'content', weight: 1 },
          { name: 'keywords', weight: 2 },
        ],
        threshold: 0.42,
        ignoreLocation: true,
        includeScore: true,
        minMatchCharLength: 3,
      });

      console.log(`KB carregada: ${KB_DATA.faq.length} FAQs + ${KB_DATA.chunks.length} chunks`);
      return true;
    } catch (err) {
      console.error('Erro carregando knowledge_base:', err);
      return false;
    }
  }

  // ============================================================
  // BUSCA: tenta FAQ primeiro, depois chunks
  // ============================================================
  function buscar(query) {
    if (!KB_DATA || !FUSE_FAQ || !FUSE_CHUNKS) return null;

    const q = query.trim();
    if (q.length < 3) return null;

    // FAQ tem prioridade: se encontra match bom, retorna
    let faqResults = FUSE_FAQ.search(q);
    if (CATEGORIA_ATIVA !== 'todas') {
      faqResults = faqResults.filter(r => r.item.categoria === CATEGORIA_ATIVA);
    }

    if (faqResults.length > 0 && faqResults[0].score < 0.35) {
      return {
        tipo: 'faq',
        match: faqResults[0].item,
        chunks_extra: [],
      };
    }

    // Busca em chunks tambem (RAG-style)
    let chunkResults = FUSE_CHUNKS.search(q);
    if (CATEGORIA_ATIVA !== 'todas') {
      chunkResults = chunkResults.filter(r => r.item.categoria === CATEGORIA_ATIVA);
    }
    const topChunks = chunkResults.slice(0, 3).map(r => r.item);

    if (faqResults.length > 0) {
      // FAQ moderado + chunks extras
      return {
        tipo: 'faq_plus',
        match: faqResults[0].item,
        chunks_extra: topChunks.slice(0, 2),
      };
    }

    if (topChunks.length > 0) {
      return {
        tipo: 'chunks',
        match: null,
        chunks_extra: topChunks,
      };
    }

    return { tipo: 'empty', match: null, chunks_extra: [] };
  }

  // ============================================================
  // RENDER MENSAGEM
  // ============================================================
  function addMessage(text, isUser = false, extras = null) {
    const messages = document.getElementById('chat-messages');
    if (!messages) return;

    const msgEl = document.createElement('div');
    msgEl.className = 'chat-message ' + (isUser ? 'user' : 'bot');

    const avatar = isUser ? 'EU' : '🤖';

    let extrasHtml = '';
    if (extras && extras.chunks && extras.chunks.length > 0) {
      extrasHtml = '<div style="margin-top: 0.875rem;">';
      extras.chunks.forEach(ch => {
        extrasHtml += `
          <div class="chat-rag-chunk">
            <div class="chat-rag-chunk-source">📄 ${escapeHtml(ch.source || '')}</div>
            ${ch.title ? `<div class="chat-rag-chunk-title">${escapeHtml(ch.title)}</div>` : ''}
            <div class="chat-rag-chunk-text">${escapeHtml(ch.content).substring(0, 400)}${ch.content.length > 400 ? '...' : ''}</div>
          </div>
        `;
      });
      extrasHtml += '</div>';
    }

    let sourceTag = '';
    if (extras && extras.source) {
      sourceTag = `<span class="chat-source">${escapeHtml(extras.source)}</span>`;
    }

    msgEl.innerHTML = `
      <div class="chat-message-avatar">${avatar}</div>
      <div class="chat-message-content">
        <div class="chat-message-bubble">${formatText(text)}</div>
        ${sourceTag}
        ${extrasHtml}
      </div>
    `;
    messages.appendChild(msgEl);
    messages.scrollTop = messages.scrollHeight;
  }

  function addTypingIndicator() {
    const messages = document.getElementById('chat-messages');
    if (!messages) return;
    const el = document.createElement('div');
    el.className = 'chat-message bot';
    el.id = 'chat-typing-indicator';
    el.innerHTML = `
      <div class="chat-message-avatar">🤖</div>
      <div class="chat-message-content">
        <div class="chat-message-bubble">
          <div class="chat-typing">
            <span class="chat-typing-dot"></span>
            <span class="chat-typing-dot"></span>
            <span class="chat-typing-dot"></span>
          </div>
        </div>
      </div>
    `;
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
  }

  function removeTypingIndicator() {
    const el = document.getElementById('chat-typing-indicator');
    if (el) el.remove();
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[c]));
  }

  function formatText(text) {
    if (typeof text !== 'string') return '';
    // Escape primeiro
    let out = escapeHtml(text);
    // Negrito **txt**
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Codigo `txt`
    out = out.replace(/`([^`]+)`/g, '<code style="background: rgba(30,58,95,0.08); padding: 0.1rem 0.3rem; border-radius: 3px; font-family: JetBrains Mono, monospace; font-size: 0.85em;">$1</code>');
    // Quebras de linha
    out = out.replace(/\n/g, '<br>');
    return out;
  }

  // ============================================================
  // PROCESSA PERGUNTA
  // ============================================================
  function processarPergunta(query) {
    addMessage(query, true);

    const input = document.getElementById('chat-input');
    if (input) input.value = '';

    addTypingIndicator();

    // Pequeno delay pra parecer que ta processando (UX)
    setTimeout(() => {
      removeTypingIndicator();

      const resultado = buscar(query);

      if (!resultado || resultado.tipo === 'empty') {
        addMessage(
          'Hmm, não encontrei nada específico sobre isso no conhecimento do projeto. Tente reformular ou use uma das sugestões abaixo! 💡',
          false
        );
        return;
      }

      if (resultado.tipo === 'faq') {
        const faq = resultado.match;
        addMessage(faq.resposta, false, {
          source: 'FAQ do projeto · ' + (CAT_LABELS[faq.categoria]?.label || faq.categoria),
        });
      } else if (resultado.tipo === 'faq_plus') {
        const faq = resultado.match;
        addMessage(faq.resposta, false, {
          source: 'FAQ do projeto',
          chunks: resultado.chunks_extra,
        });
      } else if (resultado.tipo === 'chunks') {
        const intro = `Encontrei ${resultado.chunks_extra.length} trecho${resultado.chunks_extra.length > 1 ? 's' : ''} relevante${resultado.chunks_extra.length > 1 ? 's' : ''} no projeto:`;
        addMessage(intro, false, {
          chunks: resultado.chunks_extra,
        });
      }
    }, 600 + Math.random() * 400);
  }

  // ============================================================
  // RENDER SUGESTOES
  // ============================================================
  function renderSugestoes() {
    if (!KB_DATA) return;
    const container = document.getElementById('chat-suggestions');
    if (!container) return;

    // Filtra FAQs por categoria ativa
    let faqs = KB_DATA.faq;
    if (CATEGORIA_ATIVA !== 'todas') {
      faqs = faqs.filter(f => f.categoria === CATEGORIA_ATIVA);
    }

    // Pega 5 aleatorios
    const shuffled = [...faqs].sort(() => Math.random() - 0.5).slice(0, 5);

    container.innerHTML = shuffled.map(f =>
      `<button class="chat-suggestion" data-pergunta="${escapeHtml(f.pergunta)}">${escapeHtml(f.pergunta)}</button>`
    ).join('');

    container.querySelectorAll('.chat-suggestion').forEach(btn => {
      btn.addEventListener('click', () => {
        const pergunta = btn.dataset.pergunta;
        processarPergunta(pergunta);
        // Re-randomiza sugestoes apos cada uso
        setTimeout(renderSugestoes, 100);
      });
    });
  }

  function renderCategorias() {
    const container = document.getElementById('chat-categories');
    if (!container) return;

    const cats = ['todas', 'pipeline', 'modelagem', 'ivs', 'bug', 'conceitos', 'site'];
    container.innerHTML = cats.map(c => {
      const info = CAT_LABELS[c] || { label: c, icon: '' };
      const active = c === CATEGORIA_ATIVA ? 'active' : '';
      return `<button class="chat-cat-btn ${active}" data-cat="${c}">${info.icon} ${info.label}</button>`;
    }).join('');

    container.querySelectorAll('.chat-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.chat-cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        CATEGORIA_ATIVA = btn.dataset.cat;
        renderSugestoes();
      });
    });
  }

  // ============================================================
  // BOOTSTRAP
  // ============================================================
  function wireInput() {
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send');

    function doSend() {
      if (!input) return;
      const val = input.value.trim();
      if (!val) return;
      processarPergunta(val);
    }

    if (sendBtn) sendBtn.addEventListener('click', doSend);
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          doSend();
        }
      });

      // Auto-resize
      input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
      });
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const ok = await loadKnowledgeBase();
    if (!ok) {
      const messages = document.getElementById('chat-messages');
      if (messages) {
        messages.innerHTML = '<div class="chat-empty"><div class="chat-empty-icon">⚠</div>Não foi possível carregar o conhecimento do projeto.</div>';
      }
      return;
    }

    renderCategorias();
    renderSugestoes();
    wireInput();

    // Mensagem inicial bem-vinda
    addMessage(
      'Olá! 👋 Eu sou a IA do projeto - conheço **tudo sobre o ETL IBGE Geofencing CEP**: pipeline, modelagem 100% via Stacking, IVS, decisões de design, bugs corrigidos. **Pergunte qualquer coisa** ou use uma das sugestões abaixo!',
      false
    );
  });
})();
