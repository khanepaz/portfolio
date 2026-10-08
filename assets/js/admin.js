(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  const COLLECTIONS = {
    posts: { label: 'اخبار', file: 'posts' },
    articles: { label: 'مقالات علمی', file: 'articles' },
    iso17025: { label: 'ISO 17025', file: 'iso17025' },
    consults: { label: 'مشاوره', file: 'consults' }
  };

  let state = { user: null, data: {}, current: 'posts', editId: null };

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
    if (!user) {
      GH.setToken('');
      throw new Error('توکن نامعتبر است');
    }
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
      renderTable();
    } catch (e) {
      toast(e.message, false);
    }
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
      return `
      <tr>
        <td>
          <span class="status-dot ${item.published !== false ? 'on' : 'off'}"></span>
          ${esc(item.title)}
          ${hasAnalysis ? '<span class="badge-analysis">تحلیل من</span>' : ''}
        </td>
        <td>${esc(item.date || '—')}</td>
        <td>${(item.tags || []).slice(0, 2).map(t => esc(t)).join('، ') || '—'}</td>
        <td>${item.published !== false ? 'منتشر' : 'پیش‌نویس'}</td>
        <td class="actions">
          <button class="btn btn-ghost btn-sm" data-edit="${esc(item.id)}">ویرایش</button>
          <button class="btn btn-danger btn-sm" data-del="${esc(item.id)}">حذف</button>
        </td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => openEditor(btn.dataset.edit));
    });
    tbody.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', () => removeItem(btn.dataset.del));
    });
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
    $('#f_tags').value = (item?.tags || []).join('، ');
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
  }

  function buildFigureHtml(url, alt, caption) {
    const a = esc(alt || '');
    const u = esc(normalizeImageUrl(url));
    const cap = (caption || '').trim();
    let html = `\n<figure class="content-figure">\n  <img src="${u}" alt="${a}" loading="lazy">\n`;
    if (cap) html += `  <figcaption>${esc(cap)}</figcaption>\n`;
    html += `</figure>\n`;
    return html;
  }

  function insertAtCursor(textarea, text) {
    if (!textarea) return;
    const start = textarea.selectionStart || textarea.value.length;
    const end = textarea.selectionEnd || start;
    const before = textarea.value.slice(0, start);
    const after = textarea.value.slice(end);
    textarea.value = before + text + after;
    const pos = start + text.length;
    textarea.focus();
    textarea.setSelectionRange(pos, pos);
  }

  function insertImage(targetId) {
    const url = ($('#img_url')?.value || '').trim();
    if (!url) return toast('آدرس تصویر را وارد کنید', false);
    const alt = ($('#img_alt')?.value || '').trim();
    const caption = ($('#img_caption')?.value || '').trim();
    const html = buildFigureHtml(url, alt, caption);
    insertAtCursor($(targetId), html);
    toast('تصویر درج شد');
  }

  async function saveItem() {
    const title = $('#f_title').value.trim();
    if (!title) return toast('عنوان الزامی است', false);

    const tags = $('#f_tags').value.split(/[،,]/).map(t => t.trim()).filter(Boolean);
    const existing = state.editId
      ? (state.data[state.current] || []).find(i => i.id === state.editId)
      : null;

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
      await GH.saveCollection(
        COLLECTIONS[state.current].file,
        list,
        `admin: ${state.editId ? 'edit' : 'add'} ${payload.id}`
      );
      state.data[state.current] = list;
      closeModal();
      renderTable();
      toast('با موفقیت در گیت‌هاب ذخیره شد');
    } catch (e) {
      toast(e.message, false);
    }
  }

  async function removeItem(id) {
    if (!confirm('این مطلب حذف شود؟')) return;
    const list = (state.data[state.current] || []).filter(i => i.id !== id);
    try {
      await GH.saveCollection(COLLECTIONS[state.current].file, list, `admin: delete ${id}`);
      state.data[state.current] = list;
      renderTable();
      toast('حذف شد');
    } catch (e) {
      toast(e.message, false);
    }
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
  $('#btnLogout')?.addEventListener('click', () => {
    GH.setToken('');
    state.user = null;
    showLogin();
  });

  $('#loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = $('#tokenInput').value.trim();
    const err = $('#loginError');
    err.textContent = '';
    try {
      await tryLogin(token);
    } catch (ex) {
      err.textContent = ex.message;
    }
  });

  (async () => {
    if (GH.getToken()) {
      try { await tryLogin(); } catch { showLogin(); }
    } else {
      showLogin();
    }
  })();
})();
