'use strict';

const U = {
  el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined) e.setAttribute(k, v);
    });
    (Array.isArray(children) ? children : [children]).forEach(c => {
      if (c == null) return;
      if (typeof c === 'string') e.appendChild(document.createTextNode(c));
      else e.appendChild(c);
    });
    return e;
  },
  uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); },
  now() { return Date.now(); },
  fmtDate(ts) { if (!ts) return ''; const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; },
  fmtTime(ts) { if (!ts) return ''; const d = new Date(ts); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; },
  fmtDateTime(ts) { return this.fmtDate(ts) + ' ' + this.fmtTime(ts); },
  todayStr() { return this.fmtDate(Date.now()); },
  fmtDuration(ms) { const s = Math.floor(ms/1000), h = Math.floor(s/3600), m = Math.floor((s%3600)/60); return (h ? h+'h ' : '') + m + 'm'; },
  escape(s) { if (!s) return ''; return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); },
  download(filename, content, type='application/json') {
    const blob = new Blob([typeof content==='string'?content:JSON.stringify(content,null,2)], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  readFile() {
    return new Promise(res => {
      const i = document.createElement('input'); i.type='file';
      i.onchange = () => res(i.files[0]); i.click();
    });
  }
};

const DB_NAME = 'personal_workbench';
const DB_VERSION = 4;
const STORES = ['todos','media','develop','consult','fitness','diet','game','notes','recycleBin','config','aiConvs','aiMsgs','focus'];
const STORE_LABELS = { todos:'今日计划', media:'自媒体', develop:'开发工作', consult:'咨询工作', fitness:'健身计划', diet:'饮食计划', game:'游戏娱乐', notes:'快速备忘', aiConvs:'AI 对话' };

let DB = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      STORES.forEach(name => { if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' }); });
    };
    req.onsuccess = () => { DB = req.result; resolve(DB); };
    req.onerror = () => reject(req.error);
  });
}

async function resetDBAndRetry() {
  return new Promise((resolve, reject) => {
    const del = indexedDB.deleteDatabase(DB_NAME);
    del.onsuccess = async () => {
      try {
        const db = await openDB();
        resolve(db);
      } catch (e) { reject(e); }
    };
    del.onerror = () => reject(new Error('删除旧 DB 失败'));
  });
}

function tx(storeName, mode = 'readonly') {
  return new Promise((resolve, reject) => {
    if (!DB) return reject(new Error('DB 未初始化'));
    const t = DB.transaction(storeName, mode);
    const s = t.objectStore(storeName);
    t.oncomplete = () => resolve(s);
    t.onerror = () => reject(t.error);
    resolve(s);
  });
}

async function DBgetAll(storeName) {
  if (!DB) return [];
  try {
    const s = DB.transaction(storeName).objectStore(storeName);
    return new Promise(res => {
      const r = s.getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => res([]);
    });
  } catch (e) { return []; }
}
async function DBget(storeName, id) {
  if (!DB) return null;
  try {
    const s = DB.transaction(storeName).objectStore(storeName);
    return new Promise(res => {
      const r = s.get(id);
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    });
  } catch (e) { return null; }
}
async function DBput(storeName, item) {
  if (!DB) throw new Error('DB 未初始化');
  item.updatedAt = U.now();
  return new Promise((res, rej) => {
    const s = DB.transaction(storeName, 'readwrite').objectStore(storeName);
    const r = s.put(item);
    r.onsuccess = () => res(item);
    r.onerror = () => rej(r.error);
  });
}
async function DBadd(storeName, item) {
  if (!item.id) item.id = U.uid();
  item.createdAt = U.now(); item.updatedAt = U.now();
  return DBput(storeName, item);
}
async function DBdelete(storeName, id) {
  if (!DB) return;
  const item = await DBget(storeName, id);
  if (!item) return;
  await DBput(storeName, item);
  await new Promise((res,rej) => {
    const s = DB.transaction(storeName, 'readwrite').objectStore(storeName);
    const r = s.delete(id);
    r.onsuccess = () => res(); r.onerror = () => rej(r.error);
  });
  await DBadd('recycleBin', { ...item, _origStore: storeName, _deletedAt: U.now() });
}
async function DBpurge(storeName, id) {
  if (!DB) return;
  await new Promise((res,rej) => {
    try {
      const s = DB.transaction(storeName, 'readwrite').objectStore(storeName);
      const r = s.delete(id);
      r.onsuccess = () => res(); r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
}

// ===== WebView 兼容：Notification shim =====
// Android WebView / Electron 可能没有浏览器原生 Notification API
if (typeof Notification === 'undefined') {
  window.Notification = {
    permission: 'denied',
    requestPermission: () => Promise.resolve('denied')
  };
  // 构造函数 shim
  window.Notification = function(title, opts) { console.log('[通知]', title, opts?.body || ''); };
  window.Notification.permission = 'denied';
  window.Notification.requestPermission = () => Promise.resolve('denied');
}

// ===== Config (localStorage) =====
const Config = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
  defaults: { notifyEnabled: true, defaultPriority: 'mid', ai: { provider: 'doubao', apiKey: '', model: 'doubao-seed-evolving', apiUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions', systemPrompt: '你是一个友好、专业的 AI 助手。请用中文回答用户的问题，回答要简洁准确。' } },
  // 启动时校验 localStorage 里的 ai 配置，脏值自动重置
  sanitizeAi(providers) {
    try {
      const cfg = this.get('global', this.defaults);
      const ai = cfg.ai || { ...this.defaults.ai };
      const fixed = { ...ai };
      let changed = false;
      if (!providers[ai.provider]) { fixed.provider = 'doubao'; fixed.model = 'doubao-seed-evolving'; changed = true; }
      else if (!ai.model) { fixed.model = providers[ai.provider].defaultModel; changed = true; }
      if (changed) {
        cfg.ai = fixed;
        this.set('global', cfg);
      }
    } catch (e) { console.warn('sanitizeAi 失败:', e); }
  }
};

// ===== Modal =====
const Modal = {
  open(title, bodyEl, footerEl, onClose) {
    document.getElementById('modal-title').textContent = title;
    const body = document.getElementById('modal-body'); body.innerHTML = '';
    body.appendChild(typeof bodyEl === 'string' ? document.createTextNode(bodyEl) : bodyEl);
    const footer = document.getElementById('modal-footer'); footer.innerHTML = '';
    if (footerEl) footer.appendChild(footerEl);
    document.getElementById('modal-backdrop').style.display = 'flex';
    this._onClose = onClose;
  },
  close() {
    document.getElementById('modal-backdrop').style.display = 'none';
    const cb = this._onClose; this._onClose = null;
    if (cb) cb();
  },
  confirm(title, msg, onOk, okText='确认', cancelText='取消', danger=false) {
    const footer = U.el('div', { class: 'modal-footer-buttons' }, [
      U.el('button', { class: 'btn btn-ghost', text: cancelText, onclick: () => { Modal.close(); } }),
      U.el('button', { class: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'), text: okText, onclick: () => { Modal.close(); onOk(); } })
    ]);
    this.open(title, U.el('div', { class: 'confirm-msg', text: msg }), footer);
  }
};

document.getElementById('modal-close').addEventListener('click', () => Modal.close());
document.getElementById('modal-backdrop').addEventListener('click', (e) => { if (e.target.id === 'modal-backdrop') Modal.close(); });

// ===== Toast =====
const Toast = {
  show(msg, type='info') {
    const c = document.getElementById('toast-container');
    const t = U.el('div', { class: 'toast toast-'+type, text: msg });
    c.appendChild(t);
    setTimeout(() => t.classList.add('toast-in'), 10);
    setTimeout(() => { t.classList.remove('toast-in'); setTimeout(() => t.remove(), 300); }, 2500);
  },
  ok(m) { this.show(m, 'ok'); },
  warn(m) { this.show(m, 'warn'); },
  err(m) { this.show(m, 'err'); }
};

// ===== 通用表单字段 =====
function field(label, input) {
  return U.el('div', { class: 'form-field' }, [
    U.el('label', { class: 'form-label', text: label }),
    typeof input === 'string' ? U.el('input', { type: input }) : input
  ]);
}
function inputGroup(fieldDefs, initial = {}) {
  const map = {};
  const wrap = U.el('div', { class: 'form' }, fieldDefs.map(def => {
    const attrs = { class: 'form-input', placeholder: def.placeholder || '' };
    if (def.type) attrs.type = def.type;
    if (def.value !== undefined) attrs.value = initial[def.key] ?? def.value;
    if (def.required) attrs.required = true;
    let input;
    if (def.type === 'textarea') {
      input = U.el('textarea', { class: 'form-input', rows: def.rows || 3, placeholder: def.placeholder || '', text: initial[def.key] || '' });
    } else if (def.type === 'select') {
      input = U.el('select', { class: 'form-input' },
        (def.options || []).map(o => U.el('option', { value: o.value, text: o.label, selected: (initial[def.key] ?? def.defaultValue) === o.value ? true : undefined }))
      );
    } else {
      input = U.el('input', attrs);
    }
    map[def.key] = input;
    return U.el('div', { class: 'form-field' }, [
      def.label ? U.el('label', { class: 'form-label', text: def.label + (def.required ? ' *' : '') }) : null,
      input
    ]);
  }));
  wrap.getData = () => {
    const out = {};
    Object.entries(map).forEach(([k, el]) => {
      if (el.type === 'checkbox') out[k] = el.checked;
      else if (el.tagName === 'SELECT') out[k] = el.value;
      else out[k] = el.value;
    });
    return out;
  };
  return wrap;
}

const PRIORITY_LABEL = { high: '高', mid: '中', low: '低' };
const PRIORITY_CLASS = { high: 'prio-high', mid: 'prio-mid', low: 'prio-low' };

// ===== 路由 =====
const ROUTES = {};
function registerRoute(name, handler, title) { ROUTES[name] = { handler, title }; }

function navigate() {
  const hash = location.hash.replace(/^#\//, '') || 'home';
  const [route, ...rest] = hash.split('/');
  const info = ROUTES[route];
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.route === route));
  document.getElementById('page-title').textContent = info ? info.title : '个人工作台';
  const content = document.getElementById('content');
  content.innerHTML = '';
  
  // 更新底部导航状态
  const nav = document.getElementById('bottom-nav');
  const fab = document.getElementById('fab-add');
  if (nav) {
    nav.querySelectorAll('.bottom-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.bnav === route);
    });
  }
  
  // 日程中心路由的显示控制
  const cuteRoutes = ['schedule', 'calendar', 'focus', 'stats'];
  if (cuteRoutes.includes(route)) {
    document.body.classList.add('schedule-mode');
    if (nav) nav.style.display = 'flex';
    if (fab) {
      if (route === 'schedule' || route === 'calendar') {
        fab.style.display = 'flex';
      } else {
        fab.style.display = 'none';
      }
    }
  } else if (route === 'profile') {
    // profile 路由也显示底部导航
    document.body.classList.add('schedule-mode');
    if (nav) nav.style.display = 'flex';
    if (fab) fab.style.display = 'none';
  } else {
    document.body.classList.remove('schedule-mode');
    if (nav) nav.style.display = 'none';
    if (fab) fab.style.display = 'none';
  }
  
  if (info) {
    Promise.resolve(info.handler(content, rest)).catch(e => {
      console.error(e); Toast.err('渲染出错：' + e.message);
    });
  }
}

window.addEventListener('hashchange', navigate);

// ============ 启动闪屏 ============
(function initSplashScreen() {
  const splashKey = 'splash_shown';
  if (sessionStorage.getItem(splashKey)) {
    const el = document.getElementById('splash-screen');
    if (el) el.remove();
    return;
  }
  const splash = document.getElementById('splash-screen');
  if (!splash) return;
  sessionStorage.setItem(splashKey, '1');
  setTimeout(() => {
    splash.classList.add('splash-fade-out');
    setTimeout(() => splash.remove(), 600);
  }, 1500);
})();

// ============ 模块：首页 ============
registerRoute('home', async (root) => {
  const notes = await DBgetAll('notes');
  const todos = await DBgetAll('todos');
  const media = await DBgetAll('media');
  const develop = await DBgetAll('develop');
  const consult = await DBgetAll('consult');
  const fitness = await DBgetAll('fitness');
  const diet = await DBgetAll('diet');
  const game = await DBgetAll('game');

  const today = U.todayStr();
  const todayTodos = todos.filter(t => !t.done && (t.deadline ? t.deadline.startsWith(today) : true));
  const allPending = todos.filter(t => !t.done);
  const highSummaries = [];
  [media, develop, consult, fitness, game].flat().filter(i => i.priority === 'high' && !i.done).forEach(i => {
    highSummaries.push({ store: i._store || '?', name: i.name || i.title || i.project, item: i });
  });

  // 备忘输入
  const noteInput = U.el('input', { class: 'form-input', placeholder: '✍️ 快速备忘，回车保存...' });
  noteInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && noteInput.value.trim()) {
      await DBadd('notes', { text: noteInput.value.trim() });
      noteInput.value = '';
      Toast.ok('备忘已保存');
      navigate();
    }
  });

  const noteList = U.el('div', { class: 'note-list' });
  notes.slice().reverse().slice(0, 10).forEach(n => {
    noteList.appendChild(U.el('div', { class: 'note-item' }, [
      U.el('span', { class: 'note-text', text: n.text }),
      U.el('span', { class: 'note-time', text: U.fmtDateTime(n.createdAt) }),
      U.el('button', { class: 'note-del', text: '✕', onclick: () => DBdelete('notes', n.id).then(() => navigate()) })
    ]));
  });

  // 今日计划面板
  const todoPanel = U.el('div', { class: 'dashboard-card' }, [
    U.el('div', { class: 'card-head' }, [U.el('h3', { text: '📅 今日计划 · ' + today }), U.el('a', { class: 'link', text: '去管理 →', href: '#/todayPlan' })]),
    todayTodos.length === 0 ? U.el('div', { class: 'empty', text: '没有待办，太棒了！' }) : null,
    ...todayTodos.slice(0, 10).map(t => U.el('div', { class: 'todo-row' }, [
      U.el('input', { type: 'checkbox', class: 'todo-check', checked: t.done, onclick: () => { t.done = !t.done; DBput('todos', t).then(navigate); } }),
      U.el('span', { class: 'todo-text ' + (t.done ? 'done' : '') + ' ' + (PRIORITY_CLASS[t.priority] || ''), text: t.title }),
      U.el('span', { class: 'badge badge-' + (PRIORITY_CLASS[t.priority] || 'prio-mid'), text: PRIORITY_LABEL[t.priority] || '中' }),
      t.deadline ? U.el('span', { class: 'todo-deadline', text: U.fmtTime(t.deadline) }) : null
    ])).filter(Boolean)
  ]);

  // 高优摘要
  const summaryPanel = U.el('div', { class: 'dashboard-card' }, [
    U.el('div', { class: 'card-head' }, [U.el('h3', { text: '🔥 高优待办摘要' })]),
    highSummaries.length === 0 ? U.el('div', { class: 'empty', text: '没有高优事项' }) : null,
    ...highSummaries.slice(0, 8).map(s => U.el('div', { class: 'summary-row', onclick: () => navigate() }, [
      U.el('span', { class: 'badge badge-prio-high', text: s.store }),
      U.el('span', { class: 'summary-text', text: s.name })
    ])).filter(Boolean)
  ]);

  // 统计卡
  const statCard = U.el('div', { class: 'dashboard-card stat-card' }, [
    U.el('div', { class: 'stat-item' }, [U.el('div', { class: 'stat-num', text: allPending.length }), U.el('div', { class: 'stat-lbl', text: '待办任务' })]),
    U.el('div', { class: 'stat-item' }, [U.el('div', { class: 'stat-num', text: media.filter(i=>!i.done).length }), U.el('div', { class: 'stat-lbl', text: '自媒体选题' })]),
    U.el('div', { class: 'stat-item' }, [U.el('div', { class: 'stat-num', text: game.length }), U.el('div', { class: 'stat-lbl', text: '游戏清单' })]),
    U.el('div', { class: 'stat-item' }, [U.el('div', { class: 'stat-num', text: notes.length }), U.el('div', { class: 'stat-lbl', text: '备忘条数' })])
  ]);

  // 模块快捷入口
  const entries = [
    { r: 'todayPlan', i: '📅', t: '今日计划' },
    { r: 'media', i: '📱', t: '自媒体' },
    { r: 'develop', i: '💻', t: '开发工作' },
    { r: 'consult', i: '💼', t: '咨询工作' },
    { r: 'fitness', i: '💪', t: '健身计划' },
    { r: 'diet', i: '🍱', t: '饮食计划' },
    { r: 'game', i: '🎮', t: '游戏娱乐' },
    { r: 'setting', i: '⚙️', t: '数据与设置' }
  ];
  const quickGrid = U.el('div', { class: 'dashboard-card' }, [
    U.el('div', { class: 'card-head' }, [U.el('h3', { text: '🚀 模块快捷入口' })]),
    U.el('div', { class: 'quick-grid' }, entries.map(e => U.el('a', { class: 'quick-item', href: '#/' + e.r }, [
      U.el('div', { class: 'quick-icon', text: e.i }),
      U.el('div', { class: 'quick-text', text: e.t })
    ])))
  ]);

  root.appendChild(U.el('div', { class: 'dashboard-grid' }, [
    U.el('div', { class: 'dashboard-card' }, [
      U.el('div', { class: 'card-head' }, [U.el('h3', { text: '✍️ 快速备忘' })]),
      noteInput, noteList
    ]),
    todoPanel,
    summaryPanel,
    statCard,
    quickGrid
  ]));
}, '首页总览');

// ============ 通用：列表页 ============
function renderListPage(root, storeName, title, addLabel, fields, renderRow) {
  root.innerHTML = '';
  const head = U.el('div', { class: 'page-head' }, [
    U.el('h2', { text: title }),
    U.el('button', { class: 'btn btn-primary', text: '＋ ' + addLabel, onclick: () => openEditor(storeName, null, fields, renderRow) })
  ]);
  root.appendChild(head);
  const listWrap = U.el('div', { class: 'list-wrap' });
  root.appendChild(listWrap);
  refresh();
  async function refresh() {
    listWrap.innerHTML = '';
    const items = await DBgetAll(storeName);
    if (items.length === 0) { listWrap.appendChild(U.el('div', { class: 'empty-large', text: '还没有数据，点右上角 ＋ 添加' })); return; }
    const sorted = items.slice().sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
    sorted.forEach(item => {
      const row = renderRow(item, () => openEditor(storeName, item, fields, renderRow));
      listWrap.appendChild(row);
    });
  }
  root._refresh = refresh;
}

function openEditor(storeName, existing, fields, renderRow) {
  const isEdit = !!existing;
  const formMap = {};
  const body = U.el('div', { class: 'form' });
  fields.forEach(def => {
    let input;
    const v = existing ? existing[def.key] : (def.default || '');
    if (def.type === 'textarea') {
      input = U.el('textarea', { class: 'form-input', rows: def.rows||3, placeholder: def.placeholder||'' }, v || '');
    } else if (def.type === 'select') {
      input = U.el('select', { class: 'form-input' }, (def.options||[]).map(o => U.el('option', { value: o.value, text: o.label, selected: o.value === v })));
    } else if (def.type === 'file') {
      input = U.el('div', { class: 'file-drop' }, [
        U.el('div', { class: 'file-drop-hint', text: '📎 点击或拖拽绑定本地文件（只存路径）' }),
        v ? U.el('div', { class: 'file-linked', text: '已绑定：' + v }) : null
      ]);
      input.addEventListener('click', () => {
        const i = document.createElement('input'); i.type = 'file'; i.onchange = () => {
          input.querySelector('.file-linked')?.remove();
          input.appendChild(U.el('div', { class: 'file-linked', text: '已绑定：' + (i.files[0]?.name || '') }));
          formMap[def.key].value = i.files[0]?.name || '';
        }; i.click();
      });
      input.addEventListener('dragover', e => e.preventDefault());
      input.addEventListener('drop', e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) {
        input.querySelector('.file-linked')?.remove();
        input.appendChild(U.el('div', { class: 'file-linked', text: '已绑定：' + f.name }));
        formMap[def.key].value = f.name;
      }});
      formMap[def.key] = { value: v || '' };
    } else if (def.type === 'checkbox') {
      input = U.el('label', { class: 'check-wrap' }, [U.el('input', { type: 'checkbox', checked: !!v }), U.el('span', { text: def.checkLabel || '' })]);
    } else {
      input = U.el('input', { class: 'form-input', type: def.type || 'text', placeholder: def.placeholder || '', value: v || '' });
    }
    formMap[def.key] = input;
    body.appendChild(U.el('div', { class: 'form-field' }, [
      def.label ? U.el('label', { class: 'form-label', text: def.label + (def.required ? ' *' : '') }) : null,
      input
    ].filter(Boolean)));
  });
  const footer = U.el('div', { class: 'modal-footer-buttons' }, [
    U.el('button', { class: 'btn btn-ghost', text: '取消', onclick: () => Modal.close() }),
    U.el('button', { class: 'btn btn-primary', text: isEdit ? '保存' : '添加', onclick: async () => {
      const data = { id: existing?.id, ...(existing || {}) };
      fields.forEach(def => {
        const el = formMap[def.key];
        if (def.type === 'checkbox') data[def.key] = el.firstChild.checked;
        else if (def.key === 'deadline' && el.value) data[def.key] = el.value.length === 10 ? el.value + 'T23:59' : el.value;
        else data[def.key] = el.value;
      });
      if (!existing) await DBadd(storeName, data);
      else await DBput(storeName, data);
      Modal.close(); Toast.ok(isEdit ? '已保存' : '已添加');
      const route = location.hash.replace(/^#\//,'').split('/')[0];
      navigate();
    }})
  ]);
  Modal.open((isEdit?'编辑':'添加') + ' - ' + STORE_LABELS[storeName], body, footer);
}

