(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const COLLECTIONS = {
    posts: { label: 'اخبار', file: 'posts' },
    articles: { label: 'مقالات علمی', file: 'articles' },
    iso17025: { label: 'ISO 17025', file: 'iso17025' },
    consults: { label: 'مشاوره', file: 'consults' }
  };
  let state = { user: null, data: {}, current: 'posts', editId: null, selectedTags: [] };
  let tagVocab = [];

  function toast(msg, ok = true) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show ' + (ok ? 'ok' : 'err');
    setTimeout(() => t.classList.remove('show'), 3500);
  }
  function uid(prefix) {
    return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function showApp() {
    $('#loginScreen').style.display = 'none';
    $('#appScreen').style.display = 'block';
    $('#adminUser').textContent = state.user?.login || 'admin';
  }
  function showLogin() {
    $('#loginScreen').style.display = 'block';
    $('#appScreen').style.display = 'none';
  }
  async function tryLogin(token) {
    if (token) GH.setToken(token);
    const user = await GH.verifyToken();
    if (!user) { GH.setToken(''); throw new Error('توکن نامعتبر است'); }
    if (user.login !== SITE_CONFIG.owner) {
      GH.setToken('');
      throw new Error('فقط مالک ریپازیتوری (' + SITE_CONFIG.owner + ') مجاز است');
    }
    state.user = user;
    showApp();
    await loadData();
  }
  async function loadData() {
    try {
      const all = await GH.loadAll();
      state.data = {
        posts: all.posts || [],
        articles: all.articles || [],
        iso17025: all.iso17025 || [],
        consults: all.consults || []
      };
      rebuildVocab();
      renderTable();
    } catch (e) { toast(e.message, false); }
  }
  function rebuildVocab() {
    tagVocab = typeof buildTagVocabulary === 'function'
      ? buildTagVocabulary([state.data.posts, state.data.articles, state.data.iso17025, state.data.consults])
      : [];
  }
  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }
  function renderTable() {
    const items = state.data[state.current] || [];
    const tbody = $('#tableBody');
    if (!items.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">مطلبی نیست — یکی اضافه کنید</td></tr>';
      return;
    }
    tbody.innerHTML = items.map(item => {
      const hasAnalysis = !!(item.myAnalysis && String(item.myAnalysis).trim());
      return `<tr><td><span class="status-dot ${item.published !== false ? 'on' : 'off'}"></span>${esc(item.title)}${hasAnalysis ? '<span class="badge-analysis">تحلیل من</span>' : ''}</td><td>${esc(item.date || '—')}</td><td>${(item.tags || []).slice(0, 2).map(t => esc(t)).join('، ') || '—'}</td><td>${item.published !== false ? 'منتشر' : 'پیش‌نویس'}</td><td class="actions"><button class="btn btn-ghost btn-sm" data-edit="${esc(item.id)}">ویرایش</button><button class="btn btn-danger btn-sm" data-del="${esc(item.id)}">حذف</button></td></tr>`;
    }).join('');
    tbody.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => openEditor(btn.dataset.edit)));
    tbody.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', () => removeItem(btn.dataset.del)));
  }
  function normalizeTagsList(tags) {
    if (!tags) return [];
    if (typeof tags === 'string') return tags.split(/[،,]/).map(t => t.trim()).filter(Boolean);
    if (Array.isArray(tags)) return tags.map(t => String(t).trim()).filter(Boolean);
    return [];
  }
  function isTagSelected(label) {
    const k = normalizeText(label);
    return state.selectedTags.some(t => normalizeText(t) === k);
  }
  function renderTagChips() {
    const box = $('#tagChips');
    if (!box) return;
    box.innerHTML = state.selectedTags.map((t, i) =>
      `<span class="tag-chip">${esc(t)}<button type="button" data-rm="${i}" aria-label="حذف">×</button></span>`
    ).join('');
    box.querySelectorAll('[data-rm]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.selectedTags.splice(Number(btn.dataset.rm), 1);
        renderTagChips();
      });
    });
    const h = $('#f_tags');
    if (h) h.value = state.selectedTags.join('، ');
  }
  function addTag(label) {
    const clean = String(label || '').trim();
    if (!clean) return;
    if (isTagSelected(clean)) { toast('این موضوع قبلاً اضافه شده', false); return; }
    const eq = typeof findEquivalentTag === 'function' ? findEquivalentTag(tagVocab, clean) : null;
    if (eq) {
      if (!isTagSelected(eq.label)) state.selectedTags.push(eq.label);
      else toast('این موضوع قبلاً اضافه شده', false);
    } else {
      state.selectedTags.push(clean);
    }
    renderTagChips();
    const input = $('#f_tags_input');
    if (input) input.value = '';
    hideSuggest();
  }
  function hideSuggest() {
    const s = $('#tagSuggest');
    if (s) { s.hidden = true; s.innerHTML = ''; }
  }
  function showSuggest(query) {
    const box = $('#tagSuggest');
    if (!box) return;
    const q = normalizeText(query);
    const selectedKeys = new Set(state.selectedTags.map(t => normalizeText(t)));
    let matches = tagVocab
      .filter(v => !selectedKeys.has(normalizeText(v.label)))
      .filter(v => !q || normalizeText(v.label).includes(q))
      .slice(0, 8);
    const exact = q ? findEquivalentTag(tagVocab, query) : null;
    let html = '';
    if (q && exact && normalizeText(query.trim()) !== normalizeText(exact.label)) {
      html += `<div class="tag-suggest-warn">تگ مشابهی از قبل وجود دارد: <strong>${esc(exact.label)}</strong></div>`;
      html += `<button type="button" class="tag-suggest-item" data-tag="${esc(exact.label)}">استفاده از تگ موجود</button>`;
    }
    if (matches.length) {
      html += matches.map(v =>
        `<button type="button" class="tag-suggest-item" data-tag="${esc(v.label)}">${esc(v.label)} <span class="tag-freq">${v.count}</span></button>`
      ).join('');
    }
    if (q && !exact) {
      html += `<button type="button" class="tag-suggest-item tag-suggest-new" data-new="${esc(query.trim())}">+ افزودن «${esc(query.trim())}»</button>`;
    }
    if (!html) { hideSuggest(); return; }
    box.innerHTML = html;
    box.hidden = false;
    box.querySelectorAll('[data-tag]').forEach(btn => btn.addEventListener('click', () => addTag(btn.dataset.tag)));
    box.querySelectorAll('[data-new]').forEach(btn => btn.addEventListener('click', () => addTag(btn.dataset.new)));
  }
  function setupTagInput() {
    const input = $('#f_tags_input');
    if (!input || input.dataset.bound) return;
    input.dataset.bound = '1';
    input.addEventListener('input', () => showSuggest(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const v = input.value.trim();
        if (!v) return;
        const eq = findEquivalentTag(tagVocab, v);
        addTag(eq ? eq.label : v);
      }
      if (e.key === 'Escape') hideSuggest();
    });
    input.addEventListener('blur', () => setTimeout(hideSuggest, 180));
  }
  function openEditor(id) {
    state.editId = id || null;
    const item = id ? (state.data[state.current] || []).find(i => i.id === id) : null;
    $('#modalTitle').textContent = item ? 'ویرایش مطلب' : 'مطلب جدید';
    $('#f_title').value = item?.title || '';
    $('#f_excerpt').value = item?.excerpt || '';
    $('#f_content').value = item?.content || '';
    $('#f_cover').value = item?.cover || '';
    $('#f_video').value = item?.video || '';
    state.selectedTags = normalizeTagsList(item?.tags);
    renderTagChips();
    if ($('#f_tags_input')) $('#f_tags_input').value = '';
    hideSuggest();
    setupTagInput();
    $('#f_date').value = item?.date || new Date().toLocaleDateString('fa-IR');
    $('#f_published').checked = item ? item.published !== false : true;
    $('#f_source').value = item?.source || '';
    $('#f_sourceUrl').value = item?.sourceUrl || '';
    $('#f_authors').value = item?.authors || '';
    $('#f_doi').value = item?.doi || '';
    $('#f_myAnalysis').value = item?.myAnalysis || '';
    $('#f_practical').value = item?.practicalApplication || '';
    if ($('#img_url')) $('#img_url').value = '';
    if ($('#img_alt')) $('#img_alt').value = '';
    if ($('#img_caption')) $('#img_caption').value = '';
    $('#modal').classList.add('show');
  }
  function closeModal() {
    $('#modal').classList.remove('show');
    state.editId = null;
    hideSuggest();
  }
  function buildFigureHtml(url, alt, caption) {
    const a = esc(alt || '');
    const u = esc(normalizeImageUrl(url));
    const cap = (caption || '').trim();
    let html = `\n<figure class="content-figure">\n  <img src="${u}" alt="${a}" loading="lazy" referrerpolicy="no-referrer">\n`;
    if (cap) html += `  <figcaption>${esc(cap)}</figcaption>\n`;
    html += `</figure>\n`;
    return html;
  }
  function insertAtCursor(textarea, text) {
    if (!textarea) return;
    const start = textarea.selectionStart || textarea.value.length;
    const end = textarea.selectionEnd || start;
    textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
    const pos = start + text.length;
    textarea.focus();
    textarea.setSelectionRange(pos, pos);
  }
  function insertImage(targetId) {
    const url = ($('#img_url')?.value || '').trim();
    if (!url) return toast('آدرس تصویر را وارد کنید', false);
    insertAtCursor($(targetId), buildFigureHtml(url, ($('#img_alt')?.value || '').trim(), ($('#img_caption')?.value || '').trim()));
    toast('تصویر درج شد');
  }
  async function saveItem() {
    const title = $('#f_title').value.trim();
    if (!title) return toast('عنوان الزامی است', false);
    const seen = new Set();
    const tags = [];
    state.selectedTags.forEach(t => {
      const k = normalizeText(t);
      if (!k || seen.has(k)) return;
      seen.add(k);
      const eq = findEquivalentTag(tagVocab, t);
      tags.push(eq ? eq.label : t.trim());
    });
    const existing = state.editId ? (state.data[state.current] || []).find(i => i.id === state.editId) : null;
    const payload = {
      id: state.editId || uid(state.current.slice(0, 3)),
      title,
      slug: (existing && existing.slug) || title.replace(/\s+/g, '-').slice(0, 60),
      excerpt: $('#f_excerpt').value.trim(),
      content: normalizeHtmlImages($('#f_content').value.trim()),
      cover: normalizeImageUrl($('#f_cover').value.trim()),
      video: $('#f_video').value.trim(),
      tags,
      published: $('#f_published').checked,
      date: $('#f_date').value.trim(),
      updated: new Date().toLocaleDateString('fa-IR'),
      source: $('#f_source').value.trim(),
      sourceUrl: $('#f_sourceUrl').value.trim(),
      authors: $('#f_authors').value.trim(),
      doi: $('#f_doi').value.trim(),
      myAnalysis: normalizeHtmlImages($('#f_myAnalysis').value.trim()),
      practicalApplication: $('#f_practical').value.trim()
    };
    if (state.current === 'posts' && existing?.type) payload.type = existing.type;
    else if (state.current === 'posts') payload.type = 'news';
    const list = [...(state.data[state.current] || [])];
    const idx = list.findIndex(i => i.id === payload.id);
    if (idx >= 0) list[idx] = { ...list[idx], ...payload };
    else list.unshift(payload);
    try {
      await GH.saveCollection(COLLECTIONS[state.current].file, list, `admin: ${state.editId ? 'edit' : 'add'} ${payload.id}`);
      state.data[state.current] = list;
      rebuildVocab();
      closeModal();
      renderTable();
      toast('با موفقیت در گیت‌هاب ذخیره شد');
    } catch (e) { toast(e.message, false); }
  }
  async function removeItem(id) {
    if (!confirm('این مطلب حذف شود؟')) return;
    const list = (state.data[state.current] || []).filter(i => i.id !== id);
    try {
      await GH.saveCollection(COLLECTIONS[state.current].file, list, `admin: delete ${id}`);
      state.data[state.current] = list;
      rebuildVocab();
      renderTable();
      toast('حذف شد');
    } catch (e) { toast(e.message, false); }
  }
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.current = tab.dataset.col;
      renderTable();
    });
  });
  $('#btnAdd')?.addEventListener('click', () => openEditor(null));
  $('#btnSave')?.addEventListener('click', saveItem);
  $('#btnCancel')?.addEventListener('click', closeModal);
  $('#btnInsertContent')?.addEventListener('click', () => insertImage('#f_content'));
  $('#btnInsertAnalysis')?.addEventListener('click', () => insertImage('#f_myAnalysis'));
  $('#btnLogout')?.addEventListener('click', () => { GH.setToken(''); state.user = null; showLogin(); });
  $('#loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#loginError');
    err.textContent = '';
    try { await tryLogin($('#tokenInput').value.trim()); }
    catch (ex) { err.textContent = ex.message; }
  });
  (async () => {
    if (GH.getToken()) { try { await tryLogin(); } catch { showLogin(); } }
    else showLogin();
  })();
})();
