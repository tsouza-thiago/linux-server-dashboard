function matchesSelector(el, selector) {
  const s = String(selector).trim();
  const tagMatch = s.match(/^[a-zA-Z0-9]+/);
  if (tagMatch && el.tag !== tagMatch[0]) return false;
  const rest = s.slice(tagMatch ? tagMatch[0].length : 0);
  for (const m of rest.matchAll(/\.([a-zA-Z0-9_-]+)/g)) {
    if (!el.classList.contains(m[1])) return false;
  }
  const idMatch = rest.match(/#([a-zA-Z0-9_-]+)/);
  if (idMatch && el.id !== idMatch[1]) return false;
  for (const m of rest.matchAll(/\[([a-zA-Z0-9_-]+)(?:=(.*?))?\]/g)) {
    const key = m[1];
    const expected = m[2] === undefined ? undefined : m[2].replace(/^["']|["']$/g, '');
    const has = key in el.dataset || key in el;
    if (!has) return false;
    const val = key in el.dataset ? el.dataset[key] : el[key];
    if (expected !== undefined && String(val) !== expected) return false;
  }
  return true;
}

export class FakeElement {
  constructor(tag = 'div') {
    this.tag = tag;
    this.children = [];
    this.listeners = {};
    this.dataset = {};
    this.style = {};
    this.id = '';
    this.value = '';
    this.title = '';
    this.hidden = false;
    this.disabled = false;
    this._innerHTML = '';
    this._textContent = '';
    this._className = '';
    this._classes = new Set();
    this.classList = {
      add: (...c) => c.forEach((x) => this._classes.add(x)),
      remove: (...c) => c.forEach((x) => this._classes.delete(x)),
      toggle: (x, force) => {
        const has = this._classes.has(x);
        const on = force === undefined ? !has : force;
        if (on) this._classes.add(x);
        else this._classes.delete(x);
        return on;
      },
      contains: (x) => this._classes.has(x),
    };
  }

  get className() { return this._className; }
  set className(v) {
    this._className = String(v);
    this._classes = new Set(String(v).split(/\s+/).filter(Boolean));
  }

  get textContent() { return this._textContent; }
  set textContent(v) { this._textContent = String(v ?? ''); }

  set innerHTML(v) {
    this._innerHTML = String(v);
    this.children = [];
  }
  get innerHTML() { return this._innerHTML; }

  appendChild(child) { this.children.push(child); return child; }
  prepend(child) { this.children.unshift(child); return child; }

  addEventListener(type, fn) {
    (this.listeners[type] = this.listeners[type] || []).push(fn);
  }
  dispatch(type, event = {}) {
    for (const fn of this.listeners[type] || []) fn(event);
  }
  click() { this.dispatch('click'); }
  getContext() { return {}; }

  querySelectorAll(sel) {
    const out = [];
    const walk = (el) => {
      for (const c of el.children) {
        if (matchesSelector(c, sel)) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

export class FakeDocument {
  constructor() {
    this.byId = {};
    this.documentElement = new FakeElement('html');
  }
  getElementById(id) {
    if (!this.byId[id]) {
      const el = new FakeElement('div');
      el.id = id;
      this.byId[id] = el;
    }
    return this.byId[id];
  }
  createElement(tag) { return new FakeElement(tag); }
  querySelectorAll(sel) {
    const out = [];
    for (const el of Object.values(this.byId)) {
      if (matchesSelector(el, sel)) out.push(el);
      out.push(...el.querySelectorAll(sel));
    }
    return out;
  }
  addEventListener() {}
}

export { matchesSelector };