// ============ 模块：今日计划 ============
const TODO_FIELDS = [
  { key: 'title', label: '任务标题', required: true, placeholder: '要做什么？' },
  { key: 'desc', label: '详细备注', type: 'textarea', placeholder: '补充说明、链接等' },
  { key: 'priority', label: '优先级', type: 'select', defaultValue: 'mid', options: [
    { value: 'high', label: '🔴 高' }, { value: 'mid', label: '🟡 中' }, { value: 'low', label: '🟢 低' }
  ]},
  { key: 'deadline', label: '截止时间', type: 'datetime-local' },
  { key: 'filePath', label: '关联文件', type: 'file' }
];
registerRoute('todayPlan', (root) => renderListPage(root, 'todos', '今日计划', '新任务', TODO_FIELDS, (item, edit) => {
  return U.el('div', { class: 'list-item ' + (item.done ? 'done' : ''), draggable: 'true' }, [
    U.el('input', { type: 'checkbox', class: 'todo-check', checked: !!item.done, onclick: () => { item.done = !item.done; DBput('todos', item).then(() => root._refresh()); } }),
    U.el('div', { class: 'item-body', onclick: edit }, [
      U.el('div', { class: 'item-title', text: item.title || '未命名' }),
      item.desc ? U.el('div', { class: 'item-sub', text: item.desc }) : null,
      item.deadline ? U.el('div', { class: 'item-meta' }, [
        U.el('span', { class: 'badge badge-prio-' + (item.priority||'mid'), text: PRIORITY_LABEL[item.priority] || '中' }),
        U.el('span', { class: 'deadline-chip', text: '⏰ ' + U.fmtDateTime(item.deadline.startsWith('20') && item.deadline.length <= 16 ? item.deadline.replace('T',' ') : item.deadline) })
      ]) : U.el('div', { class: 'item-meta' }, [
        U.el('span', { class: 'badge badge-prio-' + (item.priority||'mid'), text: PRIORITY_LABEL[item.priority] || '中' })
      ]),
      item.filePath ? U.el('div', { class: 'file-linked', text: '📎 ' + item.filePath }) : null
    ]),
    U.el('button', { class: 'btn-icon', title: '删除', onclick: () => Modal.confirm('删除任务', '将移入回收站', () => DBdelete('todos', item.id).then(() => root._refresh()), '删除', '取消', true) }, '🗑️')
  ]);
}), '今日计划');

// ============ 模块：自媒体 ============
const MEDIA_FIELDS = [
  { key: 'title', label: '选题标题', required: true },
  { key: 'desc', label: '选题备注', type: 'textarea' },
  { key: 'draft', label: '文案草稿', type: 'textarea', rows: 5 },
  { key: 'planPublish', label: '计划发布', type: 'datetime-local' },
  { key: 'published', label: '已发布', type: 'checkbox', checkLabel: '已完成发布' },
  { key: 'priority', label: '优先级', type: 'select', defaultValue: 'mid', options: [
    { value: 'high', label: '🔴 高' }, { value: 'mid', label: '🟡 中' }, { value: 'low', label: '🟢 低' }
  ]},
  { key: 'review', label: '复盘笔记', type: 'textarea' },
  { key: 'filePath', label: '关联文件', type: 'file' }
];
registerRoute('media', (root) => renderListPage(root, 'media', '自媒体', '新选题', MEDIA_FIELDS, (item, edit) => {
  return U.el('div', { class: 'list-item ' + (item.published ? 'done' : '') }, [
    U.el('div', { class: 'item-body', onclick: edit }, [
      U.el('div', { class: 'item-title', text: item.title || '未命名' }),
      item.desc ? U.el('div', { class: 'item-sub', text: item.desc }) : null,
      item.draft ? U.el('div', { class: 'item-draft', text: item.draft.slice(0, 120) }) : null,
      U.el('div', { class: 'item-meta' }, [
        U.el('span', { class: 'badge badge-prio-' + (item.priority||'mid'), text: PRIORITY_LABEL[item.priority] || '中' }),
        item.published ? U.el('span', { class: 'badge badge-ok', text: '✓ 已发布' }) : (item.planPublish ? U.el('span', { class: 'deadline-chip', text: '📅 ' + (item.planPublish.replace('T',' ')) }) : U.el('span', { class: 'badge', text: '待发布' }))
      ])
    ]),
    U.el('button', { class: 'btn-icon', title: '删除', onclick: () => Modal.confirm('删除选题', '将移入回收站', () => DBdelete('media', item.id).then(() => root._refresh()), '删除', '取消', true) }, '🗑️')
  ]);
}), '自媒体');

// ============ 模块：开发工作 ============
// 支持项目分组 + 任务
registerRoute('develop', async (root) => {
  root.innerHTML = '';
  const head = U.el('div', { class: 'page-head' }, [
    U.el('h2', { text: '开发工作' }),
    U.el('div', { class: 'head-actions' }, [
      U.el('button', { class: 'btn btn-ghost', text: '＋ 项目', onclick: () => {
        const nameInput = U.el('input', { class: 'form-input', placeholder: '项目名' });
        const descInput = U.el('textarea', { class: 'form-input', rows: 2, placeholder: '描述（可选）' });
        Modal.open('新建项目', U.el('div', { class: 'form' }, [
          U.el('div', { class: 'form-field' }, [U.el('label', { class: 'form-label', text: '项目名 *' }), nameInput]),
          U.el('div', { class: 'form-field' }, [U.el('label', { class: 'form-label', text: '描述' }), descInput])
        ]), U.el('div', { class: 'modal-footer-buttons' }, [
          U.el('button', { class: 'btn btn-ghost', text: '取消', onclick: () => Modal.close() }),
          U.el('button', { class: 'btn btn-primary', text: '创建', onclick: async () => {
            if (!nameInput.value.trim()) return Toast.warn('请填写项目名');
            await DBadd('develop', { type: 'project', name: nameInput.value.trim(), desc: descInput.value });
            Modal.close(); refresh();
          }})
        ]));
      }}),
      U.el('button', { class: 'btn btn-primary', text: '＋ 任务', onclick: () => openDevTask() })
    ])
  ]);
  root.appendChild(head);

  const listWrap = U.el('div', { class: 'dev-wrap' });
  root.appendChild(listWrap);

  function openDevTask(existing) {
    DBgetAll('develop').then(all => {
      const projects = all.filter(x => x.type === 'project');
      if (projects.length === 0 && !existing) { Toast.warn('先创建一个项目'); return; }
      const form = [
        { key: 'title', label: '任务标题', required: true, value: existing?.title },
        { key: 'projectId', label: '所属项目', type: 'select', value: existing?.projectId, defaultValue: projects[0]?.id, options: projects.map(p => ({ value: p.id, label: p.name })) },
        { key: 'desc', label: '需求备注', type: 'textarea', value: existing?.desc },
        { key: 'progress', label: '进度 %', type: 'number', value: existing?.progress || 0 },
        { key: 'deadline', label: '截止', type: 'datetime-local', value: existing?.deadline },
        { key: 'priority', label: '优先级', type: 'select', value: existing?.priority, defaultValue: 'mid', options: [{value:'high',label:'🔴 高'},{value:'mid',label:'🟡 中'},{value:'low',label:'🟢 低'}] },
        { key: 'done', label: '已完成', type: 'checkbox', value: existing?.done, checkLabel: '标记完成' },
        { key: 'filePath', label: '关联文件', type: 'file', value: existing?.filePath }
      ];
      openEditor('develop', existing, form, null);
    });
  }

  async function refresh() {
    listWrap.innerHTML = '';
    const items = await DBgetAll('develop');
    if (items.length === 0) { listWrap.appendChild(U.el('div', { class: 'empty-large', text: '先创建一个项目吧' })); return; }
    const projects = items.filter(x => x.type === 'project');
    const tasks = items.filter(x => !x.type || x.type === 'task');
    projects.forEach(p => {
      const ptasks = tasks.filter(t => t.projectId === p.id);
      const card = U.el('div', { class: 'project-card' }, [
        U.el('div', { class: 'project-head' }, [
          U.el('div', { class: 'project-name', text: p.name }, [
            U.el('button', { class: 'btn-icon', title: '删除项目', onclick: () => Modal.confirm('删除项目', '项目和任务会入回收站', async () => {
              for (const t of ptasks) await DBdelete('develop', t.id);
              await DBdelete('develop', p.id); refresh();
            }, '删除', '取消', true) }, '🗑️')
          ]),
          U.el('span', { class: 'badge', text: ptasks.length + ' 任务' })
        ]),
        p.desc ? U.el('div', { class: 'project-desc', text: p.desc }) : null,
        U.el('div', { class: 'task-list' }, ptasks.length === 0 ? U.el('div', { class: 'empty', text: '暂无任务' }) : null),
        ...ptasks.map(t => U.el('div', { class: 'task-item ' + (t.done?'done':''), onclick: () => openDevTask(t) }, [
          U.el('input', { type: 'checkbox', checked: !!t.done, onclick: (e) => { e.stopPropagation(); t.done = !t.done; DBput('develop', t).then(refresh); } }),
          U.el('div', { class: 'task-body' }, [
            U.el('div', { class: 'task-title', text: t.title }),
            U.el('div', { class: 'task-meta' }, [
              U.el('span', { class: 'badge badge-prio-' + (t.priority||'mid'), text: PRIORITY_LABEL[t.priority]||'中' }),
              U.el('div', { class: 'progress-bar', style: 'width:80px;height:6px;background:#eee;border-radius:3px;overflow:hidden;display:inline-block;margin-left:8px;vertical-align:middle;' }, [
                U.el('div', { class: 'progress-fill', style: 'width:' + (t.progress||0) + '%;height:100%;background:linear-gradient(90deg,#3498db,#2ecc71);border-radius:3px;' })
              ]),
              U.el('span', { class: 'progress-num', text: (t.progress||0) + '%', style: 'margin-left:4px;font-size:12px;color:#666;' })
            ])
          ]),
          U.el('button', { class: 'btn-icon', title: '删除', onclick: (e) => { e.stopPropagation(); Modal.confirm('删除任务', '', () => DBdelete('develop', t.id).then(refresh), '删除', '取消', true); } }, '🗑️')
        ]))
      ]);
      listWrap.appendChild(card);
    });
    tasks.filter(t => !t.projectId).forEach(t => {
      // 无项目任务
    });
  }

  root._refresh = refresh;
  refresh();
}, '开发工作');

// ============ 模块：咨询工作 ============
const CONSULT_FIELDS = [
  { key: 'title', label: '工单/客户', required: true },
  { key: 'content', label: '咨询内容', type: 'textarea' },
  { key: 'followUp', label: '待跟进事项', type: 'textarea' },
  { key: 'nextFollow', label: '下次跟进时间', type: 'datetime-local' },
  { key: 'status', label: '跟进状态', type: 'select', defaultValue: 'open', options: [
    { value: 'open', label: '🟡 待跟进' }, { value: 'doing', label: '🔵 跟进中' }, { value: 'done', label: '🟢 已完成' }, { value: 'block', label: '🔴 阻塞' }
  ]},
  { key: 'priority', label: '优先级', type: 'select', defaultValue: 'mid', options: [
    { value: 'high', label: '🔴 高' }, { value: 'mid', label: '🟡 中' }, { value: 'low', label: '🟢 低' }
  ]},
  { key: 'filePath', label: '关联文件', type: 'file' }
];
const CONSULT_STATUS_LABEL = { open:'待跟进', doing:'跟进中', done:'已完成', block:'阻塞' };
const CONSULT_STATUS_CLASS = { open:'prio-mid', doing:'status-doing', done:'status-done', block:'prio-high' };
registerRoute('consult', (root) => renderListPage(root, 'consult', '咨询工作', '新工单', CONSULT_FIELDS, (item, edit) => {
  return U.el('div', { class: 'list-item ' + (item.status === 'done' ? 'done' : '') }, [
    U.el('div', { class: 'item-body', onclick: edit }, [
      U.el('div', { class: 'item-title', text: item.title }),
      item.content ? U.el('div', { class: 'item-sub', text: item.content.slice(0, 100) }) : null,
      item.followUp ? U.el('div', { class: 'item-sub', text: '🖊 ' + item.followUp.slice(0, 100) }) : null,
      U.el('div', { class: 'item-meta' }, [
        U.el('span', { class: 'badge badge-prio-' + (item.priority||'mid'), text: PRIORITY_LABEL[item.priority]||'中' }),
        U.el('span', { class: 'badge badge-' + (CONSULT_STATUS_CLASS[item.status]||''), text: CONSULT_STATUS_LABEL[item.status]||'待跟进' }),
        item.nextFollow ? U.el('span', { class: 'deadline-chip', text: '🗓 ' + item.nextFollow.replace('T',' ') }) : null
      ])
    ]),
    U.el('button', { class: 'btn-icon', title: '删除', onclick: () => Modal.confirm('删除工单', '移入回收站', () => DBdelete('consult', item.id).then(() => root._refresh()), '删除', '取消', true) }, '🗑️')
  ]);
}), '咨询工作');

// ============ 模块：健身计划 ============
const FITNESS_PLANS = ['全身训练', '胸背肩腿', '上下肢分化', '推/拉/腿'];
const FITNESS_FIELDS = [
  { key: 'planName', label: '训练方案', required: true, type: 'select', defaultValue: FITNESS_PLANS[0], options: FITNESS_PLANS.map(p => ({ value: p, label: p })) },
  { key: 'exercise', label: '训练项目', required: true, placeholder: '如：硬拉 5×5' },
  { key: 'date', label: '训练日期', type: 'date', value: U.todayStr() },
  { key: 'duration', label: '时长（分钟）', type: 'number', value: 60 },
  { key: 'done', label: '已完成', type: 'checkbox', checkLabel: '标记训练完成' },
  { key: 'notes', label: '备注', type: 'textarea' },
  { key: 'filePath', label: '关联文件', type: 'file' }
];
registerRoute('fitness', (root) => renderListPage(root, 'fitness', '健身计划', '新训练记录', FITNESS_FIELDS, (item, edit) => {
  return U.el('div', { class: 'list-item ' + (item.done ? 'done' : '') }, [
    U.el('input', { type: 'checkbox', class: 'todo-check', checked: !!item.done, onclick: () => { item.done = !item.done; DBput('fitness', item).then(() => root._refresh()); } }),
    U.el('div', { class: 'item-body', onclick: edit }, [
      U.el('div', { class: 'item-title', text: item.planName + ' · ' + item.exercise }),
      U.el('div', { class: 'item-meta' }, [
        item.date ? U.el('span', { class: 'deadline-chip', text: '📅 ' + item.date }) : null,
        U.el('span', { class: 'badge', text: (item.duration||0) + ' 分钟' })
      ]),
      item.notes ? U.el('div', { class: 'item-sub', text: item.notes }) : null
    ]),
    U.el('button', { class: 'btn-icon', title: '删除', onclick: () => Modal.confirm('删除记录', '移入回收站', () => DBdelete('fitness', item.id).then(() => root._refresh()), '删除', '取消', true) }, '🗑️')
  ]);
}), '健身计划');

// ============ 模块：饮食计划 ============
const DIET_MEALS = [{ value: 'breakfast', label: '🌅 早餐' }, { value: 'lunch', label: '☀️ 午餐' }, { value: 'dinner', label: '🌙 晚餐' }, { value: 'snack', label: '🍪 加餐' }];
const DIET_FIELDS = [
  { key: 'date', label: '日期', type: 'date', value: U.todayStr() },
  { key: 'meal', label: '餐次', type: 'select', defaultValue: 'breakfast', options: DIET_MEALS },
  { key: 'ingredients', label: '食材清单', type: 'textarea', placeholder: '如：鸡蛋2个 + 牛奶250ml + 全麦面包1片' },
  { key: 'calories', label: '估算热量 (kcal)', type: 'number', value: 0 },
  { key: 'notes', label: '备注', type: 'textarea' },
  { key: 'filePath', label: '关联文件', type: 'file' }
];
const MEAL_LABEL = { breakfast:'🌅 早餐', lunch:'☀️ 午餐', dinner:'🌙 晚餐', snack:'🍪 加餐' };
registerRoute('diet', async (root) => {
  root.innerHTML = '';
  const head = U.el('div', { class: 'page-head' }, [
    U.el('h2', { text: '饮食计划' }),
    U.el('button', { class: 'btn btn-primary', text: '＋ 新饮食记录', onclick: () => openEditor('diet', null, DIET_FIELDS, null) })
  ]);
  root.appendChild(head);
  root.appendChild(U.el('div', { id: 'diet-stats', class: 'diet-stats' }));
  const listWrap = U.el('div', { class: 'list-wrap' });
  root.appendChild(listWrap);

  async function refresh() {
    listWrap.innerHTML = '';
    const items = (await DBgetAll('diet')).sort((a,b) => (b.date||'').localeCompare(a.date||''));
    if (items.length === 0) { listWrap.appendChild(U.el('div', { class: 'empty-large', text: '还没有饮食记录' })); return; }
    // 按日期分组
    const groups = {};
    items.forEach(i => { (groups[i.date] = groups[i.date] || []).push(i); });
    Object.entries(groups).forEach(([date, meals]) => {
      const dayKcal = meals.reduce((s, m) => s + Number(m.calories||0), 0);
      listWrap.appendChild(U.el('div', { class: 'diet-day' }, [
        U.el('div', { class: 'diet-day-head' }, [
          U.el('span', { class: 'diet-date', text: date }),
          U.el('span', { class: 'diet-day-kcal', text: '🔥 ' + dayKcal + ' kcal' })
        ]),
        ...meals.map(m => U.el('div', { class: 'list-item' }, [
          U.el('div', { class: 'item-body', onclick: () => openEditor('diet', m, DIET_FIELDS, null) }, [
            U.el('div', { class: 'item-title', text: MEAL_LABEL[m.meal] || m.meal }),
            U.el('div', { class: 'item-sub', text: m.ingredients || '(未填食材)' }),
            m.notes ? U.el('div', { class: 'item-sub', text: m.notes }) : null
          ]),
          U.el('div', { class: 'diet-item-kcal', text: (m.calories||0) + ' kcal' }),
          U.el('button', { class: 'btn-icon', title: '删除', onclick: () => Modal.confirm('删除', '', () => DBdelete('diet', m.id).then(refresh), '删除', '取消', true) }, '🗑️')
        ]))
      ]));
    });
  }
  root._refresh = refresh; refresh();
}, '饮食计划');

// ============ 模块：游戏娱乐 ============
const GAME_FIELDS = [
  { key: 'name', label: '游戏名', required: true },
  { key: 'status', label: '状态', type: 'select', defaultValue: 'todo', options: [
    { value: 'todo', label: '📋 待玩' }, { value: 'playing', label: '🎮 进行中' }, { value: 'done', label: '🏆 已通关' }
  ]},
  { key: 'progress', label: '通关进度 %', type: 'number', value: 0 },
  { key: 'totalHours', label: '累计时长 (小时)', type: 'number', value: 0 },
  { key: 'notes', label: '备注', type: 'textarea' },
  { key: 'filePath', label: '关联文件', type: 'file' }
];
registerRoute('game', (root) => renderListPage(root, 'game', '游戏娱乐', '＋ 新游戏', GAME_FIELDS, (item, edit) => {
  const statusLabel = { todo:'📋 待玩', playing:'🎮 进行中', done:'🏆 已通关' };
  const pct = item.progress || 0;
  return U.el('div', { class: 'list-item ' + (item.status==='done'?'done':'') }, [
    U.el('div', { class: 'item-body', onclick: edit }, [
      U.el('div', { class: 'item-title', text: '🎮 ' + item.name }),
      U.el('div', { class: 'item-meta' }, [
        U.el('span', { class: 'badge', text: statusLabel[item.status] || '待玩' }),
        U.el('span', { class: 'badge', text: '🕐 ' + (item.totalHours||0) + 'h' }),
        U.el('span', { class: 'badge', text: '进度 ' + pct + '%' })
      ]),
      U.el('div', { class: 'progress-bar', style: 'height:6px;background:#eee;border-radius:3px;overflow:hidden;margin-top:6px;' }, [
        U.el('div', { class: 'progress-fill', style: 'width:' + pct + '%;height:100%;background:linear-gradient(90deg,#667eea,#764ba2);border-radius:3px;' })
      ])
    ]),
    U.el('button', { class: 'btn-icon', title: '删除', onclick: () => Modal.confirm('删除游戏', '', () => DBdelete('game', item.id).then(() => root._refresh()), '删除', '取消', true) }, '🗑️')
  ]);
}), '游戏娱乐');

