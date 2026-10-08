/**
 * لایه دسترسی به داده — خواندن از JSON استاتیک + نوشتن از طریق GitHub Contents API
 */
const GH = {
  base: 'https://api.github.com',

  getToken() {
    return localStorage.getItem(SITE_CONFIG.tokenKey) || '';
  },

  setToken(t) {
    if (t) localStorage.setItem(SITE_CONFIG.tokenKey, t);
    else localStorage.removeItem(SITE_CONFIG.tokenKey);
  },

  headers(auth = false) {
    const h = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (auth && this.getToken()) h.Authorization = `Bearer ${this.getToken()}`;
    return h;
  },

  async fetchJSON(path) {
    try {
      const r = await fetch('/' + path + '?t=' + Date.now());
      if (r.ok) return await r.json();
    } catch (_) {}
    const r2 = await fetch(path + '?t=' + Date.now());
    if (!r2.ok) throw new Error('خواندن ' + path + ' ناموفق بود');
    return r2.json();
  },

  async getFile(path) {
    const url = `${this.base}/repos/${SITE_CONFIG.owner}/${SITE_CONFIG.repo}/contents/${path}?ref=${SITE_CONFIG.branch}`;
    const r = await fetch(url, { headers: this.headers(true) });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e.message || 'خطا در دریافت فایل از گیت‌هاب');
    }
    return r.json();
  },

  async putFile(path, contentObj, message, sha) {
    const body = {
      message: message || `update ${path}`,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(contentObj, null, 2)))),
      branch: SITE_CONFIG.branch
    };
    if (sha) body.sha = sha;
    const url = `${this.base}/repos/${SITE_CONFIG.owner}/${SITE_CONFIG.repo}/contents/${path}`;
    const r = await fetch(url, {
      method: 'PUT',
      headers: { ...this.headers(true), 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e.message || 'ذخیره در گیت‌هاب ناموفق بود');
    }
    return r.json();
  },

  async verifyToken() {
    const r = await fetch(`${this.base}/user`, { headers: this.headers(true) });
    if (!r.ok) return null;
    return r.json();
  },

  async loadAll() {
    const [site, posts, articles, iso17025, consults] = await Promise.all([
      this.fetchJSON(SITE_CONFIG.files.site),
      this.fetchJSON(SITE_CONFIG.files.posts),
      this.fetchJSON(SITE_CONFIG.files.articles),
      this.fetchJSON(SITE_CONFIG.files.iso17025),
      this.fetchJSON(SITE_CONFIG.files.consults)
    ]);
    return { site, posts, articles, iso17025, consults };
  },

  async saveCollection(fileKey, data, msg) {
    const path = SITE_CONFIG.files[fileKey];
    if (!path) throw new Error('کلید فایل نامعتبر');
    const file = await this.getFile(path);
    return this.putFile(path, data, msg || `به‌روزرسانی ${path}`, file.sha);
  }
};

