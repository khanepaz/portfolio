(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  let DATA = null;

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function hasText(v) {
    return !!(v && String(v).trim());
  }

  function cardHTML(item, section) {
    const icon = { news: '📰', articles: '📚', iso17025: '📋', consult: '💼' }[section] || '📄';
    const cover = item.cover
      ? `<div class="card-cover"><img src="${esc(item.cover)}" alt=""></div>`
      : `<div class="card-cover">${icon}</div>`;
    const tags = (item.tags || []).slice(0, 3).map(t => `<span class="tag">${esc(t)}</span>`).join('');
    const analysisBadge = hasText(item.myAnalysis)
      ? `<span class="tag tag-analysis">همراه با تحلیل من</span>`
      : '';
    return `
      <article class="card" data-id="${esc(item.id)}" data-section="${section}">
        ${cover}
        <div class="card-body">
          <div class="card-meta">${tags}${analysisBadge}<span class="card-date">${esc(item.date || '')}</span></div>
          <h3>${esc(item.title)}</h3>
          <p>${esc(item.excerpt || '')}</p>
          <a class="card-link" href="post.html?s=${section}&id=${encodeURIComponent(item.id)}">ادامه مطلب ←</a>
        </div>
      </article>`;
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
      const style = getComputedStyle(track);
      const gap = parseFloat(style.gap) || 16;
      return card.offsetWidth + gap;
    }

    function updateDots() {
      if (!dotsBox) return;
      const cards = track.querySelectorAll('.card');
      const n = cards.length;
      if (n <= 1) { dotsBox.innerHTML = ''; return; }
      const idx = Math.round(track.scrollLeft / cardWidth());
      dotsBox.innerHTML = Array.from({ length: n }, (_, i) =>
        `<button type="button" class="${i === idx ? 'active' : ''}" data-i="${i}" aria-label="اسلاید ${i + 1}"></button>`
      ).join('');
      dotsBox.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          track.scrollTo({ left: Number(btn.dataset.i) * cardWidth(), behavior: 'smooth' });
        });
      });
    }

    function updateBtns() {
      if (prevBtn) prevBtn.disabled = track.scrollLeft <= 4;
      if (nextBtn) nextBtn.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
      updateDots();
    }

    prevBtn?.addEventListener('click', () => {
      track.scrollBy({ left: -cardWidth(), behavior: 'smooth' });
    });
    nextBtn?.addEventListener('click', () => {
      track.scrollBy({ left: cardWidth(), behavior: 'smooth' });
    });
    track.addEventListener('scroll', () => requestAnimationFrame(updateBtns));
    window.addEventListener('resize', updateBtns);
    updateBtns();
  }

  function renderSection(key, items) {
    const track = document.getElementById('track-' + key);
    if (!track) return;
    const list = (items || []).filter(i => i.published !== false);
    if (!list.length) {
      track.innerHTML = '<div class="empty">مطلبی منتشر نشده است.</div>';
      return;
    }
    track.innerHTML = list.map(i => cardHTML(i, key)).join('');
    initCarousel('track-' + key);
  }

  function setupSearch() {
    const input = $('#searchInput');
    if (!input || !DATA) return;
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      if (!q) {
        renderSection('news', DATA.posts);
        renderSection('articles', DATA.articles);
        renderSection('iso17025', DATA.iso17025);
        renderSection('consult', DATA.consults);
        return;
      }
      const all = [
        ...DATA.posts.map(i => ({ ...i, _s: 'news' })),
        ...DATA.articles.map(i => ({ ...i, _s: 'articles' })),
        ...DATA.iso17025.map(i => ({ ...i, _s: 'iso17025' })),
        ...DATA.consults.map(i => ({ ...i, _s: 'consult' }))
      ];
      const filtered = all.filter(i =>
        (i.title || '').toLowerCase().includes(q) ||
        (i.excerpt || '').toLowerCase().includes(q) ||
        (i.tags || []).some(t => t.toLowerCase().includes(q))
      );
      const track = $('#track-news');
      if (track) {
        track.innerHTML = filtered.length
          ? filtered.map(i => cardHTML(i, i._s)).join('')
          : '<div class="empty">نتیجه‌ای یافت نشد.</div>';
        initCarousel('track-news');
      }
      document.getElementById('news')?.scrollIntoView({ behavior: 'smooth' });
    });
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
      setupSearch();
    } catch (e) {
      console.error(e);
    }
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
      const tags = (item.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join(' ');
      let media = '';
      if (item.cover) media += `<div class="post-media"><img src="${esc(item.cover)}" alt="${esc(item.title || '')}"></div>`;
      if (item.video) {
        if (item.video.includes('youtube') || item.video.includes('youtu.be')) {
          const vid = item.video.match(/(?:v=|youtu\.be\/)([\w-]+)/)?.[1];
          if (vid) media += `<div class="post-media"><iframe width="100%" height="400" src="https://www.youtube.com/embed/${vid}" frameborder="0" allowfullscreen></iframe></div>`;
        } else {
          media += `<div class="post-media"><video src="${esc(item.video)}" controls></video></div>`;
        }
      }

      let analysisHtml = '';
      if (hasText(item.myAnalysis)) {
        analysisHtml = `
          <section class="my-analysis">
            <h2>تحلیل من</h2>
            <p class="my-analysis-sub">برداشت فنی و دیدگاه شخصی</p>
            <div class="my-analysis-body">${item.myAnalysis}</div>
          </section>`;
      }

      let practicalHtml = '';
      if (hasText(item.practicalApplication)) {
        practicalHtml = `
          <section class="practical-app">
            <h2>کاربرد در آزمایشگاه / صنعت</h2>
            <div class="practical-app-body">${item.practicalApplication}</div>
          </section>`;
      }

      const excerptBlock = hasText(item.excerpt)
        ? `<p class="post-excerpt">${esc(item.excerpt)}</p>`
        : '';

      root.innerHTML = `
        <a class="back" href="index.html">→ بازگشت</a>
        <h1>${esc(item.title)}</h1>
        <div class="meta">${tags}<span>${esc(item.date || '')}</span></div>
        ${sourceBlock(item)}
        ${media}
        ${excerptBlock}
        <div class="post-content">${item.content || ''}</div>
        ${analysisHtml}
        ${practicalHtml}`;
      document.title = (item.title || '') + ' | حامد خانه‌پز';

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