// ============ 模块：数据与设置 ============
registerRoute('setting', async (root) => {
  root.innerHTML = '';

  // 配置
  const cfg = Config.get('global', Config.defaults);

  // 通知权限
  const notifyStatus = Notification.permission;
  const requestNotify = () => { Notification.requestPermission().then(p => { Toast.ok('权限：' + p); renderConfig(); }); };

  function renderConfig() {
    // 配置区
    const configCard = U.el('div', { class: 'dashboard-card' }, [
      U.el('div', { class: 'card-head' }, [U.el('h3', { text: '⚙️ 全局配置' })]),
      U.el('div', { class: 'setting-row' }, [
        U.el('div', { class: 'setting-label', text: '桌面到期提醒' }),
        U.el('label', { class: 'switch' }, [
          U.el('input', { type: 'checkbox', checked: cfg.notifyEnabled, onchange: (e) => { cfg.notifyEnabled = e.target.checked; Config.set('global', cfg); Toast.ok('已保存'); } }),
          U.el('span', { class: 'slider' })
        ])
      ]),
      U.el('div', { class: 'setting-row' }, [
        U.el('div', { class: 'setting-label', text: '默认优先级' }),
        U.el('select', { class: 'form-input', style: 'max-width:120px', value: cfg.defaultPriority, onchange: (e) => { cfg.defaultPriority = e.target.value; Config.set('global', cfg); } }, [
          U.el('option', { value: 'high', text: '🔴 高', selected: cfg.defaultPriority === 'high' }),
          U.el('option', { value: 'mid', text: '🟡 中', selected: cfg.defaultPriority === 'mid' }),
          U.el('option', { value: 'low', text: '🟢 低', selected: cfg.defaultPriority === 'low' })
        ])
      ]),
      U.el('div', { class: 'setting-row' }, [
        U.el('div', { class: 'setting-label', text: '浏览器通知权限：' + (notifyStatus === 'granted' ? '✅ 已授权' : notifyStatus === 'denied' ? '⛔ 已拒绝' : '⚠️ 未请求') }),
        notifyStatus !== 'granted' ? U.el('button', { class: 'btn btn-ghost', text: '请求授权', onclick: requestNotify }) : null
      ])
    ]);

    // AI 配置
    const aiCfg = cfg.ai || { ...Config.defaults.ai };
    const aiProviderEl = U.el('select', { class: 'form-input', style: 'max-width:200px' },
      Object.entries(AI_PROVIDERS).map(([k, p]) => U.el('option', { value: k, text: p.label, selected: aiCfg.provider === k }))
    );
    const aiApiKeyEl = U.el('input', { class: 'form-input', placeholder: 'sk-xxxxxxxxxxx', type: 'password', value: aiCfg.apiKey || '' });
    const aiApiUrlEl = U.el('input', { class: 'form-input', placeholder: '留空使用默认地址', value: aiCfg.apiUrl || '' });
    const aiModelInput = U.el('input', { class: 'form-input', style: 'max-width:220px', list: 'ai-model-list', placeholder: '选一个或手动填' });
    const aiModelList = U.el('datalist', { id: 'ai-model-list' });
    document.body.appendChild(aiModelList);
    const aiSystemPromptEl = U.el('textarea', { class: 'form-input', rows: 2, placeholder: 'System Prompt（可选）', text: aiCfg.systemPrompt || '' });
    aiModelInput.value = aiCfg.model || '';

    function refreshModelOptions() {
      const providerKey = aiProviderEl.value;
      const provider = AI_PROVIDERS[providerKey];
      aiModelList.innerHTML = '';
      provider.models.forEach(m => {
        aiModelList.appendChild(U.el('option', { value: m.value, text: m.label }));
      });
      // 如果当前值不在预设里，保留它（用户手填的 Endpoint / 新模型）
      const current = aiModelInput.value;
      if (current && !provider.models.some(m => m.value === current)) {
        const exists = Array.from(aiModelList.children).some(o => o.value === current);
        if (!exists) aiModelList.appendChild(U.el('option', { value: current }));
      }
    }
    refreshModelOptions();
    aiProviderEl.addEventListener('change', refreshModelOptions);

    function saveAiCfg() {
      cfg.ai = {
        provider: aiProviderEl.value,
        apiKey: aiApiKeyEl.value.trim(),
        apiUrl: aiApiUrlEl.value.trim(),
        model: aiModelInput.value.trim(),
        systemPrompt: aiSystemPromptEl.value.trim()
      };
      Config.set('global', cfg);
      Toast.ok('AI 配置已保存');
    }

    async function testAi() {
      saveAiCfg();
      const loading = Toast.show('测试中...', 'info');
      try {
        const reply = await AI.chat([{ role: 'user', content: '你好，用一句话自我介绍' }]);
        Toast.ok('✅ 连接成功：' + reply.slice(0, 60));
      } catch (e) {
        Toast.err('❌ 连接失败：' + e.message);
      }
    }

    const aiCard = U.el('div', { class: 'dashboard-card' }, [
      U.el('div', { class: 'card-head' }, [U.el('h3', { text: '🤖 AI 对话配置' })]),
      U.el('div', { class: 'setting-row' }, [
        U.el('div', { class: 'setting-label', text: 'AI 服务商' }),
        aiProviderEl
      ]),
      U.el('div', { class: 'setting-row' }, [
        U.el('div', { class: 'setting-label', text: 'API Key' }),
        U.el('div', { style: 'display:flex;gap:8px;align-items:center;' }, [
          aiApiKeyEl,
          U.el('button', { class: 'btn btn-ghost btn-sm', text: '👁', title: '显示/隐藏', onclick: () => { aiApiKeyEl.type = aiApiKeyEl.type === 'password' ? 'text' : 'password'; } })
        ])
      ]),
      U.el('div', { class: 'setting-row' }, [
        U.el('div', { class: 'setting-label', text: '模型（或 Endpoint ID）' }),
        aiModelInput
      ]),
      U.el('div', { class: 'setting-row' }, [
        U.el('div', { class: 'setting-label', text: '自定义 API 地址' }),
        aiApiUrlEl
      ]),
      U.el('div', { class: 'setting-row', style: 'flex-direction:column;align-items:stretch;gap:8px;' }, [
        U.el('div', { class: 'setting-label', text: 'System Prompt（人设）' }),
        aiSystemPromptEl
      ]),
      U.el('div', { class: 'setting-row' }, [
        U.el('div', { class: 'setting-label', text: AI_PROVIDERS[aiCfg.provider].label + ' Key：' + (aiCfg.apiKey ? '✅ 已填 (' + aiCfg.apiKey.slice(0,6) + '...' + aiCfg.apiKey.slice(-4) + ')' : '❌ 未填') }),
        U.el('div', { style: 'display:flex;gap:8px;' }, [
          U.el('button', { class: 'btn btn-ghost', text: '💾 保存', onclick: saveAiCfg }),
          U.el('button', { class: 'btn btn-primary', text: '🧪 测试连接', onclick: testAi })
        ])
      ])
    ]);

    // 数据备份
    const backupCard = U.el('div', { class: 'dashboard-card' }, [
      U.el('div', { class: 'card-head' }, [U.el('h3', { text: '💾 数据备份' })]),
      U.el('div', { class: 'setting-row' }, [
        U.el('div', { class: 'setting-label', text: '导出全部数据为 JSON' }),
        U.el('button', { class: 'btn btn-primary', text: '导出 JSON', onclick: async () => {
          const data = {};
          for (const s of ['todos','media','develop','consult','fitness','diet','game','notes']) data[s] = await DBgetAll(s);
          U.download('workbench-backup-' + U.todayStr() + '.json', data);
          Toast.ok('已导出');
        }})
      ]),
      U.el('div', { class: 'setting-row' }, [
        U.el('div', { class: 'setting-label', text: '从 JSON 导入数据（覆盖）' }),
        U.el('button', { class: 'btn btn-ghost', text: '选择文件导入', onclick: async () => {
          const f = await U.readFile(); if (!f) return;
          const text = await f.text();
          try {
            const data = JSON.parse(text);
            for (const [s, arr] of Object.entries(data)) {
              if (!STORES.includes(s)) continue;
              if (Array.isArray(arr)) for (const item of arr) { if (item.id) await DBput(s, item); }
            }
            Toast.ok('导入成功'); renderConfig();
          } catch (e) { Toast.err('解析失败：' + e.message); }
        }})
      ]),
      U.el('div', { class: 'setting-row' }, [
        U.el('div', { class: 'setting-label', text: '导出 CSV（今日计划）' }),
        U.el('button', { class: 'btn btn-ghost', text: '导出 CSV', onclick: async () => {
          const items = await DBgetAll('todos');
          const csv = ['id,title,desc,priority,deadline,done,createdAt', ...items.map(i =>
            [i.id, (i.title||'').replace(/"/g,'""'), (i.desc||'').replace(/"/g,'""'), i.priority, i.deadline||'', i.done?'1':'0', i.createdAt].join(',')
          )].join('\n');
          U.download('todos-' + U.todayStr() + '.csv', '\ufeff' + csv, 'text/csv');
        }})
      ])
    ]);

    // 回收站
    const recycleCard = U.el('div', { class: 'dashboard-card' }, [
      U.el('div', { class: 'card-head', style: 'display:flex;justify-content:space-between;align-items:center;' }, [
        U.el('h3', { text: '🗑️ 回收站' }),
        U.el('button', { class: 'btn btn-danger btn-sm', text: '清空回收站', onclick: async () => {
          Modal.confirm('清空回收站', '所有已删除的数据将永久丢失，确定？', async () => {
            const items = await DBgetAll('recycleBin');
            for (const i of items) await DBpurge('recycleBin', i.id);
            Toast.ok('已清空'); renderConfig();
          }, '确认清空', '取消', true);
        }})
      ])
    ]);

    DBgetAll('recycleBin').then(items => {
      if (items.length === 0) {
        recycleCard.appendChild(U.el('div', { class: 'empty', text: '回收站是空的' }));
      } else {
        items.slice().reverse().forEach(item => {
          const row = U.el('div', { class: 'recycle-row' }, [
            U.el('span', { class: 'badge', text: STORE_LABELS[item._origStore] || item._origStore }),
            U.el('span', { class: 'recycle-title', text: item.title || item.name || item.text || '(无标题)' }),
            U.el('span', { class: 'recycle-time', text: U.fmtDateTime(item._deletedAt) }),
            U.el('button', { class: 'btn btn-ghost btn-sm', text: '恢复', onclick: async () => {
              const origStore = item._origStore;
              delete item._origStore; delete item._deletedAt;
              await DBpurge('recycleBin', item.id);
              await DBput(origStore, item);
              Toast.ok('已恢复'); renderConfig();
            }}),
            U.el('button', { class: 'btn btn-danger btn-sm', text: '彻底删除', onclick: async () => {
              Modal.confirm('彻底删除', '无法恢复', async () => { await DBpurge('recycleBin', item.id); Toast.ok('已彻底删除'); renderConfig(); }, '确认', '取消', true);
            }})
          ]);
          recycleCard.appendChild(row);
        });
      }
    });

    // 重置
    const resetCard = U.el('div', { class: 'dashboard-card danger-zone' }, [
      U.el('div', { class: 'card-head' }, [U.el('h3', { text: '⚠️ 危险区域' })]),
      U.el('div', { class: 'setting-row' }, [
        U.el('div', { class: 'setting-label', text: '一键重置系统（清空全部数据，不可恢复）' }),
        U.el('button', { class: 'btn btn-danger', text: '重置全部', onclick: () => {
          Modal.confirm('系统重置', '这会删除所有模块数据，且无法恢复！\n建议先导出备份。', async () => {
            Modal.confirm('最终确认', '真的要清空全部数据吗？', async () => {
              for (const s of STORES) {
                await new Promise((res) => {
                  const t = DB.transaction(s, 'readwrite');
                  const r = t.objectStore(s).clear();
                  r.onsuccess = () => res();
                });
              }
              localStorage.clear();
              Toast.ok('已重置'); renderConfig();
            }, '我确定', '取消', true);
          }, '继续', '取消', true);
        }})
      ])
    ]);

    root.innerHTML = '';
    root.appendChild(U.el('div', { class: 'dashboard-grid' }, [configCard, aiCard, backupCard, recycleCard, resetCard]));
  }

  renderConfig();
}, '数据与设置');

// ============ AI 对话模块 ============
const AI_PROVIDERS = {
  deepseek: {
    label: 'DeepSeek',
    defaultUrl: 'https://api.deepseek.com/v1/chat/completions',
    defaultModel: 'deepseek-chat',
    models: [
      { value: 'deepseek-chat', label: 'deepseek-chat（主力模型）' },
      { value: 'deepseek-reasoner', label: 'deepseek-reasoner（推理模型）' }
    ]
  },
  doubao: {
    label: '豆包 (Volcengine)',
    defaultUrl: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    defaultModel: 'doubao-seed-evolving',
    models: [
      { value: 'doubao-seed-evolving', label: 'doubao-seed-evolving（Coding 专项 ✅ 已开通）' },
      { value: 'doubao-seed-1-6-250615', label: 'doubao-seed-1-6（需先在控制台开通）' },
      { value: 'doubao-seed-1-6-flash-250828', label: 'doubao-seed-1-6-flash（需开通）' },
      { value: 'doubao-seed-2-0-mini-260428', label: 'doubao-seed-2-0-mini（需开通）' },
      { value: 'doubao-seed-2-1-pro-260628', label: 'doubao-seed-2-1-pro（需开通）' },
      { value: 'deepseek-v3-1-terminus', label: 'deepseek-v3-terminus（需开通）' }
    ]
  },
  qwen: {
    label: '通义千问 (DashScope)',
    defaultUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    defaultModel: 'qwen-plus',
    models: [
      { value: 'qwen-plus', label: 'qwen-plus' },
      { value: 'qwen-turbo', label: 'qwen-turbo' },
      { value: 'qwen-max', label: 'qwen-max' },
      { value: 'qwen-long', label: 'qwen-long' }
    ]
  },
  wenxin: {
    label: '文心一言 (千帆)',
    defaultUrl: 'https://qianfan.baidubce.com/v2/chat/completions',
    defaultModel: 'ernie-speed-8k',
    models: [
      { value: 'ernie-speed-8k', label: 'ernie-speed-8k' },
      { value: 'ernie-speed-128k', label: 'ernie-speed-128k' },
      { value: 'ernie-3.5-8k', label: 'ernie-3.5-8k' },
      { value: 'ernie-4.0-8k', label: 'ernie-4.0-8k' }
    ]
  },
  custom: {
    label: '自定义代理 (OpenAI 兼容)',
    defaultUrl: '',
    defaultModel: 'gpt-4o-mini',
    models: [
      { value: 'gpt-4o-mini', label: 'gpt-4o-mini' },
      { value: 'gpt-4o', label: 'gpt-4o' }
    ]
  }
};

