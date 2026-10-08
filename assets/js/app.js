(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  let DATA = null;
  let searchTimer = null;
  let searchAllItems = [];
  let searchShown = 0;
  const SEARCH_PAGE = 8;

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }
  function hasText(v) { return !!(v && String(v).trim()); }
  function fixDriveImages(root) {
    if (typeof normalizeImageUrl !== 'function') return;
    (root || document).querySelectorAll('img[src]').forEach(img => {
      const raw = img.getAttribute('src') || '';
      const n = normalizeImageUrl(raw);
      if (n && n !== raw) img.setAttribute('src', n);
      img.setAttribute('referrerpolicy', 'no-referrer');
    });
  }
  function tagHTML(tags, limit) {
    return (tags || []).slice(0, limit || 6).map(t =>
      `<button type="button" class="tag tag-click" data-tag="${esc(t)}">${esc(t)}</button>`
    ).join('');
  }
  function cardHTML(item, section) {
    const icon = { news: '📰', articles: '📚', iso17025: '📋', consult: '💼' }[section] || '📄';
    const cover = item.cover
      ? `<div class="card-cover"><img src="${esc(normalizeImageUrl(item.cover))}" alt="" referrerpolicy="no-referrer" loading="lazy"></div>`
      : `<div class="card-cover">${icon}</div>`;
    const analysisBadge = hasText(item.myAnalysis)
      ? `<span class="tag tag-analysis">همراه با تحلیل من</span>` : '';
    return `<article class="card" data-id="${esc(item.id)}" data-section="${section}">${cover}<div class="card-body"><div class="card-meta">${tagHTML(item.tags, 3)}${analysisBadge}<span class="card-date">${esc(item.date || '')}</span></div><h3>${esc(item.title)}</h3><p>${esc(item.excerpt || '')}</p><a class="card-link" href="post.html?s=${section}&id=${encodeURIComponent(item.id)}">ادامه مطلب ←</a></div></article>`;
  }
  function resultCardHTML(item) {
    const section = item._s || 'news';
    const type = item._typeLabel || 'مطلب';
    const ex = (item.excerpt || '').trim();
    const short = ex.length > 120 ? ex.slice(0, 120) + '…' : ex;
    return `<a class="search-result-card" href="post.html?s=${section}&id=${encodeURIComponent(item.id)}"><span class="search-result-type">${esc(type)}</span><strong class="search-result-title">${esc(item.title)}</strong>${short ? `<span class="search-result-excerpt">${esc(short)}</span>` : ''}<span class="search-result-meta">${tagHTML(item.tags, 3)}<span class="card-date">${esc(item.date || '')}</span></span></a>`;
  }
  function initCarousel(trackId) {
    const track = document.getElementById(trackId);
    if (!track) return;
    const section = track.closest('.carousel');
    if (!section) return;
    const head = track.closest('.slide-inner')?.querySelector('.section-head');
    const prevBtn = head?.querySelector('[data-dir="prev"]');
    const nextBtn = head?.querySelector('[data-dir="next"]');
    const dotsBox = section.querySelector('.carousel-dots');
    function cardWidth() {
      const card = track.querySelector('.card');
      if (!card) return 300;
      return card.offsetWidth + (parseFloat(getComputedStyle(track).gap) || 16);
    }
    function updateDots() {
      if (!dotsBox) return;
      const n = track.querySelectorAll('.card').length;
      if (n <= 1) { dotsBox.innerHTML = ''; return; }
      const idx = Math.round(track.scrollLeft / cardWidth());
      dotsBox.innerHTML = Array.from({ length: n }, (_, i) =>
        `<button type="button" class="${i === idx ? 'active' : ''}" data-i="${i}"></button>`
      ).join('');
      dotsBox.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => track.scrollTo({ left: Number(btn.dataset.i) * cardWidth(), behavior: 'smooth' }));
      });
    }
    function updateBtns() {
      if (prevBtn) prevBtn.disabled = track.scrollLeft <= 4;
      if (nextBtn) nextBtn.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
      updateDots();
    }
    prevBtn?.addEventListener('click', () => track.scrollBy({ left: -cardWidth(), behavior: 'smooth' }));
    nextBtn?.addEventListener('click', () => track.scrollBy({ left: cardWidth(), behavior: 'smooth' }));
    track.addEventListener('scroll', () => requestAnimationFrame(updateBtns));
    window.addEventListener('resize', updateBtns);
    updateBtns();
  }
  function renderSection(key, items) {
    const track = document.getElementById('track-' + key);
    if (!track) return;
    const list = (items || []).filter(i => i.published !== false);
    if (!list.length) { track.innerHTML = '<div class="empty">مطلبی منتشر نشده است.</div>'; return; }
    track.innerHTML = list.map(i => cardHTML(i, key)).join('');
    fixDriveImages(track);
    bindTagClicks(track);
    initCarousel('track-' + key);
  }
  function ensureSearchChrome() {
    const box = $('.search-box');
    if (!box) return;
    if (!$('#searchResults')) {
      const wrap = document.createElement('div');
      wrap.id = 'searchResults';
      wrap.className = 'search-results';
      wrap.hidden = true;
      box.after(wrap);
    }
    if (!$('#popularTopics')) {
      const pop = document.createElement('div');
      pop.id = 'popularTopics';
      pop.className = 'popular-topics';
      ($('#searchResults') || box).after(pop);
    }
  }
  function renderPopularTopics() {
    const el = $('#popularTopics');
    if (!el || !DATA || typeof buildTagVocabulary !== 'function') return;
    const vocab = buildTagVocabulary([DATA.posts, DATA.articles, DATA.iso17025, DATA.consults]).slice(0, 10);
    if (!vocab.length) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="popular-topics-label">موضوعات پرکاربرد:</div><div class="popular-topics-list">${vocab.map(v => `<button type="button" class="tag tag-click" data-tag="${esc(v.label)}">${esc(v.label)}</button>`).join('')}</div>`;
    bindTagClicks(el);
  }
  function showSearchResults(items, label) {
    ensureSearchChrome();
    const el = $('#searchResults');
    if (!el) return;
    el.hidden = false;
    searchAllItems = items || [];
    searchShown = 0;
    if (!searchAllItems.length) {
      el.innerHTML = `<div class="search-results-panel"><div class="search-results-head"><span>${esc(label)}</span><button type="button" class="search-clear-btn" id="btnClearSearch">✕ پاک کردن</button></div><div class="empty">نتیجه‌ای یافت نشد.</div></div>`;
      $('#btnClearSearch')?.addEventListener('click', clearSearch);
      return;
    }
    renderSearchPage(label);
  }
  function renderSearchPage(label) {
    const el = $('#searchResults');
    if (!el) return;
    searchShown = Math.min(searchShown + SEARCH_PAGE, searchAllItems.length);
    const slice = searchAllItems.slice(0, searchShown);
    const more = searchAllItems.length > searchShown
      ? `<button type="button" class="search-more-btn" id="btnSearchMore">نمایش موارد بیشتر (${searchAllItems.length - searchShown} باقی‌مانده)</button>`
      : '';
    el.innerHTML = `<div class="search-results-panel">
      <div class="search-results-head">
        <span class="search-count">${searchAllItems.length} نتیجه ${esc(label || '')} — نمایش ${searchShown}</span>
        <button type="button" class="search-clear-btn" id="btnClearSearch">✕ پاک کردن</button>
      </div>
      <div class="search-results-list">${slice.map(resultCardHTML).join('')}</div>
      ${more}
    </div>`;
    bindTagClicks(el);
    $('#btnClearSearch')?.addEventListener('click', clearSearch);
    $('#btnSearchMore')?.addEventListener('click', () => renderSearchPage(label));
  }
  function hideSearchResults() {
    const el = $('#searchResults');
    if (el) { el.hidden = true; el.innerHTML = ''; }
    searchAllItems = [];
    searchShown = 0;
  }
  function setUrlState(params) {
    const u = new URL(location.href);
    ['search', 'tag'].forEach(k => u.searchParams.delete(k));
    Object.entries(params || {}).forEach(([k, v]) => { if (v) u.searchParams.set(k, v); });
    history.replaceState(null, '', u.pathname + u.search + u.hash);
  }
  function runSearch(query, opts) {
    if (!DATA) return;
    const q = (query || '').trim();
    const input = $('#searchInput');
    if (input && input.value !== q) input.value = q;
    if (!q) { clearSearch(true); return; }
    showSearchResults(searchCatalog(DATA, q), `برای «${q}»`);
    if (!opts || opts.updateUrl !== false) setUrlState({ search: q });
  }
  function runTagFilter(tag, opts) {
    if (!DATA || !tag) return;
    const input = $('#searchInput');
    if (input) input.value = tag;
    showSearchResults(filterByTag(DATA, tag), `برای موضوع «${tag}»`);
    if (!opts || opts.updateUrl !== false) setUrlState({ tag: tag });
  }
  function clearSearch(skipUrl) {
    const input = $('#searchInput');
    if (input) input.value = '';
    hideSearchResults();
    if (!skipUrl) setUrlState({});
    if (DATA) {
      renderSection('news', DATA.posts);
      renderSection('articles', DATA.articles);
      renderSection('iso17025', DATA.iso17025);
      renderSection('consult', DATA.consults);
    }
  }
  function bindTagClicks(root) {
    (root || document).querySelectorAll('.tag-click').forEach(btn => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const tag = btn.getAttribute('data-tag');
        if (tag) runTagFilter(tag);
      });
    });
  }
  function setupSearch() {
    ensureSearchChrome();
    const input = $('#searchInput');
    if (!input || !DATA) return;
    input.setAttribute('placeholder', 'جستجو در سایت...');
    input.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        const q = input.value.trim();
        if (!q) clearSearch();
        else runSearch(q);
      }, 220);
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') clearSearch(); });
    const params = new URLSearchParams(location.search);
    if (params.get('tag')) runTagFilter(params.get('tag'), { updateUrl: false });
    else if (params.get('search')) runSearch(params.get('search'), { updateUrl: false });
  }
  function setupSideDots() {
    const slides = $$('.slide[id]');
    const dots = $$('.side-dots a');
    if (!slides.length) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const id = entry.target.id;
        dots.forEach(d => d.classList.toggle('active', d.getAttribute('href') === '#' + id));
        $$('.nav-links a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + id));
      });
    }, { threshold: 0.45 });
    slides.forEach(s => observer.observe(s));
  }
  function setupMobileMenu() {
    const toggle = $('#menuToggle');
    const menu = $('#mobileMenu');
    if (!toggle || !menu) return;
    toggle.addEventListener('click', () => menu.classList.toggle('open'));
    menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => menu.classList.remove('open')));
  }
  function fillSiteMeta(site) {
    if (!site) return;
    const brand = $('.brand-name');
    if (brand) brand.textContent = site.title || 'حامد خانه‌پز';
    $$('.site-avatar').forEach(img => { if (site.avatar) img.src = site.avatar; });
    const tagline = $('.site-tagline');
    if (tagline) tagline.textContent = site.tagline || '';
  }
  function sourceBlock(item) {
    const parts = [];
    if (hasText(item.authors)) parts.push(`<span><strong>نویسندگان:</strong> ${esc(item.authors)}</span>`);
    if (hasText(item.source)) parts.push(`<span><strong>منبع:</strong> ${esc(item.source)}</span>`);
    if (hasText(item.date)) parts.push(`<span><strong>تاریخ:</strong> ${esc(item.date)}</span>`);
    if (hasText(item.doi)) {
      const doiUrl = item.doi.startsWith('http') ? item.doi : 'https://doi.org/' + item.doi;
      parts.push(`<span><strong>DOI:</strong> <a href="${esc(doiUrl)}" target="_blank" rel="noopener">${esc(item.doi)}</a></span>`);
    }
    if (hasText(item.sourceUrl)) {
      parts.push(`<span><a class="source-link" href="${esc(item.sourceUrl)}" target="_blank" rel="noopener">مشاهده منبع اصلی ←</a></span>`);
    }
    if (!parts.length) return '';
    return `<div class="post-source">${parts.join('')}</div>`;
  }
  async function init() {
    setupMobileMenu();
    setupSideDots();
    try {
      DATA = await GH.loadAll();
      fillSiteMeta(DATA.site);
      renderSection('news', DATA.posts);
      renderSection('articles', DATA.articles);
      renderSection('iso17025', DATA.iso17025);
      renderSection('consult', DATA.consults);
      renderPopularTopics();
      setupSearch();
    } catch (e) { console.error(e); }
  }
  async function initPost() {
    const params = new URLSearchParams(location.search);
    const section = params.get('s') || 'news';
    const id = params.get('id');
    const map = { news: 'posts', articles: 'articles', iso17025: 'iso17025', consult: 'consults' };
    const key = map[section] || 'posts';
    try {
      const data = await GH.fetchJSON(SITE_CONFIG.files[key]);
      const item = (data || []).find(i => i.id === id);
      const root = $('#postRoot');
      if (!item || !root) {
        if (root) root.innerHTML = '<div class="empty">مطلب یافت نشد.</div>';
        return;
      }
      const tags = tagHTML(item.tags, 12);
      let media = '';
      if (item.cover) media += `<div class="post-media"><img src="${esc(normalizeImageUrl(item.cover))}" alt="${esc(item.title || '')}" referrerpolicy="no-referrer" loading="lazy"></div>`;
      if (item.video) {
        if (item.video.includes('youtube') || item.video.includes('youtu.be')) {
          const vid = item.video.match(/(?:v=|youtu\.be\/)([\w-]+)/)?.[1];
          if (vid) media += `<div class="post-media"><iframe width="100%" height="400" src="https://www.youtube.com/embed/${vid}" frameborder="0" allowfullscreen></iframe></div>`;
        } else media += `<div class="post-media"><video src="${esc(item.video)}" controls></video></div>`;
      }
      let analysisHtml = '';
      if (hasText(item.myAnalysis)) {
        analysisHtml = `<section class="my-analysis"><h2>تحلیل من</h2><p class="my-analysis-sub">برداشت فنی و دیدگاه شخصی</p><div class="my-analysis-body">${normalizeHtmlImages(item.myAnalysis)}</div></section>`;
      }
      let practicalHtml = '';
      if (hasText(item.practicalApplication)) {
        practicalHtml = `<section class="practical-app"><h2>کاربرد در آزمایشگاه / صنعت</h2><div class="practical-app-body">${normalizeHtmlImages(item.practicalApplication)}</div></section>`;
      }
      const excerptBlock = hasText(item.excerpt) ? `<p class="post-excerpt">${esc(item.excerpt)}</p>` : '';
      root.innerHTML = `<a class="back" href="index.html">→ بازگشت</a><h1>${esc(item.title)}</h1><div class="meta">${tags}<span>${esc(item.date || '')}</span></div>${sourceBlock(item)}${media}${excerptBlock}<div class="post-content">${normalizeHtmlImages(item.content || '')}</div>${analysisHtml}${practicalHtml}`;
      document.title = (item.title || '') + ' | حامد خانه‌پز';
      fixDriveImages(root);
      root.querySelectorAll('.tag-click').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const tag = btn.getAttribute('data-tag');
          if (tag) location.href = 'index.html?tag=' + encodeURIComponent(tag);
        });
      });
      root.querySelectorAll('.content-figure img, .post-media img').forEach(img => {
        img.style.cursor = 'zoom-in';
        img.addEventListener('click', () => window.open(img.src, '_blank'));
      });
    } catch (e) {
      const root = $('#postRoot');
      if (root) root.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    }
  }
  if (document.body.dataset.page === 'post') initPost();
  else init();
})();
