(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  let DATA = null;

  function cardHTML(item, section) {
    const icon = { news: '📰', articles: '📚', iso17025: '📋', consult: '💼' }[section] || '📄';
    const cover = item.cover
      ? `<div class="card-cover"><img src="${esc(item.cover)}" alt=""></div>`
      : `<div class="card-cover">${icon}</div>`;
    const tags = (item.tags || []).slice(0, 3).map(t => `<span class="tag">${esc(t)}</span>`).join('');
    return `
      <article class="card" data-id="${esc(item.id)}" data-section="${section}">
        ${cover}
        <div class="card-body">
          <div class="card-meta">${tags}<span class="card-date">${esc(item.date || '')}</span></div>
          <h3>${esc(item.title)}</h3>
          <p>${esc(item.excerpt || '')}</p>
          <a class="card-link" href="post.html?s=${section}&id=${encodeURIComponent(item.id)}">ادامه مطلب ←</a>
        </div>
      </article>`;
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function renderSection(key, items, limit) {
    const box = $(`#grid-${key}`);
    if (!box) return;
    const list = (items || []).filter(i => i.published !== false);
    const show = limit ? list.slice(0, limit) : list;
    if (!show.length) {
      box.innerHTML = '<div class="empty">مطلبی منتشر نشده است.</div>';
      return;
    }
    box.innerHTML = show.map(i => cardHTML(i, key)).join('');
  }

  function setupSearch() {
    const input = $('#searchInput');
    if (!input || !DATA) return;
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      const all = [
        ...DATA.posts.map(i => ({ ...i, _s: 'news' })),
        ...DATA.articles.map(i => ({ ...i, _s: 'articles' })),
        ...DATA.iso17025.map(i => ({ ...i, _s: 'iso17025' })),
        ...DATA.consults.map(i => ({ ...i, _s: 'consult' }))
      ];
      if (!q) {
        renderSection('news', DATA.posts, 6);
        renderSection('articles', DATA.articles, 6);
        renderSection('iso17025', DATA.iso17025, 6);
        renderSection('consult', DATA.consults, 6);
        return;
      }
      const filtered = all.filter(i =>
        (i.title || '').toLowerCase().includes(q) ||
        (i.excerpt || '').toLowerCase().includes(q) ||
        (i.tags || []).some(t => t.toLowerCase().includes(q))
      );
      const box = $('#grid-news');
      if (box) {
        box.innerHTML = filtered.length
          ? filtered.map(i => cardHTML(i, i._s)).join('')
          : '<div class="empty">نتیجه‌ای یافت نشد.</div>';
      }
    });
  }

  function setupMobileNav() {
    const toggle = $('#menuToggle');
    const sidebar = $('#sidebar');
    const overlay = $('#sidebarOverlay');
    if (!toggle) return;
    const close = () => {
      sidebar?.classList.remove('open');
      overlay?.classList.remove('show');
    };
    toggle.addEventListener('click', () => {
      sidebar?.classList.toggle('open');
      overlay?.classList.toggle('show');
    });
    overlay?.addEventListener('click', close);
    $$('.sidebar-menu a').forEach(a => a.addEventListener('click', close));
  }

  function fillSiteMeta(site) {
    if (!site) return;
    const brand = $('.brand-name');
    if (brand) brand.textContent = site.title || 'حامد خانه‌پز';
    const avatars = $$('.site-avatar');
    avatars.forEach(img => { if (site.avatar) img.src = site.avatar; });
    const tagline = $('.site-tagline');
    if (tagline) tagline.textContent = site.tagline || '';
    const email = $('.link-email');
    if (email && site.email) email.href = 'mailto:' + site.email;
    const li = $('.link-linkedin');
    if (li && site.linkedin) li.href = site.linkedin;
    const wa = $('.link-whatsapp');
    if (wa && site.whatsapp) wa.href = site.whatsapp;
  }

  async function init() {
    try {
      DATA = await GH.loadAll();
      fillSiteMeta(DATA.site);
      renderSection('news', DATA.posts, 6);
      renderSection('articles', DATA.articles, 6);
      renderSection('iso17025', DATA.iso17025, 6);
      renderSection('consult', DATA.consults, 6);
      setupSearch();
    } catch (e) {
      console.error(e);
      const main = $('.main');
      if (main) main.innerHTML = `<div class="empty">خطا در بارگذاری محتوا: ${esc(e.message)}</div>`;
    }
    setupMobileNav();
  }

  async function initPost() {
    const params = new URLSearchParams(location.search);
    const section = params.get('s') || 'news';
    const id = params.get('id');
    const map = {
      news: 'posts',
      articles: 'articles',
      iso17025: 'iso17025',
      consult: 'consults'
    };
    const key = map[section] || 'posts';
    try {
      const data = await GH.fetchJSON(SITE_CONFIG.files[key === 'posts' ? 'posts' : key]);
      const item = (data || []).find(i => i.id === id);
      const root = $('#postRoot');
      if (!item || !root) {
        if (root) root.innerHTML = '<div class="empty">مطلب یافت نشد.</div>';
        return;
      }
      const tags = (item.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join(' ');
      let media = '';
      if (item.cover) media += `<div class="post-media"><img src="${esc(item.cover)}" alt=""></div>`;
      if (item.video) {
        if (item.video.includes('youtube') || item.video.includes('youtu.be')) {
          const vid = item.video.match(/(?:v=|youtu\.be\/)([\w-]+)/)?.[1];
          if (vid) media += `<div class="post-media"><iframe width="100%" height="400" src="https://www.youtube.com/embed/${vid}" frameborder="0" allowfullscreen></iframe></div>`;
        } else {
          media += `<div class="post-media"><video src="${esc(item.video)}" controls></video></div>`;
        }
      }
      root.innerHTML = `
        <a class="back" href="index.html">→ بازگشت</a>
        <h1>${esc(item.title)}</h1>
        <div class="meta">${tags}<span>${esc(item.date || '')}</span>${item.source ? `<span>· ${esc(item.source)}</span>` : ''}</div>
        ${media}
        <div class="post-content">${item.content || ''}</div>`;
      document.title = (item.title || '') + ' | حامد خانه‌پز';
    } catch (e) {
      const root = $('#postRoot');
      if (root) root.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    }
  }

  if (document.body.dataset.page === 'post') initPost();
  else init();
})();