const AI = {
  async chat(messages, opts = {}) {
    const cfg = Config.get('global', Config.defaults);
    const aiCfg = cfg.ai || Config.defaults.ai;
    if (!aiCfg.apiKey) throw new Error('未配置 API Key，请在「数据与设置」中填写');

    const provider = AI_PROVIDERS[aiCfg.provider] || AI_PROVIDERS.doubao;
    const url = aiCfg.apiUrl || provider.defaultUrl;
    const model = aiCfg.model || provider.defaultModel;

    const body = {
      model,
      messages,
      temperature: opts.temperature ?? 0.7,
      stream: false
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + aiCfg.apiKey
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error('API 错误 ' + resp.status + ': ' + (text || resp.statusText));
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('API 返回格式异常：' + JSON.stringify(data).slice(0, 200));
    return String(content);
  },

  buildMessages(systemPrompt, history, userText) {
    const msgs = [];
    if (systemPrompt) msgs.push({ role: 'system', content: systemPrompt });
    (history || []).forEach(m => msgs.push({ role: m.role, content: m.content }));
    msgs.push({ role: 'user', content: userText });
    return msgs;
  }
};

// ===== AI 对话存储 =====
async function AI_newConv(title = '新对话') {
  const cfg = Config.get('global', Config.defaults);
  const aiCfg = cfg.ai || Config.defaults.ai;
  const conv = await DBadd('aiConvs', {
    title,
    provider: aiCfg.provider,
    model: aiCfg.model,
    systemPrompt: aiCfg.systemPrompt || '',
    lastMsgAt: U.now()
  });
  return conv;
}
async function AI_listConvs() {
  const items = await DBgetAll('aiConvs');
  return items.sort((a, b) => (b.lastMsgAt || 0) - (a.lastMsgAt || 0));
}
async function AI_getMsgs(convId) {
  const all = await DBgetAll('aiMsgs');
  return all.filter(m => m.convId === convId).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}
async function AI_addMsg(convId, role, content) {
  const msg = await DBadd('aiMsgs', { convId, role, content });
  const conv = await DBget('aiConvs', convId);
  if (conv) {
    conv.lastMsgAt = U.now();
    if (role === 'user' && !conv.title) conv.title = content.slice(0, 30);
    await DBput('aiConvs', conv);
  }
  return msg;
}
async function AI_deleteConv(convId) {
  await DBpurge('aiConvs', convId);
  const all = await DBgetAll('aiMsgs');
  for (const m of all.filter(x => x.convId === convId)) await DBpurge('aiMsgs', m.id);
}

// ===== AI 对话主题系统 =====
const AI_THEMES = {
  // 5 套预设配色
  beige: {
    label: '柔和米色',
    colors: ['#D4B896', '#F5EDE0'],
    vars: {
      '--ai-header-gradient': 'linear-gradient(135deg, #FDF8F0, #F5EDE0)',
      '--ai-header-text': '#8B7355',
      '--ai-header-tag-bg': 'rgba(139,115,85,0.12)',
      '--ai-fab-gradient': 'linear-gradient(135deg, #FDF8F0, #F5EDE0)',
      '--ai-fab-shadow': '0 8px 28px rgba(139,115,85,0.35)',
      '--ai-user-bubble-bg': 'linear-gradient(135deg, #FBF6EE, #F3EAD9)',
      '--ai-user-bubble-text': '#6B5844',
      '--ai-user-bubble-border': '#E8DCC8',
      '--ai-user-avatar': 'linear-gradient(135deg, #D4B896, #B89A78)',
      '--ai-user-avatar-shadow': '0 4px 16px rgba(184,154,120,0.4)',
      '--ai-ai-avatar': 'linear-gradient(135deg, #D4B896, #B89A78)',
      '--ai-ai-avatar-text': '#fff',
      '--ai-suggest-bg': 'linear-gradient(135deg, #FDF8F0, #F5EDE0)',
      '--ai-suggest-text': '#8B7355',
      '--ai-suggest-border': '#E8DCC8',
      '--ai-suggest-shadow': '0 2px 8px rgba(139,115,85,0.08)',
      '--ai-suggest-hover-bg': 'linear-gradient(135deg, #F5EDE0, #EDE0CC)',
      '--ai-suggest-hover-shadow': '0 4px 14px rgba(139,115,85,0.18)'
    }
  },
  warm: {
    label: '暖黄活力',
    colors: ['#FCD34D', '#FEF3C7'],
    vars: {
      '--ai-header-gradient': 'linear-gradient(135deg, #FEF3C7, #FDE68A)',
      '--ai-header-text': '#78350F',
      '--ai-header-tag-bg': 'rgba(120,53,15,0.12)',
      '--ai-fab-gradient': 'linear-gradient(135deg, #FCD34D, #F59E0B)',
      '--ai-fab-shadow': '0 8px 28px rgba(245,158,11,0.45)',
      '--ai-user-bubble-bg': 'linear-gradient(135deg, #FEF3C7, #FDE68A)',
      '--ai-user-bubble-text': '#78350F',
      '--ai-user-bubble-border': '#FDE68A',
      '--ai-user-avatar': 'linear-gradient(135deg, #FCD34D, #F59E0B)',
      '--ai-user-avatar-shadow': '0 4px 16px rgba(245,158,11,0.45)',
      '--ai-ai-avatar': 'linear-gradient(135deg, #FCD34D, #F59E0B)',
      '--ai-ai-avatar-text': '#fff',
      '--ai-suggest-bg': 'linear-gradient(135deg, #FEF3C7, #FDE68A)',
      '--ai-suggest-text': '#78350F',
      '--ai-suggest-border': '#FDE68A',
      '--ai-suggest-shadow': '0 2px 8px rgba(245,158,11,0.12)',
      '--ai-suggest-hover-bg': 'linear-gradient(135deg, #FDE68A, #FCD34D)',
      '--ai-suggest-hover-shadow': '0 4px 14px rgba(245,158,11,0.25)'
    }
  },
  mint: {
    label: '薄荷清新',
    colors: ['#A7F3D0', '#6EE7B7'],
    vars: {
      '--ai-header-gradient': 'linear-gradient(135deg, #D1FAE5, #A7F3D0)',
      '--ai-header-text': '#065F46',
      '--ai-header-tag-bg': 'rgba(6,95,70,0.12)',
      '--ai-fab-gradient': 'linear-gradient(135deg, #A7F3D0, #6EE7B7)',
      '--ai-fab-shadow': '0 8px 28px rgba(52,211,153,0.45)',
      '--ai-user-bubble-bg': 'linear-gradient(135deg, #D1FAE5, #A7F3D0)',
      '--ai-user-bubble-text': '#065F46',
      '--ai-user-bubble-border': '#6EE7B7',
      '--ai-user-avatar': 'linear-gradient(135deg, #A7F3D0, #34D399)',
      '--ai-user-avatar-shadow': '0 4px 16px rgba(52,211,153,0.45)',
      '--ai-ai-avatar': 'linear-gradient(135deg, #A7F3D0, #34D399)',
      '--ai-ai-avatar-text': '#fff',
      '--ai-suggest-bg': 'linear-gradient(135deg, #D1FAE5, #A7F3D0)',
      '--ai-suggest-text': '#065F46',
      '--ai-suggest-border': '#6EE7B7',
      '--ai-suggest-shadow': '0 2px 8px rgba(52,211,153,0.12)',
      '--ai-suggest-hover-bg': 'linear-gradient(135deg, #A7F3D0, #6EE7B7)',
      '--ai-suggest-hover-shadow': '0 4px 14px rgba(52,211,153,0.25)'
    }
  },
  sakura: {
    label: '樱花浪漫',
    colors: ['#FBCFE8', '#F9A8D4'],
    vars: {
      '--ai-header-gradient': 'linear-gradient(135deg, #FCE7F3, #FBCFE8)',
      '--ai-header-text': '#9D174D',
      '--ai-header-tag-bg': 'rgba(157,23,77,0.12)',
      '--ai-fab-gradient': 'linear-gradient(135deg, #FBCFE8, #F9A8D4)',
      '--ai-fab-shadow': '0 8px 28px rgba(244,114,182,0.45)',
      '--ai-user-bubble-bg': 'linear-gradient(135deg, #FCE7F3, #FBCFE8)',
      '--ai-user-bubble-text': '#9D174D',
      '--ai-user-bubble-border': '#F9A8D4',
      '--ai-user-avatar': 'linear-gradient(135deg, #FBCFE8, #F472B6)',
      '--ai-user-avatar-shadow': '0 4px 16px rgba(244,114,182,0.45)',
      '--ai-ai-avatar': 'linear-gradient(135deg, #FBCFE8, #F472B6)',
      '--ai-ai-avatar-text': '#fff',
      '--ai-suggest-bg': 'linear-gradient(135deg, #FCE7F3, #FBCFE8)',
      '--ai-suggest-text': '#9D174D',
      '--ai-suggest-border': '#F9A8D4',
      '--ai-suggest-shadow': '0 2px 8px rgba(244,114,182,0.12)',
      '--ai-suggest-hover-bg': 'linear-gradient(135deg, #FBCFE8, #F9A8D4)',
      '--ai-suggest-hover-shadow': '0 4px 14px rgba(244,114,182,0.25)'
    }
  },
  lavender: {
    label: '薰衣草紫',
    colors: ['#DDD6FE', '#C4B5FD'],
    vars: {
      '--ai-header-gradient': 'linear-gradient(135deg, #EDE9FE, #DDD6FE)',
      '--ai-header-text': '#4C1D95',
      '--ai-header-tag-bg': 'rgba(76,29,149,0.12)',
      '--ai-fab-gradient': 'linear-gradient(135deg, #DDD6FE, #C4B5FD)',
      '--ai-fab-shadow': '0 8px 28px rgba(139,92,246,0.45)',
      '--ai-user-bubble-bg': 'linear-gradient(135deg, #EDE9FE, #DDD6FE)',
      '--ai-user-bubble-text': '#4C1D95',
      '--ai-user-bubble-border': '#C4B5FD',
      '--ai-user-avatar': 'linear-gradient(135deg, #DDD6FE, #A78BFA)',
      '--ai-user-avatar-shadow': '0 4px 16px rgba(139,92,246,0.45)',
      '--ai-ai-avatar': 'linear-gradient(135deg, #DDD6FE, #A78BFA)',
      '--ai-ai-avatar-text': '#fff',
      '--ai-suggest-bg': 'linear-gradient(135deg, #EDE9FE, #DDD6FE)',
      '--ai-suggest-text': '#4C1D95',
      '--ai-suggest-border': '#C4B5FD',
      '--ai-suggest-shadow': '0 2px 8px rgba(139,92,246,0.12)',
      '--ai-suggest-hover-bg': 'linear-gradient(135deg, #DDD6FE, #C4B5FD)',
      '--ai-suggest-hover-shadow': '0 4px 14px rgba(139,92,246,0.25)'
    }
  }
};

// 应用主题：预设 key 或自定义对象
function AI_applyTheme(themeKey) {
  const root = document.documentElement;
  let vars;
  if (typeof themeKey === 'string' && AI_THEMES[themeKey]) {
    vars = AI_THEMES[themeKey].vars;
    localStorage.setItem('ai_theme_key', themeKey);
  } else if (themeKey && typeof themeKey === 'object' && themeKey.vars) {
    vars = themeKey.vars;
    localStorage.setItem('ai_theme_key', '__custom__');
    localStorage.setItem('ai_theme_vars', JSON.stringify(themeKey.vars));
  } else {
    // 恢复自定义
    const saved = localStorage.getItem('ai_theme_vars');
    if (saved) {
      try { vars = JSON.parse(saved); localStorage.setItem('ai_theme_key', '__custom__'); }
      catch { vars = AI_THEMES.beige.vars; localStorage.setItem('ai_theme_key', 'beige'); }
    } else {
      vars = AI_THEMES.beige.vars; localStorage.setItem('ai_theme_key', 'beige');
    }
  }
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
}

// 初始化加载主题
(function AI_initTheme() {
  try {
    const saved = localStorage.getItem('ai_theme_key');
    if (saved === '__custom__') {
      const vars = localStorage.getItem('ai_theme_vars');
      if (vars) { try { AI_applyTheme({ vars: JSON.parse(vars) }); return; } catch {} }
    } else if (saved && AI_THEMES[saved]) {
      AI_applyTheme(saved); return;
    }
    AI_applyTheme('beige'); // 默认
  } catch (e) {
    console.error('AI_initTheme error:', e);
  }
})();

// 从单一主色生成一套主题变量（供自定义用）
function AI_themeFromColor(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0,2),16), g = parseInt(h.substring(2,4),16), b = parseInt(h.substring(4,6),16);
  const toHex = (c) => '#' + Math.max(0, Math.min(255, c)).toString(16).padStart(2,'0');
  const lighten = (c, k) => c + Math.round((255 - c) * k);
  const darken = (c, k) => Math.round(c * (1 - k));
  const main = toHex(r, g, b);
  const light = toHex(lighten(r, 0.35), lighten(g, 0.35), lighten(b, 0.35));
  const lighter = toHex(lighten(r, 0.55), lighten(g, 0.55), lighten(b, 0.55));
  const pastel = toHex(lighten(r, 0.75), lighten(g, 0.75), lighten(b, 0.75));
  const dark = toHex(darken(r, 0.55), darken(g, 0.55), darken(b, 0.55));
  const rgba = (c, a) => `rgba(${parseInt(c.substring(1,3),16)},${parseInt(c.substring(3,5),16)},${parseInt(c.substring(5,7),16)},${a})`;
  return {
    vars: {
      '--ai-header-gradient': `linear-gradient(135deg, ${pastel}, ${lighter})`,
      '--ai-header-text': dark,
      '--ai-header-tag-bg': rgba(main, 0.12),
      '--ai-fab-gradient': `linear-gradient(135deg, ${light}, ${main})`,
      '--ai-fab-shadow': `0 8px 28px ${rgba(main, 0.4)}`,
      '--ai-user-bubble-bg': `linear-gradient(135deg, ${pastel}, ${lighter})`,
      '--ai-user-bubble-text': dark,
      '--ai-user-bubble-border': light,
      '--ai-user-avatar': `linear-gradient(135deg, ${light}, ${main})`,
      '--ai-user-avatar-shadow': `0 4px 16px ${rgba(main, 0.4)}`,
      '--ai-ai-avatar': `linear-gradient(135deg, ${light}, ${main})`,
      '--ai-ai-avatar-text': '#fff',
      '--ai-suggest-bg': `linear-gradient(135deg, ${pastel}, ${lighter})`,
      '--ai-suggest-text': dark,
      '--ai-suggest-border': light,
      '--ai-suggest-shadow': `0 2px 8px ${rgba(main, 0.1)}`,
      '--ai-suggest-hover-bg': `linear-gradient(135deg, ${lighter}, ${light})`,
      '--ai-suggest-hover-shadow': `0 4px 14px ${rgba(main, 0.22)}`
    }
  };
}

// 构建主题选择器 DOM
function AI_buildThemePicker(onPick) {
  const current = localStorage.getItem('ai_theme_key') || 'beige';
  const swatches = U.el('div', { class: 'ai-theme-swatches' });
  Object.entries(AI_THEMES).forEach(([key, t]) => {
    const s = U.el('div', {
      class: 'ai-theme-swatch' + (key === current ? ' active' : ''),
      title: t.label,
      style: 'background: linear-gradient(135deg, ' + t.colors[0] + ', ' + t.colors[1] + ');'
    });
    s.addEventListener('click', () => {
      AI_applyTheme(key);
      // 更新 active 状态
      document.querySelectorAll('.ai-theme-swatch').forEach(x => x.classList.remove('active'));
      s.classList.add('active');
      if (onPick) onPick(key);
    });
    swatches.appendChild(s);
  });
  // 自定义取色器
  const customWrap = U.el('div', { class: 'ai-theme-swatch custom', title: '自选颜色' });
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = '#D4B896';
  // 如果当前是自定义，尝试恢复颜色
  if (current === '__custom__') {
    try {
      const savedVars = JSON.parse(localStorage.getItem('ai_theme_vars') || '{}');
      const m = savedVars['--ai-user-avatar']?.match(/#([A-Fa-f0-9]{6})/);
      if (m) colorInput.value = '#' + m[1];
      customWrap.classList.add('active');
    } catch {}
  }
  colorInput.addEventListener('input', (e) => {
    const theme = AI_themeFromColor(e.target.value);
    AI_applyTheme(theme);
  });
  colorInput.addEventListener('change', (e) => {
    if (onPick) onPick(e.target.value);
  });
  customWrap.appendChild(colorInput);
  swatches.appendChild(customWrap);

  return U.el('div', { class: 'ai-theme-picker' }, [
    U.el('div', { class: 'ai-theme-picker-label', text: '🎨 主题' }),
    swatches
  ]);
}

// ===== AI 头像系统 =====
// 预设头像库（emoji），用户和 AI 各自一套
const AI_AVATAR_LIB = {
  ai:    ['🤖','🐱','🐰','🐻','🐼','🦊','🐨','🐯','🐸','🦄','🐙','🦋','🌈','⭐','🌟','💫'],
  user:  ['👤','🧑','👨','👩','🧒','👦','👧','🧑‍💻','🧑‍🎨','🧑‍🚀','🧑‍🏫','🧑‍🍳','🦸','🧙','🧚','😎']
};

// 头像存储结构: localStorage.ai_avatar = { ai: {emoji, img}, user: {emoji, img} }
function AI_getAvatars() {
  try {
    const raw = localStorage.getItem('ai_avatar');
    if (raw) return JSON.parse(raw);
  } catch {}
  return { ai: { emoji: '🤖', img: null }, user: { emoji: '👤', img: null } };
}
function AI_saveAvatars(data) {
  localStorage.setItem('ai_avatar', JSON.stringify(data));
}
function AI_setAvatar(role, emojiOrImg) {
  const data = AI_getAvatars();
  if (typeof emojiOrImg === 'string' && emojiOrImg.startsWith('data:')) {
    data[role] = { emoji: '', img: emojiOrImg };
  } else {
    data[role] = { emoji: emojiOrImg, img: null };
  }
  AI_saveAvatars(data);
}

// 渲染头像元素：有图片就 <img>，否则 emoji
function AI_renderAvatar(role) {
  const a = AI_getAvatars()[role];
  const el = U.el('div', { class: 'chat-avatar' });
  if (a && a.img) {
    const img = document.createElement('img');
    img.src = a.img;
    img.alt = role;
    el.appendChild(img);
  } else {
    el.textContent = (a && a.emoji) || (role === 'user' ? '我' : '🤖');
  }
  return el;
}

// 头像选择器（emoji 网格 + 上传按钮）
function AI_buildAvatarPicker(role) {
  const data = AI_getAvatars();
  const current = data[role];
  const isUser = role === 'user';
  const label = isUser ? '👤 我的头像' : '🤖 AI 头像';
  const lib = AI_AVATAR_LIB[role];

  // 当前激活的 emoji（无图片时）
  const activeKey = current && current.img ? null : (current && current.emoji) || null;

  const grid = U.el('div', { class: 'ai-avatar-grid' });
  lib.forEach(em => {
    const active = !current.img && activeKey === em;
    const btn = U.el('button', {
      class: 'ai-avatar-cell' + (active ? ' active' : ''),
      text: em,
      title: em
    });
    btn.addEventListener('click', () => {
      AI_setAvatar(role, em);
      // 更新 active 状态
      grid.querySelectorAll('.ai-avatar-cell').forEach(x => x.classList.remove('active'));
      btn.classList.add('active');
      // 刷新当前头像预览标记
      const preview = wrap.querySelector('.ai-avatar-current');
      if (preview) {
        preview.innerHTML = '';
        preview.appendChild(AI_renderAvatar(role));
      }
      Toast.ok('头像已更新');
    });
    grid.appendChild(btn);
  });

  // 上传按钮
  const uploadLabel = document.createElement('label');
  uploadLabel.className = 'ai-avatar-upload';
  uploadLabel.textContent = '📷 上传图片';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target.result;
      AI_setAvatar(role, base64);
      // 刷新 active 状态（清掉 emoji 的 active）
      grid.querySelectorAll('.ai-avatar-cell').forEach(x => x.classList.remove('active'));
      const preview = wrap.querySelector('.ai-avatar-current');
      if (preview) {
        preview.innerHTML = '';
        preview.appendChild(AI_renderAvatar(role));
      }
      Toast.ok('图片已上传');
    };
    reader.readAsDataURL(file);
  });
  uploadLabel.appendChild(fileInput);

  // 清除自定义图片按钮
  const clearBtn = U.el('button', { class: 'ai-avatar-clear', text: '✕ 清除图片' });
  clearBtn.addEventListener('click', () => {
    if (!current || !current.img) { Toast.show('当前没有自定义图片'); return; }
    AI_setAvatar(role, lib[0]); // 回退到第一个 emoji
    grid.querySelectorAll('.ai-avatar-cell').forEach(x => x.classList.remove('active'));
    const first = grid.querySelector('.ai-avatar-cell');
    if (first) first.classList.add('active');
    const preview = wrap.querySelector('.ai-avatar-current');
    if (preview) {
      preview.innerHTML = '';
      preview.appendChild(AI_renderAvatar(role));
    }
    Toast.ok('已恢复 emoji');
  });

  // 左侧当前头像预览 + 右侧选择区
  const preview = U.el('div', { class: 'ai-avatar-current' });
  preview.appendChild(AI_renderAvatar(role));

  const wrap = U.el('div', { class: 'ai-avatar-picker' }, [
    U.el('div', { class: 'ai-avatar-picker-label', text: label }),
    U.el('div', { class: 'ai-avatar-picker-body' }, [
      U.el('div', { class: 'ai-avatar-preview-wrap' }, [
        U.el('div', { class: 'ai-avatar-preview-title', text: '当前' }),
        preview,
        uploadLabel,
        clearBtn
      ]),
      grid
    ])
  ]);
  return wrap;
}

// ===== 简单 Markdown 渲染（支持表格、加粗、列表、代码块、行内代码、标题、换行） =====
function simpleMd(text) {
  if (!text) return '';
  let html = text;

  // 1. 代码块 ```...```
  html = html.replace(/```([\s\S]*?)```/g, (m, code) => {
    return '<pre class="md-pre"><code>' + code.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</code></pre>';
  });

  // 2. 表格：|col1|col2| 形式
  html = html.replace(/(\|.*\|\n)(\|[-| :]+\|\n)?((?:\|.*\|\n?)+)/g, (m, header, sep, body) => {
    const parseRow = (row) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
    const headCells = parseRow(header);
    const bodyRows = body.split('\n').filter(r => r.trim().startsWith('|') && r.trim()).map(parseRow);
    let table = '<table class="md-table"><thead><tr>';
    headCells.forEach(c => table += '<th>' + c + '</th>');
    table += '</tr></thead><tbody>';
    bodyRows.forEach(row => {
      table += '<tr>';
      row.forEach(c => table += '<td>' + c + '</td>');
      table += '</tr>';
    });
    table += '</tbody></table>';
    return table;
  });

  // 3. ### 三级标题
  html = html.replace(/###\s+(.*)/g, '<div class="md-h3">$1</div>');

  // 4. **加粗**
  html = html.replace(/\*\*(.*?)\*\*/g, '<span class="md-strong">$1</span>');

  // 5. - 无序列表（逐行处理，连续 - 开头的行合并成 ul）
  const lines = html.split('\n');
  let result = [];
  let listBuffer = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*[-*]\s+/.test(line)) {
      listBuffer.push(line.replace(/^\s*[-*]\s+/, ''));
    } else {
      if (listBuffer.length) {
        result.push('<ul class="md-list">' + listBuffer.map(x => '<li>' + x + '</li>').join('') + '</ul>');
        listBuffer = [];
      }
      result.push(line);
    }
  }
  if (listBuffer.length) {
    result.push('<ul class="md-list">' + listBuffer.map(x => '<li>' + x + '</li>').join('') + '</ul>');
  }
  html = result.join('\n');

  // 6. 行内代码 `code`
  html = html.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>');

  // 7. 换行 \n → <br>（但保留已处理为块级元素的换行）
  html = html.split('\n').map(line => {
    const trimmed = line.trim();
    if (!trimmed) return '';
    // 跳过已经是块级元素开头/结尾的行
    if (trimmed.startsWith('<table') || trimmed.startsWith('</table') ||
        trimmed.startsWith('<thead') || trimmed.startsWith('</thead') ||
        trimmed.startsWith('<tbody') || trimmed.startsWith('</tbody') ||
        trimmed.startsWith('<tr') || trimmed.startsWith('</tr') ||
        trimmed.startsWith('<th') || trimmed.startsWith('</th') ||
        trimmed.startsWith('<td') || trimmed.startsWith('</td') ||
        trimmed.startsWith('<ul') || trimmed.startsWith('</ul') ||
        trimmed.startsWith('<li') || trimmed.startsWith('</li') ||
        trimmed.startsWith('<pre') || trimmed.startsWith('</pre') ||
        trimmed.startsWith('<div class="md-h3') || trimmed.startsWith('<code class="md-code')) {
      return line;
    }
    return line.replace(/\n/g, '<br>');
  }).join('\n');
  // 清理多余空行
  html = html.replace(/\n{2,}/g, '\n');
  html = html.replace(/<br>\s*\n\s*<br>/g, '<br><br>');

  return html.trim();
}