function extractDriveFileId(url) {
  if (!url) return null;
  const s = String(url).trim();
  let m = s.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (m) return m[1];
  m = s.match(/drive\.google\.com\/open\?(?:[^#]*&)?id=([a-zA-Z0-9_-]+)/i);
  if (m) return m[1];
  m = s.match(/(?:drive|docs)\.google\.com\/uc\?(?:[^#]*&)?id=([a-zA-Z0-9_-]+)/i);
  if (m) return m[1];
  m = s.match(/drive\.google\.com\/thumbnail\?(?:[^#]*&)?id=([a-zA-Z0-9_-]+)/i);
  if (m) return m[1];
  m = s.match(/drive\.usercontent\.google\.com\/(?:download|uc)\?(?:[^#]*&)?id=([a-zA-Z0-9_-]+)/i);
  if (m) return m[1];
  m = s.match(/lh[0-9]\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/i);
  if (m) return m[1];
  return null;
}

function normalizeImageUrl(url) {
  if (url == null) return '';
  const s = String(url).trim();
  if (!s) return '';
  const id = extractDriveFileId(s);
  if (id) return 'https://lh3.googleusercontent.com/d/' + id;
  return s;
}

function normalizeHtmlImages(html) {
  if (!html || typeof html !== 'string') return html || '';
  return html.replace(/<img\b([^>]*)>/gi, function (full, attrs) {
    const srcMatch = attrs.match(/\bsrc\s*=\s*(["'])([^"']*)\1/i);
    if (!srcMatch) return full;
    const quote = srcMatch[1];
    const rawSrc = srcMatch[2];
    const newSrc = normalizeImageUrl(rawSrc);
    let next = attrs.replace(/\bsrc\s*=\s*["'][^"']*["']/i, 'src=' + quote + newSrc + quote);
    if (!/\breferrerpolicy\s*=/i.test(next)) next += ' referrerpolicy="no-referrer"';
    if (!/\bloading\s*=/i.test(next)) next += ' loading="lazy"';
    return '<img' + next + '>';
  });
}

function normalizeText(s) {
  if (s == null) return '';
  let t = String(s);
  t = t.replace(/<[^>]+>/g, ' ');
  t = t.replace(/\u064A/g, '\u06CC').replace(/\u0643/g, '\u06A9');
  t = t.replace(/[\u200C\u200D\u00A0\u200B\t\r\n]+/g, ' ');
  t = t.replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0));
  t = t.replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660));
  t = t.replace(/[\/\\|_+\-=.,;:!?()\[\]{}«»"'\u060C\u061B]/g, ' ');
  t = t.replace(/\s+/g, ' ').trim().toLowerCase();
  return t;
}

function stripHtml(s) {
  if (s == null) return '';
  return String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildTagVocabulary(collections) {
  const map = new Map();
  const lists = Array.isArray(collections) ? collections : Object.values(collections || {});
  lists.forEach(list => {
    (list || []).forEach(item => {
      let tags = item && item.tags;
      if (!tags) return;
      if (typeof tags === 'string') tags = tags.split(/[،,]/);
      if (!Array.isArray(tags)) return;
      tags.forEach(raw => {
        const label = String(raw || '').trim();
        if (!label) return;
        const key = normalizeText(label);
        if (!key) return;
        const prev = map.get(key);
        if (prev) prev.count += 1;
        else map.set(key, { label, count: 1 });
      });
    });
  });
  return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fa'));
}

const SEARCH_WEIGHTS = {
  title: 5, tags: 4, excerpt: 3, myAnalysis: 2,
  practicalApplication: 2, content: 1, authors: 1, source: 1
};

function fieldText(item, field) {
  if (!item) return '';
  if (field === 'tags') {
    const t = item.tags;
    if (Array.isArray(t)) return t.join(' ');
    return t ? String(t) : '';
  }
  const v = item[field];
  if (v == null) return '';
  if (field === 'content' || field === 'myAnalysis' || field === 'practicalApplication') return stripHtml(v);
  return String(v);
}

function scoreItemAgainstQuery(item, queryRaw) {
  const q = normalizeText(queryRaw);
  if (!q) return 0;
  const terms = q.split(' ').filter(Boolean);
  let score = 0;
  const haystacks = {};
  for (const [field, w] of Object.entries(SEARCH_WEIGHTS)) {
    haystacks[field] = normalizeText(fieldText(item, field));
  }
  for (const field of ['title', 'tags', 'excerpt']) {
    if (haystacks[field].includes(q)) score += SEARCH_WEIGHTS[field] * 2;
  }
  terms.forEach(term => {
    for (const [field, w] of Object.entries(SEARCH_WEIGHTS)) {
      if (haystacks[field].includes(term)) score += w;
    }
  });
  return score;
}

function scoreItemAgainstTag(item, tagRaw) {
  const want = normalizeText(tagRaw);
  if (!want) return 0;
  let tags = item && item.tags;
  if (!tags) return 0;
  if (typeof tags === 'string') tags = tags.split(/[،,]/);
  if (!Array.isArray(tags)) return 0;
  for (const t of tags) {
    if (normalizeText(t) === want) return 100;
  }
  if (normalizeText(item.title || '').includes(want)) return 20;
  return 0;
}

function flattenPublished(data) {
  const out = [];
  const map = [
    ['news', data.posts, 'خبر'],
    ['articles', data.articles, 'مقاله علمی'],
    ['iso17025', data.iso17025, 'ISO 17025'],
    ['consult', data.consults, 'مشاوره']
  ];
  map.forEach(([section, list, typeLabel]) => {
    (list || []).forEach(item => {
      if (item && item.published === false) return;
      out.push({ ...item, _s: section, _typeLabel: typeLabel });
    });
  });
  return out;
}

function parseDateKey(d) {
  if (!d) return 0;
  const s = String(d).replace(/[^0-9]/g, '');
  return parseInt(s, 10) || 0;
}

function searchCatalog(data, query) {
  const all = flattenPublished(data);
  const scored = all.map(item => ({
    item,
    score: scoreItemAgainstQuery(item, query)
  })).filter(x => x.score > 0);
  scored.sort((a, b) => b.score - a.score || parseDateKey(b.item.date) - parseDateKey(a.item.date));
  return scored.map(x => x.item);
}

function filterByTag(data, tag) {
  const all = flattenPublished(data);
  const scored = all.map(item => ({
    item,
    score: scoreItemAgainstTag(item, tag)
  })).filter(x => x.score > 0);
  scored.sort((a, b) => b.score - a.score || parseDateKey(b.item.date) - parseDateKey(a.item.date));
  return scored.map(x => x.item);
}

function findEquivalentTag(vocab, candidate) {
  const key = normalizeText(candidate);
  if (!key) return null;
  return vocab.find(v => normalizeText(v.label) === key) || null;
}
