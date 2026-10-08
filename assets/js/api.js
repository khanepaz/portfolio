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

/**
 * نرمال‌سازی URL تصویر — تبدیل لینک مشاهده Google Drive به لینک مستقیم
 * فقط URLهای شناخته‌شده Drive را تغییر می‌دهد؛ بقیه بدون تغییر برمی‌گردند.
 */
function normalizeImageUrl(url) {
  if (url == null) return '';
  const s = String(url).trim();
  if (!s) return '';

  let m = s.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (m) return 'https://drive.google.com/uc?export=view&id=' + m[1];

  m = s.match(/drive\.google\.com\/open\?(?:[^#]*&)?id=([a-zA-Z0-9_-]+)/i);
  if (m) return 'https://drive.google.com/uc?export=view&id=' + m[1];

  m = s.match(/(?:drive|docs)\.google\.com\/uc\?(?:.*&)?id=([a-zA-Z0-9_-]+)/i);
  if (m) {
    if (/export=view/i.test(s)) return s;
    return 'https://drive.google.com/uc?export=view&id=' + m[1];
  }

  m = s.match(/drive\.google\.com\/thumbnail\?[^#]*[?&]?id=([a-zA-Z0-9_-]+)/i);
  if (m) return 'https://drive.google.com/uc?export=view&id=' + m[1];

  return s;
}

/** جایگزینی src تصاویر Google Drive داخل HTML */
function normalizeHtmlImages(html) {
  if (!html || typeof html !== 'string') return html || '';
  return html.replace(
    /(<img\b[^>]*?\bsrc\s*=\s*)(["'])([^"']+)\2/gi,
    function (_, prefix, quote, src) {
      return prefix + quote + normalizeImageUrl(src) + quote;
    }
  );
}