// ===== 通用渲染：AI 消息元素 =====
function renderChatMsg(msg) {
  const cls = msg.role === 'user' ? 'user' : msg.role === 'assistant' ? 'assistant' : 'error';
  // AI 消息用 Markdown 渲染，其他保持纯文本
  const bubbleAttr = msg.role === 'assistant'
    ? { class: 'chat-bubble', html: simpleMd(msg.content) }
    : { class: 'chat-bubble', text: msg.content };
  const roleKey = msg.role === 'user' ? 'user' : 'ai';
  return U.el('div', { class: 'chat-msg ' + cls }, [
    AI_renderAvatar(roleKey),
    U.el('div', {}, [
      U.el('div', bubbleAttr),
      msg.role === 'assistant' ? U.el('div', { class: 'chat-actions' }, [
        U.el('button', { class: 'chat-action-btn', text: '📋 复制', onclick: () => { navigator.clipboard.writeText(msg.content); Toast.ok('已复制'); } }),
        U.el('button', { class: 'chat-action-btn', text: '🗑 删除', onclick: () => { DBpurge('aiMsgs', msg.id); Toast.ok('已删除'); } })
      ]) : null
    ])
  ]);
}
function renderTyping() {
  return U.el('div', { class: 'chat-msg assistant', id: 'typing-indicator' }, [
    AI_renderAvatar('ai'),
    U.el('div', { class: 'chat-bubble typing' }, [U.el('span'), U.el('span'), U.el('span')])
  ]);
}

// ============ 模块：AI 对话（侧边栏路由） ============
registerRoute('ai', async (root) => {
  root.innerHTML = '';
  const convListEl = U.el('div', { class: 'ai-conv-list' }, [
    U.el('div', { class: 'ai-conv-header', text: '对话列表' }),
    U.el('div', { class: 'ai-conv-new' }, [
      U.el('button', { class: 'ai-conv-new-btn', text: '＋ 新对话', onclick: async () => {
        const conv = await AI_newConv();
        await navigateToConv(conv.id);
      }})
    ]),
    U.el('div', { class: 'ai-conv-items', id: 'ai-conv-items' })
  ]);

  const chatArea = U.el('div', { class: 'ai-page', style: 'flex:1;border-radius:12px;' });

  root.appendChild(U.el('div', { style: 'display:flex;gap:0;height:calc(100vh - 108px);' }, [convListEl, chatArea]));

  let activeConvId = null;

  async function renderConvList() {
    const wrap = convListEl.querySelector('#ai-conv-items');
    wrap.innerHTML = '';
    const convs = await AI_listConvs();
    if (convs.length === 0) {
      wrap.appendChild(U.el('div', { class: 'empty', text: '还没有对话' }));
      return;
    }
    convs.forEach(c => {
      const msgs = AI_getMsgs(c.id).catch(() => []);
      const item = U.el('div', { class: 'ai-conv-item' + (c.id === activeConvId ? ' active' : ''), onclick: () => navigateToConv(c.id) }, [
        U.el('div', { class: 'ai-conv-title', text: c.title || '新对话' }),
        U.el('div', { class: 'ai-conv-time', text: U.fmtDateTime(c.lastMsgAt || c.createdAt) }),
        U.el('button', { class: 'btn-icon', title: '删除对话', style: 'position:absolute;right:4px;top:8px;width:24px;height:24px;font-size:12px;', onclick: (e) => {
          e.stopPropagation();
          Modal.confirm('删除对话', '连同全部消息一起删除？', async () => {
            await AI_deleteConv(c.id);
            if (activeConvId === c.id) activeConvId = null;
            await renderConvList();
            renderEmpty();
          }, '删除', '取消', true);
        }}, '🗑️')
      ]);
      item.style.position = 'relative';
      wrap.appendChild(item);
    });
  }

  function renderEmpty() {
    chatArea.innerHTML = '';
    const cfg = Config.get('global', Config.defaults);
    const aiCfg = cfg.ai || Config.defaults.ai;
    const needSetup = !aiCfg.apiKey;
    chatArea.appendChild(U.el('div', { class: 'ai-empty', style: 'height:100%;' }, [
      U.el('div', { class: 'ai-empty-icon', text: '🤖' }),
      U.el('div', { class: 'ai-empty-text', text: needSetup ? '请先到「数据与设置」配置 AI API' : '点击左侧「新对话」开始聊天' }),
      U.el('div', { class: 'ai-empty-hint', text: '支持豆包 / 通义千问 / 文心一言 / 自定义代理' })
    ]));
  }

  async function navigateToConv(convId) {
    activeConvId = convId;
    await renderConvList();
    await renderConv();
  }

  async function renderConv() {
    chatArea.innerHTML = '';
    if (!activeConvId) { renderEmpty(); return; }
    const conv = await DBget('aiConvs', activeConvId);
    if (!conv) { renderEmpty(); return; }
    const cfg = Config.get('global', Config.defaults);
    const aiCfg = cfg.ai || Config.defaults.ai;
    const provider = AI_PROVIDERS[conv.provider] || AI_PROVIDERS[aiCfg.provider] || AI_PROVIDERS.doubao;

    // Header
    const header = U.el('div', { class: 'ai-page-header' }, [
      U.el('div', { class: 'ai-page-title' }, [
        U.el('span', { text: '🤖 ' + conv.title }),
        U.el('span', { class: 'ai-provider-tag', text: provider.label.split(' ')[0] + ' · ' + (conv.model || '') })
      ]),
      U.el('div', { class: 'ai-actions' }, [
        U.el('button', { class: 'btn btn-ghost btn-sm', text: '🗑 清空对话', onclick: () => {
          Modal.confirm('清空对话', '保留对话，只清空消息？', async () => {
            const msgs = await AI_getMsgs(activeConvId);
            for (const m of msgs) await DBpurge('aiMsgs', m.id);
            Toast.ok('已清空'); renderConv();
          });
        }})
      ])
    ]);

    // Body
    const body = U.el('div', { class: 'ai-page-body' });
    const msgs = await AI_getMsgs(activeConvId);
    if (msgs.length === 0) {
      const SUGGESTS = [
        '帮我制定一个今日计划',
        '写一篇健身计划模板',
        '分析如何提高工作效率',
        '生成一周的饮食安排'
      ];
      const suggestBtns = U.el('div', { class: 'ai-suggest-list' },
        SUGGESTS.map(s => U.el('button', { class: 'ai-suggest-item', text: s, onclick: () => {
          ta.value = s; send();
        }}))
      );
      body.appendChild(U.el('div', { class: 'ai-welcome' }, [
        U.el('h3', { text: '👋 你好，我是你的 AI 助手' }),
        U.el('p', { text: '我可以帮你整理思路、写文案、解答问题，或者直接帮你生成计划～' }),
        suggestBtns,
        AI_buildThemePicker(),
        AI_buildAvatarPicker('ai'),
        AI_buildAvatarPicker('user')
      ]));
    } else {
      msgs.forEach(m => body.appendChild(renderChatMsg(m)));
    }
    setTimeout(() => body.scrollTop = body.scrollHeight, 0);

    // Input
    const ta = U.el('textarea', { placeholder: '输入消息，Enter 发送，Shift+Enter 换行...', rows: 2 });
    const sendBtn = U.el('button', { class: 'btn btn-primary', text: '发送' });
    const inputWrap = U.el('div', { class: 'ai-page-input-wrap' }, [ta, sendBtn]);

    async function send() {
      const text = ta.value.trim();
      if (!text) return;
      ta.value = '';
      if (!aiCfg.apiKey) { Toast.err('请先到设置里填写 API Key'); return; }

      await AI_addMsg(activeConvId, 'user', text);
      body.appendChild(renderChatMsg({ role: 'user', content: text }));
      body.scrollTop = body.scrollHeight;

      const typingEl = renderTyping();
      body.appendChild(typingEl);
      body.scrollTop = body.scrollHeight;

      // 取历史（去掉 system / error）
      const allMsgs = await AI_getMsgs(activeConvId);
      const history = allMsgs.filter(m => m.role === 'user' || m.role === 'assistant').slice(-20);

      try {
        const messages = AI.buildMessages(conv.systemPrompt || aiCfg.systemPrompt, history, text);
        const reply = await AI.chat(messages);
        await AI_addMsg(activeConvId, 'assistant', reply);
        typingEl.remove();
        body.appendChild(renderChatMsg({ role: 'assistant', content: reply }));
      } catch (err) {
        typingEl.remove();
        body.appendChild(renderChatMsg({ role: 'error', content: '⚠️ ' + err.message }));
      }
      body.scrollTop = body.scrollHeight;
      await renderConvList();
    }

    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    ta.addEventListener('input', () => {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
    });
    sendBtn.addEventListener('click', send);

    chatArea.appendChild(header);
    chatArea.appendChild(body);
    chatArea.appendChild(inputWrap);
    ta.focus();
  }

  await renderConvList();
  renderEmpty();

  // 自动进入第一个对话
  const convs = await AI_listConvs();
  if (convs.length > 0) navigateToConv(convs[0].id);
}, 'AI 对话');

// ============ 模块：AI 浮动球快捷对话 ============
(function setupFloatingAI() {
  const fab = document.getElementById('ai-fab');
  const panel = document.getElementById('ai-quick-panel');
  const closeBtn = document.getElementById('ai-quick-close');
  const body = document.getElementById('ai-quick-body');
  const input = document.getElementById('ai-quick-input');
  const sendBtn = document.getElementById('ai-quick-send');

  let quickHistory = [];
  let loading = false;
  let isDragging = false;

  // ===== 拖拽逻辑 =====
  function restoreFabPosition() {
    if (!fab) return;
    try {
      const pos = JSON.parse(localStorage.getItem('ai_fab_pos') || 'null');
      if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
        fab.style.right = 'auto';
        fab.style.bottom = 'auto';
        fab.style.left = pos.x + 'px';
        fab.style.top = pos.y + 'px';
      }
    } catch {}
  }
  restoreFabPosition();

  function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

  fab?.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    isDragging = false;
    fab.setPointerCapture(e.pointerId);
    const startX = e.clientX, startY = e.clientY;
    const rect = fab.getBoundingClientRect();
    const offsetX = startX - rect.left;
    const offsetY = startY - rect.top;
    const move = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) isDragging = true;
      if (!isDragging) return;
      const vw = window.innerWidth, vh = window.innerHeight;
      const size = rect.width;
      const x = clamp(ev.clientX - offsetX, 0, vw - size);
      const y = clamp(ev.clientY - offsetY, 0, vh - size);
      fab.style.right = 'auto';
      fab.style.bottom = 'auto';
      fab.style.left = x + 'px';
      fab.style.top = y + 'px';
      ev.preventDefault();
    };
    const up = () => {
      fab.removeEventListener('pointermove', move);
      fab.removeEventListener('pointerup', up);
      fab.removeEventListener('pointercancel', up);
      if (isDragging) {
        const r = fab.getBoundingClientRect();
        localStorage.setItem('ai_fab_pos', JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) }));
      }
    };
    fab.addEventListener('pointermove', move);
    fab.addEventListener('pointerup', up);
    fab.addEventListener('pointercancel', up);
  });

  // ===== 点击打开（拖拽后不触发）=====
  fab?.addEventListener('click', (e) => {
    if (isDragging) { isDragging = false; return; }
    togglePanel();
  });

  function togglePanel() {
    const hidden = panel.style.display === 'none';
    panel.style.display = hidden ? 'flex' : 'none';
    if (hidden && body.children.length === 0) renderQuickWelcome();
    if (hidden) setTimeout(() => input.focus(), 100);
  }
  function renderQuickWelcome() {
    const SUGGESTS = [
      '帮我制定一个今日计划',
      '写一篇健身计划模板',
      '生成一周的饮食安排'
    ];
    body.appendChild(U.el('div', { class: 'ai-welcome' }, [
      U.el('h3', { text: '🤖 AI 快捷对话' }),
      U.el('p', { text: '问什么都行，Enter 发送' }),
      U.el('div', { class: 'ai-suggest-list' },
        SUGGESTS.map(s => U.el('button', { class: 'ai-suggest-item', text: s, onclick: () => {
          input.value = s; sendQuick();
        }}))
      ),
      AI_buildThemePicker(),
      AI_buildAvatarPicker('ai'),
      AI_buildAvatarPicker('user')
    ]));
  }
  function renderQuickMsg(msg) {
    body.appendChild(renderChatMsg(msg));
    body.scrollTop = body.scrollHeight;
  }

  closeBtn?.addEventListener('click', () => panel.style.display = 'none');
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendQuick(); }
  });
  sendBtn?.addEventListener('click', sendQuick);

  async function sendQuick() {
    if (loading) return;
    const text = input.value.trim();
    if (!text) return;
    const cfg = Config.get('global', Config.defaults);
    const aiCfg = cfg.ai || Config.defaults.ai;
    if (!aiCfg.apiKey) { Toast.err('请先到 AI 设置里填 API Key'); return; }

    input.value = '';
    quickHistory.push({ role: 'user', content: text });
    renderQuickMsg({ role: 'user', content: text });

    const typingEl = renderTyping();
    body.appendChild(typingEl);
    body.scrollTop = body.scrollHeight;
    loading = true;

    try {
      const messages = AI.buildMessages(aiCfg.systemPrompt, quickHistory.slice(-20).slice(0, -1), text);
      const reply = await AI.chat(messages);
      quickHistory.push({ role: 'assistant', content: reply });
      typingEl.remove();
      renderQuickMsg({ role: 'assistant', content: reply });
    } catch (err) {
      typingEl.remove();
      renderQuickMsg({ role: 'error', content: '⚠️ ' + err.message });
    }
    loading = false;
  }
})();

// ============ 提醒检查 ============
async function checkDeadlines() {
  if (!Config.get('global', Config.defaults).notifyEnabled) return;
  if (Notification.permission !== 'granted') return;
  const now = Date.now();
  const all = [
    ...(await DBgetAll('todos')).filter(t => t.deadline && !t.done),
    ...(await DBgetAll('consult')).filter(c => c.nextFollow && c.status !== 'done'),
    ...(await DBgetAll('media')).filter(m => m.planPublish && !m.published)
  ];
  const NOTIFIED_KEY = 'notified_deadlines';
  const notified = JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '{}');
  all.forEach(item => {
    const dl = new Date(item.deadline || item.nextFollow || item.planPublish).getTime();
    const key = item.id;
    if (!notified[key] && dl - now <= 30 * 60 * 1000 && dl > now) {
      const store = item._store || (item.nextFollow ? '咨询' : (item.planPublish ? '自媒体' : '今日计划'));
      new Notification('⏰ 即将到期 · ' + store, { body: item.title || item.name, icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48dGV4dCB4PSI1MCIgeT0iNTUiIGZvbnQtc2l6ZT0iNTAiIHRleHQtYW5jaG9yPSJtaWRkbGUiPuWbvueIsSB0ZXh0Pjxzdmc+' });
      notified[key] = true;
    }
  });
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify(notified));
}

// ============ 模块：个人中心 ============
registerRoute('profile', async (root) => {
  root.innerHTML = '';

  const profile = getProfile();
  const stats = await getStats();

  // 头像卡片
  const avatarEl = U.el('div', { class: 'profile-avatar-large' }, profile.avatar);
  const nameEl = U.el('div', { class: 'profile-name' }, profile.nickname);
  const bioEl = U.el('div', { class: 'profile-bio' }, profile.bio || '这个人很懒，什么都没留下');
  const metaEl = U.el('div', { class: 'profile-meta' }, [
    U.el('span', {}, '📅 加入于 ' + profile.createdAt),
    U.el('span', {}, '🆔 ' + profile.id)
  ]);
  const editBtn = U.el('button', { class: 'btn btn-primary btn-sm profile-edit-btn', onclick: () => showEditDialog() }, '✏️ 编辑资料');

  const profileCard = U.el('div', { class: 'dashboard-card profile-card' }, [
    U.el('div', { class: 'profile-avatar-wrap' }, [avatarEl]),
    nameEl, bioEl, metaEl, editBtn
  ]);

  // 统计卡片
  const statGrid = U.el('div', { class: 'stat-grid' }, [
    statItem('📋', stats.totalTasks, '任务总数'),
    statItem('✅', stats.doneTasks, '已完成'),
    statItem('🔥', stats.urgentTasks, '紧急任务'),
    statItem('📆', stats.streakDays, '连续打卡'),
    statItem('🤖', stats.aiConvs, 'AI 对话'),
    statItem('📝', stats.notes, '笔记数')
  ]);
  const statsCard = U.el('div', { class: 'dashboard-card' }, [
    U.el('div', { class: 'card-head' }, [U.el('h3', {}, '📊 数据统计')]),
    statGrid
  ]);

  // 快捷操作
  const actions = U.el('div', { class: 'dashboard-card' }, [
    U.el('div', { class: 'card-head' }, [U.el('h3', {}, '⚡ 快捷操作')]),
    U.el('div', { class: 'profile-action-grid' }, [
      actionItem('📤', '导出数据', () => exportData()),
      actionItem('📥', '导入数据', () => importData()),
      actionItem('💾', '备份数据', () => exportData()),
      actionItem('🗑️', '重置应用', () => { if (confirm('确定要重置应用吗？\n这将清除所有数据且不可恢复！')) { localStorage.clear(); location.reload(); } })
    ])
  ]);

  root.appendChild(U.el('div', { class: 'profile-layout' }, [profileCard, statsCard, actions]));

  function statItem(icon, num, label) {
    return U.el('div', { class: 'stat-item' }, [
      U.el('div', { class: 'stat-num' }, String(num)),
      U.el('div', { class: 'stat-lbl' }, icon + ' ' + label)
    ]);
  }
  function actionItem(icon, label, onclick) {
    return U.el('div', { class: 'profile-action-item', onclick }, [
      U.el('div', { class: 'action-icon' }, icon),
      U.el('div', { class: 'action-label' }, label)
    ]);
  }
});

// Profile 辅助函数
function getProfile() {
  const raw = localStorage.getItem('personal_profile');
  if (raw) { try { return JSON.parse(raw); } catch {} }
  const profile = {
    id: 'u_' + Date.now().toString(36),
    nickname: '用户' + new Date().getDate(),
    avatar: '👤',
    bio: '',
    createdAt: U.fmtDate(new Date())
  };
  localStorage.setItem('personal_profile', JSON.stringify(profile));
  return profile;
}
function saveProfile(p) { localStorage.setItem('personal_profile', JSON.stringify(p)); }

async function getStats() {
  try {
    const [todos, notes, aiConvs] = await Promise.all([
      DBgetAll('todos').catch(() => []),
      DBgetAll('notes').catch(() => []),
      DBgetAll('aiConvs').catch(() => [])
    ]);
    const totalTasks = todos.length;
    const doneTasks = todos.filter(t => t.status === 'done').length;
    const urgentTasks = todos.filter(t => t.priority === 'high' && t.status !== 'done').length;
    let streakDays = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const dateStr = U.fmtDate(d);
      if (todos.some(t => t.createdAt && U.fmtDate(new Date(t.createdAt)) === dateStr)) streakDays++;
      else if (i > 0) break;
    }
    return { totalTasks, doneTasks, urgentTasks, streakDays, aiConvs: aiConvs.length, notes: notes.length };
  } catch {
    return { totalTasks: 0, doneTasks: 0, urgentTasks: 0, streakDays: 0, aiConvs: 0, notes: 0 };
  }
}

function showEditDialog() {
  const profile = getProfile();
  const avatars = ['👤','😀','😎','🤖','🐱','🐶','🦊','🐼','🦁','🐸','🦄','🐙','🦋','🌟','🔥','💎','🎯','🚀','🎨','🎭'];
  const avHtml = avatars.map(a =>
    `<div class="avatar-option ${a===profile.avatar?'selected':''}" data-avatar="${a}">${a}</div>`
  ).join('');

  const modal = U.el('div', { class: 'modal-backdrop', style: 'display:flex' }, [
    U.el('div', { class: 'modal' }, [
      U.el('div', { class: 'modal-header' }, [
        U.el('div', { class: 'modal-title' }, '编辑个人资料'),
        U.el('button', { class: 'modal-close', onclick: () => modal.remove() }, '✕')
      ]),
      U.el('div', { class: 'modal-body' }, [
        U.el('div', { class: 'form-field' }, [
          U.el('div', { class: 'form-label' }, '昵称'),
          Object.assign(U.el('input', { class: 'form-input', maxlength: '20', id: 'edit-nickname' }), { value: profile.nickname })
        ]),
        U.el('div', { class: 'form-field' }, [
          U.el('div', { class: 'form-label' }, '头像'),
          U.el('div', { class: 'avatar-picker', html: avHtml })
        ]),
        U.el('div', { class: 'form-field' }, [
          U.el('div', { class: 'form-label' }, '个人简介'),
          Object.assign(U.el('textarea', { class: 'form-input', maxlength: '100', style: 'min-height:60px', id: 'edit-bio' }), { value: profile.bio || '' })
        ])
      ]),
      U.el('div', { class: 'modal-footer' }, [
        U.el('div', { class: 'modal-footer-buttons' }, [
          U.el('button', { class: 'btn btn-ghost', onclick: () => modal.remove() }, '取消'),
          U.el('button', { class: 'btn btn-primary', onclick: () => {
            const nickInput = modal.querySelector('#edit-nickname');
            const bioInput = modal.querySelector('#edit-bio');
            const chosen = modal.querySelector('.avatar-option.selected');
            const updated = {
              ...profile,
              nickname: nickInput.value.trim() || profile.nickname,
              avatar: chosen ? chosen.dataset.avatar : profile.avatar,
              bio: bioInput.value.trim()
            };
            saveProfile(updated);
            modal.remove();
            Toast.show('资料已更新', 'ok');
            navigate();
          }}, '保存')
        ])
      ])
    ])
  ]);
  document.body.appendChild(modal);

  // 头像选择交互
  let chosenAvatar = profile.avatar;
  modal.querySelectorAll('.avatar-option').forEach(el => {
    el.addEventListener('click', () => {
      chosenAvatar = el.dataset.avatar;
      modal.querySelectorAll('.avatar-option').forEach(x => x.classList.toggle('selected', x === el));
    });
  });
}

function exportData() {
  const data = {};
  for (const key of Object.keys(localStorage)) data[key] = localStorage.getItem(key);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = '个人工作台_备份_' + U.todayStr() + '.json';
  a.click(); URL.revokeObjectURL(url);
  Toast.show('数据已导出', 'ok');
}

function importData() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (typeof data === 'object') {
        for (const [k, v] of Object.entries(data)) if (typeof v === 'string') localStorage.setItem(k, v);
        Toast.show('数据已导入，请重启应用', 'ok');
      } else Toast.show('文件格式无效', 'err');
    } catch (err) { Toast.show('导入失败：' + err.message, 'err'); }
  };
  input.click();
}

// ============ 启动 ============
async function boot() {
  try {
    await openDB();
  } catch (e1) {
    console.warn('openDB 失败，尝试删除旧 DB 重建:', e1);
    try {
      await resetDBAndRetry();
      Toast.show('数据库已自动修复并重建（旧数据已清空）', 'warn');
    } catch (e2) {
      console.error('重建 DB 也失败', e2);
      document.getElementById('db-status').textContent = '● DB 严重错误: ' + e2.message;
      document.getElementById('db-status').classList.add('err');
      // 降级继续运行（DBgetAll 会返回空数组）
    }
  }

  // localStorage AI 配置校验（清掉脏模型名如 doubao-pro-128k）
  Config.sanitizeAi(AI_PROVIDERS);

  if (DB) {
    document.getElementById('db-status').textContent = '● 数据已持久化';
    document.getElementById('db-status').classList.add('ok');
  }

  // 时钟
  const tick = () => {
    const d = new Date();
    document.getElementById('clock').textContent = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') + ' ' +
      String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0') + ':' + String(d.getSeconds()).padStart(2,'0');
  };
  tick(); setInterval(tick, 1000);

  // 路由
  navigate();

  // 提醒
  checkDeadlines();
  setInterval(checkDeadlines, 60000);
}

window.addEventListener('error', (e) => {
  const detail = [
    'message: ' + (e.message || '(no message)'),
    'filename: ' + (e.filename || '(no filename)'),
    'lineno: ' + (e.lineno ?? '(no lineno)'),
    'colno: ' + (e.colno ?? '(no colno)'),
    'stack: ' + (e.error?.stack || '(no stack)')
  ].join('\n');
  showFatalError('全局错误', detail);
});
window.addEventListener('unhandledrejection', (e) => {
  showFatalError('未处理 Promise', e.reason?.stack || String(e.reason));
});

function showFatalError(title, detail) {
  let panel = document.getElementById('__fatal_error__');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = '__fatal_error__';
    panel.style.cssText = 'position:fixed;z-index:99999;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.85);color:#fff;padding:24px;font-family:monospace;overflow:auto;white-space:pre-wrap;font-size:13px;';
    document.body.appendChild(panel);
  }
  panel.innerHTML = '<h2 style="color:#ff6b6b;margin-bottom:12px;">❌ ' + title + '</h2><div>' + String(detail).slice(0, 3000) + '</div><p style="margin-top:16px;color:#aaa;">请截图发我</p>';
}

// ============ 可爱风格日程中心模块 ============
const CATEGORY_MAP = {
  work: { label: '工作', cls: 'cat-work', icon: '💼', color: '#42A5F5' },
  life: { label: '生活', cls: 'cat-life', icon: '🏠', color: '#EC407A' },
  study: { label: '学习', cls: 'cat-study', icon: '📚', color: '#66BB6A' },
  health: { label: '健康', cls: 'cat-health', icon: '💪', color: '#FFA726' },
  other: { label: '其他', cls: 'cat-other', icon: '✨', color: '#AB47BC' }
};

const CUSTOM_CATEGORIES_KEY = 'custom_categories';

function getCustomCategories() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_CATEGORIES_KEY) || '[]');
  } catch { return []; }
}

function saveCustomCategories(list) {
  localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(list));
}

function getAllCategories() {
  const defaults = [
    { value: 'all', label: '全部分类', icon: '📋', color: '#9E9E9E', isAll: true },
    { value: 'none', label: '无分类', icon: '🚫', color: '#BDBDBD', isNone: true },
    ...Object.entries(CATEGORY_MAP).map(([key, info]) => ({
      value: key, label: info.label, icon: info.icon, color: info.color, isDefault: true
    }))
  ];
  const customs = getCustomCategories().map(c => ({
    value: c.id, label: c.name, icon: c.icon, color: c.color, isCustom: true
  }));
  return [...defaults, ...customs];
}

// 日程中心状态
const ScheduleState = {
  currentDate: new Date(),
  selectedDate: new Date(),
  currentTab: 'schedule',
  currentFilter: 'all',
  statsMainTab: 'plan',
  statsSubTab: 'week',
  statsRange: 'week',
  statsFilter: 'priority',
  focusMode: 'timer',
  focusMinutes: 25,
  focusRemaining: 0,
  focusElapsed: 0,
  focusPlaying: false,
  focusTimer: null,
  focusTotal: 0
};

// 工具：格式化日期为 YYYY-MM-DD
function fmtDate2(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// 生成农历/节气简化显示（用节日替代）
function getLunarDay(d) {
  const key = `${d.getMonth()+1}-${d.getDate()}`;
  const festivals = {
    '1-1': '元旦', '2-14': '情人节', '3-8': '妇女节', '3-12': '植树节',
    '4-1': '愚人节', '5-1': '劳动节', '5-4': '青年节', '6-1': '儿童节',
    '7-1': '建党节', '8-1': '建军节', '9-10': '教师节', '10-1': '国庆',
    '12-25': '圣诞', '2-16': '除夕', '2-17': '春节'
  };
  return festivals[key] || '';
}

// 获取指定日期的任务
async function getTasksForDate(dateStr) {
  const todos = await DBgetAll('todos');
  return todos.filter(t => {
    if (!t.deadline) return false;
    return t.deadline.startsWith(dateStr);
  });
}

// 获取日期范围内的任务
async function getTasksInRange(startDate, endDate) {
  const todos = await DBgetAll('todos');
  return todos.filter(t => {
    if (!t.deadline) return false;
    const dl = t.deadline.slice(0, 10);
    return dl >= startDate && dl <= endDate;
  });
}

// 获取日期范围内的专注数据
async function getFocusData(startDate, endDate) {
  const records = await DBgetAll('focus');
  const inRange = records.filter(r => r.date >= startDate && r.date <= endDate);
  const today = fmtDate2(new Date());
  const todayRecords = records.filter(r => r.date === today);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = fmtDate2(yesterday);
  const yesterdayRecords = records.filter(r => r.date === yesterdayStr);

  const totalPomodoros = inRange.filter(r => r.type === 'pomodoro' && r.completed).length;
  const todayPomodoros = todayRecords.filter(r => r.type === 'pomodoro' && r.completed).length;
  const yesterdayPomodoros = yesterdayRecords.filter(r => r.type === 'pomodoro' && r.completed).length;

  const totalFocusMs = inRange.reduce((sum, r) => sum + (r.duration || 0), 0);
  const todayFocusMs = todayRecords.reduce((sum, r) => sum + (r.duration || 0), 0);
  const yesterdayFocusMs = yesterdayRecords.reduce((sum, r) => sum + (r.duration || 0), 0);

  const catStats = {};
  inRange.forEach(r => {
    const cat = r.category || 'uncategorized';
    if (!catStats[cat]) catStats[cat] = { count: 0, duration: 0 };
    catStats[cat].count++;
    catStats[cat].duration += (r.duration || 0);
  });

  return {
    totalPomodoros,
    todayPomodoros,
    yesterdayPomodoros,
    totalFocusMs,
    todayFocusMs,
    yesterdayFocusMs,
    catStats,
    totalRecords: inRange.length
  };
}

// 渲染月历
function renderCuteCalendar(year, month, selectedDate, onSelect) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const today = new Date();
  const todayStr = fmtDate2(today);
  const selectedStr = fmtDate2(selectedDate);

  const container = U.el('div', { class: 'cute-calendar' });
  
  // 头部
  const header = U.el('div', { class: 'cute-calendar-header' }, [
    U.el('div', { class: 'cute-calendar-nav' }, [
      U.el('button', { onclick: () => { ScheduleState.currentDate = new Date(year, month - 1, 1); renderCalendar(); } }, '‹'),
      U.el('button', { onclick: () => { ScheduleState.currentDate = new Date(year, month + 1, 1); renderCalendar(); } }, '›')
    ]),
    U.el('div', { class: 'cute-calendar-title' }, `${year}年${month + 1}月`),
    U.el('div', { style: 'width:64px' }) // 占位对齐
  ]);
  container.appendChild(header);

  // 星期表头
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const weekHeader = U.el('div', { class: 'cute-calendar-weekdays' });
  weekdays.forEach(w => weekHeader.appendChild(U.el('div', {}, w)));
  container.appendChild(weekHeader);

  // 日期网格
  const daysGrid = U.el('div', { class: 'cute-calendar-days' });
  
  // 上月填充
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startWeekday - 1; i >= 0; i--) {
    const dayEl = U.el('div', { class: 'cute-calendar-day other-month' }, [
      U.el('div', {}, String(prevMonthLastDay - i))
    ]);
    daysGrid.appendChild(dayEl);
  }

  // 当月日期
  const todayTasks = []; // 异步填充
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month, d);
    const dateStr = fmtDate2(dateObj);
    const isToday = dateStr === todayStr;
    const isSelected = dateStr === selectedStr;
    const lunar = getLunarDay(dateObj);
    
    const dayEl = U.el('div', {
      class: `cute-calendar-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`,
      onclick: () => { onSelect(dateObj); }
    }, [
      U.el('div', {}, String(d))
    ]);
    if (lunar) {
      dayEl.appendChild(U.el('div', { class: 'cute-calendar-day-lunar' }, lunar));
    }
    daysGrid.appendChild(dayEl);

    // 检查是否有任务
    getTasksForDate(dateStr).then(tasks => {
      if (tasks.length > 0) {
        dayEl.classList.add('has-tasks');
      }
    });
  }

  // 下月填充
  const totalCells = startWeekday + daysInMonth;
  const remaining = (7 - (totalCells % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    const dayEl = U.el('div', { class: 'cute-calendar-day other-month' }, [
      U.el('div', {}, String(i))
    ]);
    daysGrid.appendChild(dayEl);
  }

  container.appendChild(daysGrid);
  return container;
}

// 日程页面渲染函数（重新渲染日程中心，避免无限递归）
function renderCalendar() {
  const hash = location.hash.replace(/^#\//, '') || 'home';
  const route = hash.split('/')[0];
  if (route !== 'schedule') return;
  const info = ROUTES[route];
  if (!info) return;
  const content = document.getElementById('content');
  if (!content) return;
  // 重新调用日程页面的注册处理器
  info.handler(content).catch(e => {
    console.error(e); Toast.err('渲染出错：' + e.message);
  });
}

// 注册：日程页面
registerRoute('schedule', async (root) => {
  // 绑定悬浮按钮事件
  const fabAdd = document.getElementById('fab-add');
  if (fabAdd) fabAdd.onclick = () => openAddTaskModal();
  
  root.innerHTML = '';
  const app = U.el('div', { class: 'schedule-app' });
  
  // 顶部栏
  const topBar = U.el('div', { class: 'schedule-top-bar' }, [
    U.el('div', { class: 'schedule-menu-btn', onclick: () => { location.hash = '#/home'; } }, '☰'),
    U.el('div', { class: 'schedule-avatar', onclick: () => { location.hash = '#/profile'; } }, '🐰')
  ]);
  app.appendChild(topBar);

  // 标签切换
  const tabBar = U.el('div', { class: 'schedule-tabs' });
  const tabSchedule = U.el('div', { class: 'schedule-tab active', onclick: () => { ScheduleState.currentTab = 'schedule'; updateTabs(); render(); } }, '日程');
  const tabTodo = U.el('div', { class: 'schedule-tab', onclick: () => { ScheduleState.currentTab = 'todo'; updateTabs(); render(); } }, '待办');
  tabBar.appendChild(tabSchedule);
  tabBar.appendChild(tabTodo);
  app.appendChild(tabBar);

  function updateTabs() {
    tabSchedule.classList.toggle('active', ScheduleState.currentTab === 'schedule');
    tabTodo.classList.toggle('active', ScheduleState.currentTab === 'todo');
  }

  // 日期标题
  const dateStr = `${ScheduleState.selectedDate.getFullYear()}.${String(ScheduleState.selectedDate.getMonth()+1).padStart(2,'0')}.${String(ScheduleState.selectedDate.getDate()).padStart(2,'0')}`;
  const header = U.el('div', { class: 'schedule-header' }, [
    U.el('div', { class: 'schedule-date-title' }, dateStr),
    U.el('div', { class: 'schedule-filter-btn', onclick: () => openFilterModal() }, '🏷️ 全部分类 ▸')
  ]);
  app.appendChild(header);

  // 月历
  const calendar = renderCuteCalendar(
    ScheduleState.currentDate.getFullYear(),
    ScheduleState.currentDate.getMonth(),
    ScheduleState.selectedDate,
    (date) => { ScheduleState.selectedDate = date; render(); }
  );
  app.appendChild(calendar);

  // 内容区
  const content = U.el('div', { class: 'schedule-content' });
  app.appendChild(content);

  async function render() {
    content.innerHTML = '';
    const selDateStr = fmtDate2(ScheduleState.selectedDate);
    let tasks = await getTasksForDate(selDateStr);
    
    // 过滤
    if (ScheduleState.currentFilter === 'none') {
      tasks = tasks.filter(t => !t.category || t.category === '');
    } else if (ScheduleState.currentFilter !== 'all') {
      tasks = tasks.filter(t => t.category === ScheduleState.currentFilter);
    }

    if (ScheduleState.currentTab === 'todo') {
      tasks = tasks.filter(t => !t.done);
    }

    if (tasks.length === 0) {
      // 空状态
      const empty = U.el('div', { class: 'cute-empty' }, [
        U.el('div', { class: 'cute-empty-illustration' }, [
          U.el('div', { class: 'cute-empty-bunny' }, '🐰'),
          U.el('div', { class: 'cute-empty-bike' }, '🚲'),
          U.el('div', { style: 'font-size:30px;position:absolute;bottom:10px;right:20px;' }, '🎵')
        ]),
        U.el('div', { class: 'cute-empty-text' }, '今天没有计划哦~'),
        U.el('div', { class: 'cute-empty-hint' }, '点击「＋」创建计划')
      ]);
      content.appendChild(empty);
    } else {
      // 时段分组
      const morning = tasks.filter(t => {
        if (!t.deadline || !t.deadline.includes('T')) return true;
        const h = parseInt(t.deadline.split('T')[1]?.split(':')[0] || '0');
        return h < 12;
      });
      const afternoon = tasks.filter(t => {
        if (!t.deadline || !t.deadline.includes('T')) return false;
        const h = parseInt(t.deadline.split('T')[1]?.split(':')[0] || '0');
        return h >= 12 && h < 18;
      });
      const evening = tasks.filter(t => {
        if (!t.deadline || !t.deadline.includes('T')) return false;
        const h = parseInt(t.deadline.split('T')[1]?.split(':')[0] || '0');
        return h >= 18;
      });

      const sections = [];
      if (ScheduleState.currentTab === 'schedule') {
        if (morning.length > 0) sections.push({ title: '🌅 上午', tasks: morning });
        if (afternoon.length > 0) sections.push({ title: '☀️ 下午', tasks: afternoon });
        if (evening.length > 0) sections.push({ title: '🌙 晚上', tasks: evening });
      }
      const unscheduled = tasks.filter(t => !t.deadline || !t.deadline.includes('T'));
      if (unscheduled.length > 0) sections.push({ title: '📝 未定时', tasks: unscheduled });

      sections.forEach(sec => {
        const secTitle = U.el('div', { class: 'schedule-section-title' }, [
          U.el('span', {}, sec.title),
          U.el('span', { class: 'schedule-section-count' }, `${sec.tasks.length} 项`)
        ]);
        content.appendChild(secTitle);

        const list = U.el('div', { class: 'cute-task-list' });
        sec.tasks.forEach(task => {
          const card = createTaskCard(task);
          list.appendChild(card);
        });
        content.appendChild(list);
      });
    }
  }

  function createTaskCard(task) {
    const priority = task.priority || 'mid';
    const catInfo = CATEGORY_MAP[task.category];
    const catColor = catInfo ? catInfo.cls : 'cat-other';
    const catLabel = catInfo ? catInfo.label : (() => {
      const custom = getCustomCategories().find(c => c.id === task.category);
      return custom ? custom.name : '未分类';
    })();
    const catIcon = catInfo ? catInfo.icon : (() => {
      const custom = getCustomCategories().find(c => c.id === task.category);
      return custom ? custom.icon : '📋';
    })();
    const deadlineText = task.deadline ? (task.deadline.includes('T') ? task.deadline.split('T')[1].slice(0,5) : '') : '';
    
    const card = U.el('div', {
      class: `cute-task-card priority-${priority} ${task.done ? 'done' : ''}`,
      onclick: () => openAddTaskModal(task)
    }, [
      U.el('div', {
        class: `cute-task-check ${task.done ? 'checked' : ''}`,
        onclick: (e) => { e.stopPropagation(); task.done = !task.done; DBput('todos', task).then(render); }
      }),
      U.el('div', { class: 'cute-task-body' }, [
        U.el('div', { class: 'cute-task-title' }, task.title || '未命名任务'),
        U.el('div', { class: 'cute-task-meta' }, [
          U.el('span', { class: `category-tag ${catColor}` }, `${catIcon} ${catLabel}`),
          deadlineText ? U.el('span', { class: 'cute-task-deadline' }, `⏰ ${deadlineText}`) : null,
          task.priority === 'high' ? U.el('span', { class: 'category-tag cat-work' }, '🔴 高优') : null
        ].filter(Boolean))
      ]),
      U.el('button', {
        class: 'cute-task-delete',
        onclick: (e) => {
          e.stopPropagation();
          Modal.confirm('删除任务', '将移入回收站', () => DBdelete('todos', task.id).then(render), '删除', '取消', true);
        }
      }, '🗑️')
    ]);
    return card;
  }

  function openFilterModal() {
  const backdrop = U.el('div', { class: 'modal-sheet-backdrop' });
  const sheet = U.el('div', { class: 'modal-sheet' });
  backdrop.appendChild(sheet);
  document.body.appendChild(backdrop);

  requestAnimationFrame(() => {
    backdrop.classList.add('active');
    sheet.classList.add('active');
  });

  function close() {
    backdrop.classList.remove('active');
    sheet.classList.remove('active');
    setTimeout(() => backdrop.remove(), 350);
  }

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  function renderCategoryList(onSelect) {
    sheet.innerHTML = '';
    sheet.appendChild(U.el('div', { class: 'modal-sheet-handle' }));
    sheet.appendChild(U.el('div', { class: 'modal-sheet-header' }, [
      U.el('div', { class: 'modal-sheet-title' }, '选择分类'),
      U.el('button', { class: 'modal-sheet-close', onclick: close }, '✕')
    ]));

    const body = U.el('div', { class: 'modal-sheet-body' });
    const categories = getAllCategories();

    categories.forEach(cat => {
      const isActive = ScheduleState.currentFilter === cat.value;
      const item = U.el('div', {
        class: 'category-item' + (isActive ? ' active' : ''),
        onclick: () => { onSelect(cat.value); close(); }
      }, [
        U.el('div', { class: 'category-item-icon', style: `background: ${cat.color}20;` }, cat.icon),
        U.el('div', { class: 'category-item-info' }, [
          U.el('div', { class: 'category-item-name' }, cat.label)
        ]),
        U.el('div', { class: 'category-item-check' })
      ]);
      body.appendChild(item);
    });

    sheet.appendChild(body);

    const footer = U.el('div', { class: 'modal-sheet-footer' });
    footer.appendChild(U.el('button', {
      class: 'category-manage-btn ghost',
      onclick: () => { close(); openCategoryManager(); }
    }, '📁 分类管理'));
    footer.appendChild(U.el('button', {
      class: 'category-manage-btn primary',
      onclick: () => { close(); openCreateCategory(); }
    }, '＋ 新建分类'));
    sheet.appendChild(footer);
  }

  renderCategoryList((value) => {
    ScheduleState.currentFilter = value;
    render();
  });
}

function openCategoryManager() {
  const backdrop = U.el('div', { class: 'modal-sheet-backdrop' });
  const sheet = U.el('div', { class: 'modal-sheet', style: 'max-height: 85vh;' });
  backdrop.appendChild(sheet);
  document.body.appendChild(backdrop);

  requestAnimationFrame(() => {
    backdrop.classList.add('active');
    sheet.classList.add('active');
  });

  function close() {
    backdrop.classList.remove('active');
    sheet.classList.remove('active');
    setTimeout(() => backdrop.remove(), 350);
  }

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  function render() {
    sheet.innerHTML = '';
    sheet.appendChild(U.el('div', { class: 'modal-sheet-handle' }));
    sheet.appendChild(U.el('div', { class: 'modal-sheet-header' }, [
      U.el('div', { class: 'modal-sheet-title' }, '分类管理'),
      U.el('button', { class: 'modal-sheet-close', onclick: close }, '✕')
    ]));

    const body = U.el('div', { class: 'modal-sheet-body' });
    const customs = getCustomCategories();

    const title = U.el('div', { class: 'category-manage-title' }, '自定义分类');
    body.appendChild(title);

    if (customs.length === 0) {
      body.appendChild(U.el('div', { class: 'category-empty' }, [
        U.el('div', { class: 'category-empty-icon' }, '📝'),
        U.el('div', { class: 'category-empty-text' }, '还没有自定义分类，点击下方按钮添加')
      ]));
    } else {
      const list = U.el('div', { class: 'category-list' });
      customs.forEach(cat => {
        const item = U.el('div', { class: 'category-item' }, [
          U.el('div', { class: 'category-item-icon', style: `background: ${cat.color}20;` }, cat.icon),
          U.el('div', { class: 'category-item-info' }, [
            U.el('div', { class: 'category-item-name' }, cat.name)
          ]),
          U.el('div', { class: 'category-item-actions' }, [
            U.el('button', {
              class: 'category-item-action',
              title: '重命名',
              onclick: () => { close(); openCreateCategory(cat); }
            }, '✏️'),
            U.el('button', {
              class: 'category-item-action',
              title: '删除',
              onclick: () => {
                Modal.confirm('删除分类', `确定删除「${cat.name}」？相关任务将变为未分类。`, () => {
                  const list = getCustomCategories().filter(c => c.id !== cat.id);
                  saveCustomCategories(list);
                  Toast.ok('已删除');
                  render();
                }, '删除', '取消', true);
              }
            }, '🗑️')
          ])
        ]);
        list.appendChild(item);
      });
      body.appendChild(list);
    }

    sheet.appendChild(body);

    const footer = U.el('div', { class: 'modal-sheet-footer' });
    footer.appendChild(U.el('button', {
      class: 'category-manage-btn primary',
      onclick: () => { close(); openCreateCategory(); }
    }, '＋ 新建分类'));
    sheet.appendChild(footer);
  }

  render();
}

const CATEGORY_ICONS = ['💼','🏠','📚','💪','✨','🎯','🎨','🎮','🍳','🛒','🚗','✈️','🏋️','🧘','📖','🎵','🖌️','🧹','📧','☎️','💡','🔧','🌱','☕','🍅','📝','🎁','💊','🐾','🌟'];
const CATEGORY_COLORS = ['#42A5F5','#EC407A','#66BB6A','#FFA726','#AB47BC','#EF5350','#26C6DA','#8D6E63','#7E57C2','#FF7043','#26A69A','#5C6BC0','#66BB6A','#FFCA28','#F06292'];

function openCreateCategory(existing) {
  const isEdit = !!existing;
  const data = existing || { id: null, name: '', icon: '✨', color: '#AB47BC' };

  const backdrop = U.el('div', { class: 'modal-sheet-backdrop' });
  const sheet = U.el('div', { class: 'modal-sheet' });
  backdrop.appendChild(sheet);
  document.body.appendChild(backdrop);

  requestAnimationFrame(() => {
    backdrop.classList.add('active');
    sheet.classList.add('active');
  });

  function close() {
    backdrop.classList.remove('active');
    sheet.classList.remove('active');
    setTimeout(() => backdrop.remove(), 350);
  }

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  sheet.appendChild(U.el('div', { class: 'modal-sheet-handle' }));
  sheet.appendChild(U.el('div', { class: 'modal-sheet-header' }, [
    U.el('div', { class: 'modal-sheet-title' }, isEdit ? '编辑分类' : '新建分类'),
    U.el('button', { class: 'modal-sheet-close', onclick: close }, '✕')
  ]));

  const body = U.el('div', { class: 'modal-sheet-body' });

  const nameInput = U.el('input', {
    class: 'category-name-input',
    placeholder: '分类名称（限15字）',
    maxlength: '15',
    value: data.name
  });
  body.appendChild(U.el('div', { class: 'form-field' }, [
    U.el('label', { class: 'form-label', text: '分类名称' }),
    nameInput
  ]));

  const iconLabel = U.el('label', { class: 'form-label', text: '选择图标' });
  body.appendChild(iconLabel);
  const iconGrid = U.el('div', { class: 'category-icon-grid' });
  CATEGORY_ICONS.forEach(ic => {
    const cell = U.el('div', {
      class: 'category-icon-cell' + (ic === data.icon ? ' active' : ''),
      text: ic,
      onclick: () => {
        data.icon = ic;
        iconGrid.querySelectorAll('.category-icon-cell').forEach(x => x.classList.remove('active'));
        cell.classList.add('active');
      }
    });
    iconGrid.appendChild(cell);
  });
  body.appendChild(iconGrid);

  const colorLabel = U.el('label', { class: 'form-label', text: '选择颜色' });
  body.appendChild(colorLabel);
  const colorPicker = U.el('div', { class: 'color-picker' });
  CATEGORY_COLORS.forEach(col => {
    const swatch = U.el('div', {
      class: 'color-swatch' + (col === data.color ? ' active' : ''),
      style: `background: ${col};`,
      onclick: () => {
        data.color = col;
        colorPicker.querySelectorAll('.color-swatch').forEach(x => x.classList.remove('active'));
        swatch.classList.add('active');
      }
    });
    colorPicker.appendChild(swatch);
  });
  body.appendChild(colorPicker);

  sheet.appendChild(body);

  const footer = U.el('div', { class: 'modal-sheet-footer' });
  footer.appendChild(U.el('button', {
    class: 'category-manage-btn ghost',
    onclick: close
  }, '取消'));
  footer.appendChild(U.el('button', {
    class: 'category-manage-btn primary',
    onclick: () => {
      const name = nameInput.value.trim();
      if (!name) { Toast.warn('请输入分类名称'); return; }
      if (name.length > 15) { Toast.warn('分类名不超过15字'); return; }
      const list = getCustomCategories();
      if (isEdit) {
        const idx = list.findIndex(c => c.id === existing.id);
        if (idx >= 0) list[idx] = { ...list[idx], name, icon: data.icon, color: data.color };
        saveCustomCategories(list);
        Toast.ok('已保存');
      } else {
        list.push({ id: U.uid(), name, icon: data.icon, color: data.color });
        saveCustomCategories(list);
        Toast.ok('已创建');
      }
      close();
    }
  }, isEdit ? '保存' : '创建'));
  sheet.appendChild(footer);
}

  await render();
  root.appendChild(app);
}, '日程中心');

// 打开添加/编辑任务弹窗
function openAddTaskModal(existing) {
  const isEdit = !!existing;
  const data = existing || {
    title: '', desc: '', priority: 'mid', category: 'work',
    deadline: fmtDate2(ScheduleState.selectedDate) + 'T09:00',
    done: false
  };

  const titleInput = U.el('input', { class: 'form-input', placeholder: '任务标题...', value: data.title });
  const prioritySelect = U.el('select', { class: 'form-input' }, [
    U.el('option', { value: 'high', text: '🔴 高优先级', selected: data.priority === 'high' }),
    U.el('option', { value: 'mid', text: '🟡 中优先级', selected: data.priority === 'mid' }),
    U.el('option', { value: 'low', text: '🟢 低优先级', selected: data.priority === 'low' })
  ]);
  const categoryOptions = [
    ...Object.entries(CATEGORY_MAP).map(([key, info]) => ({ value: key, text: `${info.icon} ${info.label}` })),
    ...getCustomCategories().map(c => ({ value: c.id, text: `${c.icon} ${c.name}` }))
  ];
  const categorySelect = U.el('select', { class: 'form-input' },
    categoryOptions.map(o => U.el('option', { value: o.value, text: o.text, selected: data.category === o.value }))
  );
  const deadlineInput = U.el('input', { class: 'form-input', type: 'datetime-local', value: data.deadline });
  const descInput = U.el('textarea', { class: 'form-input', rows: '3', placeholder: '备注...' }, data.desc || '');

  const body = U.el('div', { class: 'form' }, [
    U.el('div', { class: 'form-field' }, [U.el('label', { class: 'form-label', text: '任务标题 *' }), titleInput]),
    U.el('div', { class: 'form-field' }, [U.el('label', { class: 'form-label', text: '优先级' }), prioritySelect]),
    U.el('div', { class: 'form-field' }, [U.el('label', { class: 'form-label', text: '分类' }), categorySelect]),
    U.el('div', { class: 'form-field' }, [U.el('label', { class: 'form-label', text: '截止时间' }), deadlineInput]),
    U.el('div', { class: 'form-field' }, [U.el('label', { class: 'form-label', text: '备注' }), descInput])
  ]);

  const footer = U.el('div', { class: 'modal-footer-buttons' }, [
    U.el('button', { class: 'btn btn-ghost', text: '取消', onclick: () => Modal.close() }),
    U.el('button', { class: 'btn btn-primary', text: isEdit ? '保存' : '添加', onclick: async () => {
      const task = {
        id: existing?.id,
        title: titleInput.value.trim() || '未命名任务',
        priority: prioritySelect.value,
        category: categorySelect.value,
        deadline: deadlineInput.value,
        desc: descInput.value,
        done: data.done || false
      };
      if (isEdit) await DBput('todos', task);
      else await DBadd('todos', task);
      Modal.close();
      Toast.ok(isEdit ? '已保存' : '已添加');
      const route = location.hash.replace(/^#\//, '').split('/')[0];
      if (route === 'schedule' || route === 'calendar') navigate();
    }})
  ]);

  Modal.open(isEdit ? '编辑任务' : '新建任务', body, footer);
}

// 注册：月视图页面
registerRoute('calendar', async (root) => {
  const fabAdd = document.getElementById('fab-add');
  if (fabAdd) fabAdd.onclick = () => openAddTaskModal();

  root.innerHTML = '';
  const app = U.el('div', { class: 'schedule-app' });

  const topBar = U.el('div', { class: 'schedule-top-bar' }, [
    U.el('div', { class: 'schedule-menu-btn', onclick: () => { location.hash = '#/schedule'; } }, '‹'),
    U.el('div', { class: 'schedule-avatar', onclick: () => { location.hash = '#/profile'; } }, '🐰')
  ]);
  app.appendChild(topBar);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const viewHeader = U.el('div', { class: 'month-view-header' }, [
    U.el('div', { class: 'month-view-title' }, `${year}年${month + 1}月`),
    U.el('div', { class: 'month-view-nav' }, [
      U.el('button', {
        class: 'month-view-nav-btn',
        onclick: () => {
          const d = new Date(year, month - 1, 1);
          ScheduleState.currentDate = d;
          location.hash = '#/calendar';
        }
      }, '‹'),
      U.el('button', {
        class: 'month-view-nav-btn',
        onclick: () => {
          const d = new Date(year, month + 1, 1);
          ScheduleState.currentDate = d;
          location.hash = '#/calendar';
        }
      }, '›')
    ])
  ]);
  app.appendChild(viewHeader);

  const banner = U.el('div', { class: 'month-view-banner' }, [
    U.el('div', { class: 'month-view-banner-icon' }, '🌙'),
    U.el('div', { class: 'month-view-banner-text' }, [
      U.el('h3', {}, '月视图'),
      U.el('p', {}, '一目了然的月程全景')
    ]),
    U.el('button', { class: 'month-view-banner-btn', onclick: () => Toast.show('功能开发中', 'info') }, '✨ 开通会员')
  ]);
  app.appendChild(banner);

  const firstDay = new Date(year, month, 1);
  const startWeekday = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = fmtDate2(now);
  const selectedStr = fmtDate2(ScheduleState.selectedDate);

  const grid = U.el('div', { class: 'month-grid' });

  const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
  const weekHeader = U.el('div', { class: 'month-weekdays' });
  weekdays.forEach((w, i) => {
    const cls = (i === 5 || i === 6) ? 'weekend' : '';
    weekHeader.appendChild(U.el('div', { class: cls }, w));
  });
  grid.appendChild(weekHeader);

  const daysContainer = U.el('div', { class: 'month-days' });

  for (let i = 0; i < startWeekday; i++) {
    daysContainer.appendChild(U.el('div', { class: 'month-day', style: 'visibility:hidden;' }));
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month, d);
    const dateStr = fmtDate2(dateObj);
    const isToday = dateStr === todayStr;
    const isSelected = dateStr === selectedStr;
    const lunar = getLunarDay(dateObj);

    const dayClasses = ['month-day'];
    if (isToday) dayClasses.push('today');
    if (isSelected) dayClasses.push('selected');

    const dayChildren = [
      U.el('div', { class: 'month-day-header' }, [
        U.el('div', { class: 'month-day-num' }, String(d))
      ])
    ];

    if (lunar) {
      dayChildren.push(U.el('div', { class: 'month-day-lunar' }, lunar));
    }

    dayChildren.push(U.el('div', { class: 'month-day-task-dots' }));

    dayChildren.push(U.el('div', { class: 'month-day-illustration' }, isToday ? '🐰' : ''));

    const dayEl = U.el('div', {
      class: dayClasses.join(' '),
      onclick: () => {
        ScheduleState.selectedDate = dateObj;
        location.hash = '#/schedule';
      }
    }, dayChildren);

    daysContainer.appendChild(dayEl);

    getTasksForDate(dateStr).then(tasks => {
      const dotsContainer = dayEl.querySelector('.month-day-task-dots');
      if (tasks.length > 0) {
        const dotCount = Math.min(tasks.length, 3);
        for (let i = 0; i < dotCount; i++) {
          dotsContainer.appendChild(U.el('span', { class: 'month-day-task-dot' }));
        }
      }
    });
  }

  grid.appendChild(daysContainer);
  app.appendChild(grid);
  root.appendChild(app);
}, '月视图');

// 注册：专注页面
registerRoute('focus', async (root) => {
  root.innerHTML = '';
  const app = U.el('div', { class: 'schedule-app' });

  const topBar = U.el('div', { class: 'schedule-top-bar' }, [
    U.el('div', { class: 'schedule-menu-btn', onclick: () => { location.hash = '#/schedule'; } }, '‹'),
    U.el('div', { class: 'schedule-avatar' }, '⏱️')
  ]);
  app.appendChild(topBar);

  const focusPage = U.el('div', { class: 'focus-page', id: 'focus-page' });

  // ---- 模式切换 ----
  const modes = [
    { key: 'timer', label: '正计时' },
    { key: 'pomodoro', label: '番茄钟' },
    { key: 'countdown', label: '倒计时' }
  ];
  const tabsBar = U.el('div', { class: 'focus-mode-tabs' });
  modes.forEach(m => {
    tabsBar.appendChild(U.el('button', {
      class: `focus-mode-tab ${ScheduleState.focusMode === m.key ? 'active' : ''}`,
      onclick: () => switchMode(m.key)
    }, m.label));
  });
  focusPage.appendChild(tabsBar);

  // ---- 关联计划链接 ----
  const planLink = U.el('a', {
    class: 'focus-link-plan',
    onclick: () => Toast.show('关联计划功能开发中', 'info')
  }, '📎 关联计划');
  focusPage.appendChild(planLink);

  // ---- SVG 圆环计时器 ----
  const RADIUS = 130;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 280 280');
  svg.setAttribute('width', '280');
  svg.setAttribute('height', '280');

  const bgCircle = document.createElementNS(svgNS, 'circle');
  bgCircle.setAttribute('cx', '140');
  bgCircle.setAttribute('cy', '140');
  bgCircle.setAttribute('r', String(RADIUS));
  bgCircle.setAttribute('class', 'focus-ring-bg');
  bgCircle.setAttribute('stroke-width', '10');

  const progressCircle = document.createElementNS(svgNS, 'circle');
  progressCircle.setAttribute('cx', '140');
  progressCircle.setAttribute('cy', '140');
  progressCircle.setAttribute('r', String(RADIUS));
  progressCircle.setAttribute('class', 'focus-ring-progress');
  progressCircle.setAttribute('stroke-width', '10');
  progressCircle.setAttribute('stroke-linecap', 'round');
  progressCircle.setAttribute('stroke-dasharray', String(CIRCUMFERENCE));
  progressCircle.setAttribute('stroke-dashoffset', '0');

  svg.appendChild(bgCircle);
  svg.appendChild(progressCircle);

  const ringCenter = U.el('div', { class: 'focus-ring-center' }, [
    U.el('div', { class: 'time-value', id: 'focus-time-value' }, '00:00'),
    U.el('div', { class: 'time-unit' }, '分钟')
  ]);

  const ring = U.el('div', { class: 'focus-ring' }, [svg, ringCenter]);
  focusPage.appendChild(ring);

  // ---- 开始/暂停按钮 ----
  const startBtn = U.el('button', {
    class: 'focus-start-btn',
    onclick: handleStartBtn
  }, '开始专注');
  focusPage.appendChild(startBtn);

  // ---- 底部插画 ----
  const illustration = U.el('div', { class: 'focus-illustration' }, [
    U.el('div', { class: 'bunny' }, '🐰 👧'),
    U.el('div', { class: 'scene' }, '一起专注，共同进步 ✨')
  ]);
  focusPage.appendChild(illustration);

  // ---- 快速操作 ----
  const quickActions = U.el('div', { class: 'focus-quick-actions' });
  const pomodoroBtn = U.el('button', {
    class: 'focus-quick-btn',
    title: '番茄钟 (25分钟)',
    onclick: () => switchMode('pomodoro')
  }, '🍅');
  const countdownBtn = U.el('button', {
    class: 'focus-quick-btn',
    title: '自定义倒计时',
    onclick: () => switchMode('countdown')
  }, '⏱️');
  const settingsBtn = U.el('button', {
    class: 'focus-quick-btn',
    title: '设置',
    onclick: () => Toast.show('设置功能开发中', 'info')
  }, '⚙️');
  quickActions.appendChild(pomodoroBtn);
  quickActions.appendChild(countdownBtn);
  quickActions.appendChild(settingsBtn);
  focusPage.appendChild(quickActions);

  app.appendChild(focusPage);
  root.appendChild(app);

  // ==================== 逻辑函数 ====================

  let focusSessionStart = null;
  let focusAccumulatedMs = 0;

  function saveFocusRecord(completed) {
    const durationMs = focusAccumulatedMs + (focusSessionStart ? (Date.now() - focusSessionStart) : 0);
    if (durationMs < 5000) return;
    const record = {
      type: ScheduleState.focusMode,
      duration: durationMs,
      completed: !!completed,
      date: fmtDate2(new Date()),
      category: ScheduleState.currentFilter !== 'all' ? ScheduleState.currentFilter : '',
      createdAt: U.now()
    };
    DBadd('focus', record).catch(() => {});
    focusSessionStart = null;
    focusAccumulatedMs = 0;
  }

  function formatTime(seconds) {
    const abs = Math.abs(seconds);
    const m = Math.floor(abs / 60);
    const s = abs % 60;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function updateDisplay() {
    const el = document.getElementById('focus-time-value');
    if (!el) return;
    let text;
    if (ScheduleState.focusMode === 'timer') {
      text = formatTime(ScheduleState.focusElapsed || 0);
    } else {
      text = formatTime(ScheduleState.focusRemaining);
    }
    el.textContent = text;
    updateProgressRing();
  }

  function updateProgressRing() {
    if (ScheduleState.focusMode === 'timer') {
      progressCircle.setAttribute('stroke-dashoffset', '0');
      return;
    }
    const total = ScheduleState.focusTotal || ScheduleState.focusMinutes * 60;
    const remaining = ScheduleState.focusRemaining;
    const ratio = total > 0 ? (total - remaining) / total : 0;
    const offset = CIRCUMFERENCE * (1 - ratio);
    progressCircle.setAttribute('stroke-dashoffset', String(offset));
  }

  function updateTabs() {
    tabsBar.querySelectorAll('.focus-mode-tab').forEach((tab, i) => {
      tab.classList.toggle('active', modes[i].key === ScheduleState.focusMode);
    });
  }

  function updateStartBtn() {
    let text;
    if (ScheduleState.focusPlaying) {
      text = '暂停';
    } else if (ScheduleState.focusMode === 'timer') {
      text = ScheduleState.focusElapsed > 0 ? '继续' : '开始专注';
    } else {
      text = ScheduleState.focusRemaining > 0 && ScheduleState.focusRemaining < ScheduleState.focusTotal ? '继续' : '开始专注';
    }
    startBtn.textContent = text;
  }

  function switchMode(mode) {
    if (ScheduleState.focusTimer) {
      clearInterval(ScheduleState.focusTimer);
      ScheduleState.focusTimer = null;
    }
    ScheduleState.focusPlaying = false;
    ScheduleState.focusMode = mode;

    if (mode === 'timer') {
      ScheduleState.focusElapsed = 0;
      ScheduleState.focusRemaining = 0;
      ScheduleState.focusTotal = 0;
    } else if (mode === 'pomodoro') {
      ScheduleState.focusMinutes = 25;
      ScheduleState.focusTotal = 25 * 60;
      ScheduleState.focusRemaining = 25 * 60;
    } else if (mode === 'countdown') {
      ScheduleState.focusMinutes = ScheduleState.focusMinutes || 25;
      ScheduleState.focusTotal = ScheduleState.focusMinutes * 60;
      ScheduleState.focusRemaining = ScheduleState.focusMinutes * 60;
    }

    updateTabs();
    updateDisplay();
    updateStartBtn();
  }

  function handleStartBtn() {
    if (ScheduleState.focusPlaying) {
      pauseTimer();
    } else {
      startTimer();
    }
  }

  function startTimer() {
    if (ScheduleState.focusPlaying) return;
    ScheduleState.focusPlaying = true;
    focusSessionStart = Date.now();

    if (ScheduleState.focusMode === 'timer') {
      if (ScheduleState.focusElapsed === undefined) ScheduleState.focusElapsed = 0;
      ScheduleState.focusTimer = setInterval(() => {
        ScheduleState.focusElapsed++;
        updateDisplay();
      }, 1000);
    } else {
      if (ScheduleState.focusRemaining <= 0) {
        ScheduleState.focusRemaining = ScheduleState.focusMinutes * 60;
        ScheduleState.focusTotal = ScheduleState.focusMinutes * 60;
      }
      ScheduleState.focusTimer = setInterval(() => {
        ScheduleState.focusRemaining--;
        updateDisplay();
        if (ScheduleState.focusRemaining <= 0) {
          saveFocusRecord(true);
          stopTimer();
          Toast.show('🎉 专注完成！休息一下吧~', 'ok');
        }
      }, 1000);
    }

    focusPage.classList.add('playing');
    updateStartBtn();
  }

  function pauseTimer() {
    if (ScheduleState.focusTimer) {
      clearInterval(ScheduleState.focusTimer);
      ScheduleState.focusTimer = null;
    }
    if (focusSessionStart) {
      focusAccumulatedMs += Date.now() - focusSessionStart;
      focusSessionStart = null;
    }
    ScheduleState.focusPlaying = false;
    focusPage.classList.remove('playing');
    updateStartBtn();
  }

  function stopTimer() {
    if (ScheduleState.focusTimer) {
      clearInterval(ScheduleState.focusTimer);
      ScheduleState.focusTimer = null;
    }
    if (focusSessionStart || focusAccumulatedMs > 0) {
      saveFocusRecord(false);
    }
    ScheduleState.focusPlaying = false;
    focusPage.classList.remove('playing');
    updateStartBtn();
  }

  // 初始化
  switchMode(ScheduleState.focusMode);
}, '专注');

// 注册：统计页面
registerRoute('stats', async (root) => {
  root.innerHTML = '';
  const app = U.el('div', { class: 'schedule-app' });

  const topBar = U.el('div', { class: 'schedule-top-bar' }, [
    U.el('div', { class: 'schedule-menu-btn', onclick: () => { location.hash = '#/schedule'; } }, '‹'),
    U.el('div', { class: 'schedule-avatar' }, '📊')
  ]);
  app.appendChild(topBar);

  const statsPage = U.el('div', { class: 'stats-page' });

  const mainTabs = U.el('div', { class: 'stats-main-tabs' });
  ['plan', 'focus'].forEach(tab => {
    const labels = { plan: '计划', focus: '专注' };
    mainTabs.appendChild(U.el('div', {
      class: `stats-main-tab ${ScheduleState.statsMainTab === tab ? 'active' : ''}`,
      onclick: () => {
        ScheduleState.statsMainTab = tab;
        ScheduleState.statsSubTab = tab === 'focus' ? 'day' : 'week';
        ScheduleState.statsRange = ScheduleState.statsSubTab;
        navigate();
      }
    }, labels[tab]));
  });
  statsPage.appendChild(mainTabs);

  const rangeConfigs = {
    focus: [
      { key: 'day', label: '日' },
      { key: 'week', label: '周' },
      { key: 'month', label: '月' },
      { key: 'custom', label: '自定义' }
    ],
    plan: [
      { key: 'week', label: '周' },
      { key: 'month', label: '月' },
      { key: 'year', label: '年' },
      { key: 'custom', label: '自定义' }
    ]
  };
  const currentRanges = rangeConfigs[ScheduleState.statsMainTab];

  const rangeTabs = U.el('div', { class: 'stats-range-tabs' });
  currentRanges.forEach(r => {
    rangeTabs.appendChild(U.el('div', {
      class: `stats-range-tab ${ScheduleState.statsSubTab === r.key ? 'active' : ''}`,
      onclick: () => { ScheduleState.statsSubTab = r.key; ScheduleState.statsRange = r.key; navigate(); }
    }, r.label));
  });
  statsPage.appendChild(rangeTabs);

  let startDate, endDate;
  const now = new Date();
  const subTab = ScheduleState.statsSubTab;
  if (subTab === 'day') {
    startDate = new Date(now); startDate.setHours(0, 0, 0, 0);
    endDate = new Date(now); endDate.setHours(23, 59, 59, 999);
  } else if (subTab === 'week') {
    const dayOfWeek = now.getDay() || 7;
    startDate = new Date(now); startDate.setDate(now.getDate() - dayOfWeek + 1);
    endDate = new Date(startDate); endDate.setDate(startDate.getDate() + 6);
  } else if (subTab === 'month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else if (subTab === 'year') {
    startDate = new Date(now.getFullYear(), 0, 1);
    endDate = new Date(now.getFullYear(), 11, 31);
  } else {
    startDate = new Date(now); startDate.setDate(now.getDate() - 30);
    endDate = new Date(now);
  }
  const rangeLabel = `${fmtDate2(startDate)} - ${fmtDate2(endDate)}`;
  statsPage.appendChild(U.el('div', { class: 'stats-range' }, `📅 ${rangeLabel}`));

  if (ScheduleState.statsMainTab === 'focus') {
    const focusData = await getFocusData(fmtDate2(startDate), fmtDate2(endDate));

    const todayFocusMin = Math.round(focusData.todayFocusMs / 60000);
    const yesterdayFocusMin = Math.round(focusData.yesterdayFocusMs / 60000);
    const totalFocusMin = Math.round(focusData.totalFocusMs / 60000);
    const todayTrend = focusData.todayPomodoros === focusData.yesterdayPomodoros && todayFocusMin === yesterdayFocusMin ? '持平' : (focusData.todayPomodoros > focusData.yesterdayPomodoros ? '↑ 增加' : '↓ 减少');
    const durationTrend = todayFocusMin === yesterdayFocusMin ? '持平' : (todayFocusMin > yesterdayFocusMin ? '↑ 增加' : '↓ 减少');

    const statsCards = U.el('div', { class: 'stats-cards' }, [
      U.el('div', { class: 'stats-card' }, [
        U.el('div', { class: 'stats-card-value' }, String(focusData.todayPomodoros)),
        U.el('div', { class: 'stats-card-label' }, '今日番茄'),
        U.el('div', { class: 'stats-trend' }, `较昨日${todayTrend}`)
      ]),
      U.el('div', { class: 'stats-card' }, [
        U.el('div', { class: 'stats-card-value' }, String(todayFocusMin)),
        U.el('div', { class: 'stats-card-label' }, '今日专注时长（分钟）'),
        U.el('div', { class: 'stats-trend' }, `较昨日${durationTrend}`)
      ]),
      U.el('div', { class: 'stats-card highlight' }, [
        U.el('div', { class: 'stats-card-value' }, String(focusData.totalPomodoros)),
        U.el('div', { class: 'stats-card-label' }, '总番茄数（个）'),
        U.el('div', { class: 'stats-trend' }, '累计完成')
      ]),
      U.el('div', { class: 'stats-card highlight' }, [
        U.el('div', { class: 'stats-card-value' }, String(totalFocusMin)),
        U.el('div', { class: 'stats-card-label' }, '总专注时长（分钟）'),
        U.el('div', { class: 'stats-trend' }, '累计专注')
      ])
    ]);
    statsPage.appendChild(statsCards);

    const chartSection = U.el('div', { class: 'chart-section' }, [
      U.el('div', { class: 'chart-title' }, '📊 专注分布')
    ]);

    const catCount = {};
    Object.entries(focusData.catStats).forEach(([cat, info]) => {
      catCount[cat] = info.count;
    });
    const totalForChart = Object.values(catCount).reduce((a, b) => a + b, 0);
    const pieSvg = createPieChart(catCount, totalForChart);
    chartSection.appendChild(U.el('div', { class: 'pie-chart-container' }, [pieSvg]));

    const legend = U.el('div', { class: 'chart-legend' });
    const catLabels = {
      work: '工作', life: '生活', study: '学习', health: '健康',
      other: '其他', uncategorized: '未分类'
    };
    const catColorMap = {
      work: '#42A5F5', life: '#EC407A', study: '#66BB6A',
      health: '#FFA726', other: '#AB47BC', uncategorized: '#9E9E9E'
    };
    getCustomCategories().forEach(c => {
      catLabels[c.id] = c.name;
      catColorMap[c.id] = c.color;
    });
    Object.entries(catCount).forEach(([key, count]) => {
      if (count === 0 && key !== (ScheduleState.statsFilter === 'category' ? ScheduleState.currentFilter : '')) return;
      const percent = totalForChart > 0 ? Math.round((count / totalForChart) * 100) : 0;
      legend.appendChild(U.el('div', { class: 'chart-legend-item' }, [
        U.el('div', { class: 'chart-legend-left' }, [
          U.el('div', { class: 'chart-legend-dot', style: `background: ${catColorMap[key] || '#BDBDBD'}` }),
          U.el('div', { class: 'chart-legend-label' }, catLabels[key] || key)
        ]),
        U.el('div', {}, [
          U.el('span', { class: 'chart-legend-value' }, `${count}次`),
          U.el('span', { class: 'chart-legend-percent' }, `${percent}%`)
        ])
      ]));
    });
    chartSection.appendChild(legend);

    const filterBar = U.el('div', { class: 'stats-filter-tabs' });
    ['plan', 'category'].forEach(f => {
      const labels = { plan: '计划', category: '分类' };
      filterBar.appendChild(U.el('div', {
        class: `stats-filter-tab ${ScheduleState.statsFilter === f ? 'active' : ''}`,
        onclick: () => { ScheduleState.statsFilter = f; navigate(); }
      }, labels[f]));
    });
    chartSection.appendChild(U.el('div', { style: 'margin-top:16px;' }, [filterBar]));

    statsPage.appendChild(chartSection);
  } else {
    const tasks = await getTasksInRange(fmtDate2(startDate), fmtDate2(endDate));
    const totalTasks = tasks.length;
    const doneTasks = tasks.filter(t => t.done).length;
    const overdueTasks = tasks.filter(t => !t.done && t.deadline && new Date(t.deadline) < now).length;
    const completionRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    const lastWeekStart = new Date(now);
    lastWeekStart.setDate(now.getDate() - 14);
    const lastWeekEnd = new Date(now);
    lastWeekEnd.setDate(now.getDate() - 7);
    const lastWeekTasks = await getTasksInRange(fmtDate2(lastWeekStart), fmtDate2(lastWeekEnd));
    const lastWeekDone = lastWeekTasks.filter(t => t.done).length;
    const lastWeekRate = lastWeekTasks.length > 0 ? Math.round((lastWeekDone / lastWeekTasks.length) * 100) : 0;
    const rateTrend = completionRate === lastWeekRate ? '较上周持平' : (completionRate > lastWeekRate ? `较上周↑${completionRate - lastWeekRate}%` : `较上周↓${lastWeekRate - completionRate}%`);

    const statsCards = U.el('div', { class: 'stats-cards' }, [
      U.el('div', { class: 'stats-card highlight' }, [
        U.el('div', { class: 'stats-card-value' }, String(doneTasks)),
        U.el('div', { class: 'stats-card-label' }, '已完成（个）'),
        U.el('div', { class: 'stats-trend' }, '完成情况')
      ]),
      U.el('div', { class: 'stats-card' }, [
        U.el('div', { class: 'stats-card-value' }, String(totalTasks)),
        U.el('div', { class: 'stats-card-label' }, '应完成（个）'),
        U.el('div', { class: 'stats-trend' }, '计划总数')
      ]),
      U.el('div', { class: 'stats-card' }, [
        U.el('div', { class: 'stats-card-value' }, String(overdueTasks)),
        U.el('div', { class: 'stats-card-label' }, '已逾期（个）'),
        U.el('div', { class: 'stats-trend' }, '需要关注')
      ]),
      U.el('div', { class: 'stats-card highlight' }, [
        U.el('div', { class: 'stats-card-value' }, `${completionRate}%`),
        U.el('div', { class: 'stats-card-label' }, '完成率'),
        U.el('div', { class: 'stats-trend' }, rateTrend)
      ])
    ]);
    statsPage.appendChild(statsCards);

    const chartSection = U.el('div', { class: 'chart-section' }, [
      U.el('div', { class: 'chart-title' }, '📊 打卡分布')
    ]);

    const catCount = {};
    if (ScheduleState.statsFilter === 'priority') {
      ['high', 'mid', 'low'].forEach(p => {
        catCount[p] = tasks.filter(t => t.priority === p).length;
      });
    } else {
      const allCatKeys = [...Object.keys(CATEGORY_MAP), ...getCustomCategories().map(c => c.id)];
      allCatKeys.forEach(key => {
        catCount[key] = tasks.filter(t => t.category === key).length;
      });
    }
    const totalForChart = Object.values(catCount).reduce((a, b) => a + b, 0);
    const pieSvg = createPieChart(catCount, totalForChart);
    chartSection.appendChild(U.el('div', { class: 'pie-chart-container' }, [pieSvg]));

    const legend = U.el('div', { class: 'chart-legend' });
    if (ScheduleState.statsFilter === 'priority') {
      const priorityColors = { high: '#EF5350', mid: '#FFB74D', low: '#66BB6A' };
      const priorityLabels = { high: '高优先级', mid: '中优先级', low: '低优先级' };
      Object.entries(catCount).forEach(([key, count]) => {
        const percent = totalForChart > 0 ? Math.round((count / totalForChart) * 100) : 0;
        legend.appendChild(U.el('div', { class: 'chart-legend-item' }, [
          U.el('div', { class: 'chart-legend-left' }, [
            U.el('div', { class: 'chart-legend-dot', style: `background: ${priorityColors[key] || '#BDBDBD'}` }),
            U.el('div', { class: 'chart-legend-label' }, priorityLabels[key] || key)
          ]),
          U.el('div', {}, [
            U.el('span', { class: 'chart-legend-value' }, `${count}个`),
            U.el('span', { class: 'chart-legend-percent' }, `${percent}%`)
          ])
        ]));
      });
    } else {
      const allCats = getAllCategories().filter(c => !c.isAll && !c.isNone);
      allCats.forEach(cat => {
        const count = catCount[cat.value] || 0;
        const percent = totalForChart > 0 ? Math.round((count / totalForChart) * 100) : 0;
        legend.appendChild(U.el('div', { class: 'chart-legend-item' }, [
          U.el('div', { class: 'chart-legend-left' }, [
            U.el('div', { class: 'chart-legend-dot', style: `background: ${cat.color}` }),
            U.el('div', { class: 'chart-legend-label' }, cat.label)
          ]),
          U.el('div', {}, [
            U.el('span', { class: 'chart-legend-value' }, `${count}个`),
            U.el('span', { class: 'chart-legend-percent' }, `${percent}%`)
          ])
        ]));
      });
    }
    chartSection.appendChild(legend);

    const filterBar = U.el('div', { class: 'stats-filter-tabs' });
    ['priority', 'category'].forEach(f => {
      const labels = { priority: '优先级', category: '分类' };
      filterBar.appendChild(U.el('div', {
        class: `stats-filter-tab ${ScheduleState.statsFilter === f ? 'active' : ''}`,
        onclick: () => { ScheduleState.statsFilter = f; navigate(); }
      }, labels[f]));
    });
    chartSection.appendChild(U.el('div', { style: 'margin-top:16px;' }, [filterBar]));

    statsPage.appendChild(chartSection);
  }

  app.appendChild(statsPage);
  root.appendChild(app);
}, '统计');

function getCatColor(cat) {
  const colors = { work: '#42A5F5', life: '#EC407A', study: '#66BB6A', health: '#FFA726', other: '#AB47BC' };
  return colors[cat] || '#BDBDBD';
}

// 创建 SVG 饼图
function createPieChart(data, total) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const size = 180;
  const center = size / 2;
  const radius = 80;
  const innerRadius = 45;
  
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  
  let startAngle = -Math.PI / 2;
  const entries = Object.entries(data).filter(([_, v]) => v > 0);
  
  if (total === 0) {
    // 空状态：显示灰色圆环
    const circle = document.createElementNS(svgNS, 'circle');
    circle.setAttribute('cx', center);
    circle.setAttribute('cy', center);
    circle.setAttribute('r', (radius + innerRadius) / 2);
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', '#E0E0E0');
    circle.setAttribute('stroke-width', radius - innerRadius);
    svg.appendChild(circle);
  } else {
    entries.forEach(([cat, count]) => {
      const angle = (count / total) * Math.PI * 2;
      const endAngle = startAngle + angle;
      const color = getCatColor(cat);
      
      // 计算圆弧路径
      const x1 = center + radius * Math.cos(startAngle);
      const y1 = center + radius * Math.sin(startAngle);
      const x2 = center + radius * Math.cos(endAngle);
      const y2 = center + radius * Math.sin(endAngle);
      const x3 = center + innerRadius * Math.cos(endAngle);
      const y3 = center + innerRadius * Math.sin(endAngle);
      const x4 = center + innerRadius * Math.cos(startAngle);
      const y4 = center + innerRadius * Math.sin(startAngle);
      
      const largeArc = angle > Math.PI ? 1 : 0;
      
      const pathData = [
        `M ${x1} ${y1}`,
        `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
        `L ${x3} ${y3}`,
        `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4}`,
        'Z'
      ].join(' ');
      
      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', pathData);
      path.setAttribute('fill', color);
      svg.appendChild(path);
      
      startAngle = endAngle;
    });
  }
  
  // 中心文字
  const centerGroup = document.createElementNS(svgNS, 'g');
  const totalText = document.createElementNS(svgNS, 'text');
  totalText.setAttribute('x', center);
  totalText.setAttribute('y', center - 5);
  totalText.setAttribute('text-anchor', 'middle');
  totalText.setAttribute('font-size', '28');
  totalText.setAttribute('font-weight', '800');
  totalText.setAttribute('fill', '#5D4037');
  totalText.textContent = total > 0 ? total : '0';
  
  const labelText = document.createElementNS(svgNS, 'text');
  labelText.setAttribute('x', center);
  labelText.setAttribute('y', center + 18);
  labelText.setAttribute('text-anchor', 'middle');
  labelText.setAttribute('font-size', '12');
  labelText.setAttribute('fill', '#A1887F');
  labelText.textContent = '完成打卡';
  
  centerGroup.appendChild(totalText);
  centerGroup.appendChild(labelText);
  svg.appendChild(centerGroup);
  
  return svg;
}

// 给底部导航绑定点击事件
document.addEventListener('DOMContentLoaded', () => {
  const nav = document.getElementById('bottom-nav');
  if (nav) {
    nav.addEventListener('click', (e) => {
      const item = e.target.closest('.bottom-nav-item');
      if (!item) return;
      const target = item.dataset.bnav;
      if (target === 'profile2') {
        e.preventDefault();
        location.hash = '#/profile';
      }
    });
  }
});

boot().catch(e => {
  console.error('boot 崩溃:', e);
  showFatalError('boot() 崩溃', e.stack || String(e));
});
