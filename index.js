/* Little Fish Reader — isolated SillyTavern extension prototype.
   Only inserts launch buttons and an overlay; never changes existing message content. */
(() => {
  'use strict';
  if (window.__littleFishReaderLoaded) return;
  window.__littleFishReaderLoaded = true;
  const $ = (selector, root = document) => root.querySelector(selector);
  const state = { root: null, raw: '', pages: [], spread: 0, font: 20, timer: 0, resize: null, observer: null, lastTouch: null, swiped: 0, tools: false, sourceMessage: null, align: true, excludedTags: ['thinking','think','visible-analysis','status_panel','status_collect','status_sex','Jiang_StatusBar','Shan_StatusBar','baisui_status','details'] };
  const cssFont = () => state.root?.style.setProperty('--lfr-font', state.font + 'px');
  // Read the *rendered* message, respecting the original page's visibility rules.
  // This is intentionally text-first: rich HTML pagination remains a later milestone.
  function sourceNode(mes) { return $('.mes_text', mes) || $('.mes-text', mes); }
  function isInvisible(el) {
    if (el.hidden || el.getAttribute('aria-hidden') === 'true' || el.hasAttribute('inert')) return true;
    const st = getComputedStyle(el);
    return st.display === 'none' || st.visibility === 'hidden' || st.visibility === 'collapse' ||
      Number(st.opacity) === 0 || st.contentVisibility === 'hidden';
  }
  const settingKey = 'littleFishReader.settings.v03';
  try {
    const saved = JSON.parse(localStorage.getItem(settingKey) || '{}');
    if (Array.isArray(saved.excludedTags)) state.excludedTags = saved.excludedTags.filter(x => typeof x === 'string' && /^[\w-]+$/.test(x)).slice(0, 80);
    if (typeof saved.align === 'boolean') state.align = saved.align;
  } catch (_) {}
  function saveSettings() {
    try { localStorage.setItem(settingKey, JSON.stringify({ excludedTags: state.excludedTags, align: state.align })); } catch (_) {}
  }
  function alignBook() {
    if (!state.root) return;
    const book = $('.lfr-book', state.root);
    book.style.removeProperty('top'); book.style.removeProperty('left');
    book.style.removeProperty('width'); book.style.removeProperty('height');
    book.classList.remove('lfr-aligned');
    if (!state.align) return;
    // Prefer the visible chat pane, not the entire window or the side toolbar.
    const chat = $('#chat');
    if (!chat) return;
    const r = chat.getBoundingClientRect();
    if (r.width < 320 || r.height < 250) return;
    const pad = 2;
    book.classList.add('lfr-aligned');
    book.style.left = Math.round(r.left + pad) + 'px';
    book.style.top = Math.round(r.top + pad) + 'px';
    book.style.width = Math.round(r.width - 2 * pad) + 'px';
    book.style.height = Math.round(r.height - 2 * pad) + 'px';
  }
  function getMessageText(mes) {
    const node = sourceNode(mes);
    if (!node) return '';
    const excluded = 'script,style,template,button,input,textarea,select,svg,canvas,.mes_buttons,.mes_button,.lfr-launch';
    const blocks = new Set(['P','DIV','BLOCKQUOTE','LI','H1','H2','H3','H4','H5','H6','PRE','SECTION','ARTICLE']);
    const chunks = [];
    function walk(n) {
      if (n.nodeType === Node.TEXT_NODE) { chunks.push(n.nodeValue || ''); return; }
      if (n.nodeType !== Node.ELEMENT_NODE) return;
      const el = n;
      if (el.matches(excluded) || isInvisible(el) || state.excludedTags.some(tag => el.tagName.toLowerCase() === tag.toLowerCase())) return;
      // Closed <details> may show only its summary, not its hidden body.
      if (el.tagName === 'DETAILS' && !el.open) {
        const summary = Array.from(el.children).find(c => c.tagName === 'SUMMARY');
        if (summary) walk(summary);
        return;
      }
      if (el.tagName === 'BR') { chunks.push('\n'); return; }
      const block = blocks.has(el.tagName);
      if (block && chunks.length) chunks.push('\n\n');
      for (const child of el.childNodes) walk(child);
      if (block) chunks.push('\n\n');
    }
    walk(node);
    return chunks.join('').replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n')
      .replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function inheritAppearance(mes) {
    if (!state.root) return;
    const node = sourceNode(mes);
    if (!node) return;
    // Sample a visible text-bearing descendant, avoiding hidden regex/HTML blocks.
    let sample = node;
    for (const el of node.querySelectorAll('p,span,div')) {
      if (!isInvisible(el) && (el.textContent || '').trim() &&
          !el.parentElement?.closest('[hidden],[aria-hidden="true"]')) {
        sample = el; break;
      }
    }
    const cs = getComputedStyle(sample);
    const base = getComputedStyle(node);
    const root = state.root;
    const fontFamily = cs.fontFamily || base.fontFamily;
    if (fontFamily) root.style.setProperty('--lfr-family', fontFamily);
    const ink = cs.color || base.color;
    if (ink && ink !== 'rgba(0, 0, 0, 0)') root.style.setProperty('--lfr-ink', ink);
    const size = parseFloat(cs.fontSize) || parseFloat(base.fontSize);
    if (Number.isFinite(size) && size >= 10 && size <= 48) state.font = Math.round(size);
    const spacing = cs.letterSpacing;
    root.style.setProperty('--lfr-tracking', spacing && spacing !== 'normal' ? spacing : 'normal');
    // Retain reader's own safe line-height unless source has a numeric usable value.
    const line = parseFloat(cs.lineHeight);
    if (Number.isFinite(line) && size && line / size >= 1 && line / size <= 3)
      root.style.setProperty('--lfr-leading', String(line / size));
    cssFont();
  }
  function isAI(mes) {
    if (mes.classList.contains('is_user') || mes.getAttribute('is_user') === 'true') return false;
    if (mes.classList.contains('is_system') || mes.getAttribute('is_system') === 'true') return false;
    return mes.classList.contains('is_ai') || mes.getAttribute('is_user') === 'false';
  }
  function addLaunchButtons() {
    document.querySelectorAll('#chat .mes').forEach(mes => {
      if (!isAI(mes) || mes.querySelector('.lfr-launch') || !getMessageText(mes)) return;
      const anchor = $('.mes_buttons', mes) || $('.mes_text', mes) || mes;
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'lfr-launch'; btn.title = '阅读这条 AI 回复'; btn.setAttribute('aria-label', '阅读这条 AI 回复');
      btn.textContent = '📖';
      btn.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); openReader(mes); });
      anchor.append(btn);
    });
  }
  function buildOverlay() {
    const root = document.createElement('div'); root.id = 'lfr-root';
    root.innerHTML = `<div class="lfr-backdrop"></div><section class="lfr-book" role="dialog" aria-modal="true" aria-label="小鱼阅读器"><div class="lfr-tools"><span class="lfr-title">小鱼阅读器 · 测试版</span><button data-action="smaller" title="缩小字号">A−</button><button data-action="larger" title="放大字号">A+</button><button data-action="close" title="退出阅读模式">退出 ✕</button><button data-action="settings" title="阅读设置">⚙</button></div><div class="lfr-settings" hidden><label><input type="checkbox" class="lfr-align-toggle" checked> 对齐酒馆聊天区域</label><label for="lfr-tags">清洗标签（每行一个标签名，不带尖括号）</label><textarea id="lfr-tags" spellcheck="false"></textarea><div class="lfr-settings-actions"><button data-action="save-settings">保存并重新排版</button><button data-action="cancel-settings">取消</button></div></div><div class="lfr-pages"><article class="lfr-page" data-page="left"></article><article class="lfr-page" data-page="right"></article><span class="lfr-num lfr-num-left"></span><span class="lfr-num lfr-num-right"></span><div class="lfr-notice" aria-live="polite"></div></div></section>`;
    document.body.append(root);
    state.root = root;
    cssFont();
    root.addEventListener('click', e => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'close') return closeReader();
      if (action === 'settings') {
        const panel = $('.lfr-settings', root);
        panel.hidden = !panel.hidden;
        if (!panel.hidden) {
          $('.lfr-align-toggle', panel).checked = state.align;
          $('#lfr-tags', panel).value = state.excludedTags.join('\n');
          root.classList.add('lfr-show-tools');
        }
        return;
      }
      if (action === 'cancel-settings') { $('.lfr-settings', root).hidden = true; return; }
      if (action === 'save-settings') {
        const panel = $('.lfr-settings', root);
        state.align = $('.lfr-align-toggle', panel).checked;
        state.excludedTags = [...new Set($('#lfr-tags', panel).value.split(/[\n,，]+/).map(x => x.trim().replace(/^<|>$/g, '')).filter(x => /^[\w-]+$/.test(x)))].slice(0,80);
        saveSettings(); panel.hidden = true;
        if (state.sourceMessage) state.raw = getMessageText(state.sourceMessage);
        alignBook(); state.spread = 0; schedule(); return;
      }
      if (e.target.closest('.lfr-settings')) return;
      if (action === 'smaller' || action === 'larger') {
        state.font = Math.max(12, Math.min(34, state.font + (action === 'larger' ? 2 : -2)));
        cssFont(); state.spread = 0; schedule(); return;
      }
      if (e.target.classList.contains('lfr-backdrop')) return closeReader();
      if (e.target.closest('.lfr-tools')) return;
      const pages = e.target.closest('.lfr-pages');
      if (!pages || Date.now() - state.swiped < 450 || window.getSelection()?.toString()) return;
      const r = pages.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width;
      if (x < .38) turn(-1); else if (x > .62) turn(1); else root.classList.toggle('lfr-show-tools');
    });
    const pages = $('.lfr-pages', root);
    pages.addEventListener('touchstart', e => { state.lastTouch = {x:e.touches[0].clientX,y:e.touches[0].clientY}; }, {passive:true});
    pages.addEventListener('touchend', e => {
      if (!state.lastTouch) return;
      const dx=e.changedTouches[0].clientX-state.lastTouch.x,dy=e.changedTouches[0].clientY-state.lastTouch.y;
      if (Math.abs(dx)>65 && Math.abs(dx)>Math.abs(dy)*1.25) {turn(dx<0?1:-1);state.swiped=Date.now();}
      state.lastTouch=null;
    }, {passive:true});
    state.resize = new ResizeObserver(schedule); state.resize.observe(pages);
    document.fonts?.ready.then(schedule);
    return root;
  }
  function fits(el, text) {
    el.textContent=text;
    return el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1;
  }
  function boundary(text,n) {
    if(n>0 && n<text.length) {
      const a=text.charCodeAt(n-1),b=text.charCodeAt(n);
      if(a>=0xD800&&a<=0xDBFF&&b>=0xDC00&&b<=0xDFFF)n--;
    }
    return Math.max(1,n);
  }
  function cut(el,text) {
    let lo=1,hi=text.length,best=0;
    while(lo<=hi){const mid=(lo+hi)>>1;if(fits(el,text.slice(0,mid))){best=mid;lo=mid+1;}else hi=mid-1;}
    return best>=text.length?text.length:boundary(text,best||1);
  }
  function paginate() {
    if(!state.root || state.root.hidden) return;
    const left=$('[data-page="left"]',state.root),right=$('[data-page="right"]',state.root);
    left.textContent='';right.textContent='';state.pages=[];
    let remaining=state.raw.replace(/\r\n?/g,'\n').trim(),guard=0;
    while(remaining && guard++<10000){
      remaining=remaining.replace(/^\n+/,'');if(!remaining)break;
      const el=state.pages.length%2?right:left;
      const n=cut(el,remaining);
      if(!n) throw new Error('当前字号无法容纳文字');
      state.pages.push(remaining.slice(0,n));remaining=remaining.slice(n);el.textContent='';
    }
    state.spread=Math.min(state.spread,Math.max(0,Math.ceil(state.pages.length/2)-1));
    render();
  }
  function render() {
    if(!state.root)return;
    $('[data-page="left"]',state.root).textContent=state.pages[state.spread*2]||'';
    $('[data-page="right"]',state.root).textContent=state.pages[state.spread*2+1]||'';
    $('.lfr-num-left',state.root).textContent=state.pages.length?String(state.spread*2+1):'';
    $('.lfr-num-right',state.root).textContent=state.pages[state.spread*2+1]?String(state.spread*2+2):'';
    $('.lfr-notice',state.root).textContent='';
  }
  function schedule() {
    if(state.timer) cancelAnimationFrame(state.timer);
    state.timer=requestAnimationFrame(()=>{state.timer=0;try{paginate();}catch(err){console.error('[Little Fish Reader]',err);if(state.root)$('.lfr-notice',state.root).textContent='排版失败：'+err.message;}});
  }
  function turn(direction) {
    const next=state.spread+direction;
    if(next<0||next>=Math.ceil(state.pages.length/2))return;
    state.spread=next;render();
  }
  function openReader(mes) {
    const text=getMessageText(mes);
    if(!text)return;
    if(!state.root)buildOverlay();
    state.sourceMessage=mes;state.raw=text;state.spread=0;
    inheritAppearance(mes);
    state.root.hidden=false;state.root.classList.remove('lfr-show-tools');
    $('.lfr-settings', state.root).hidden = true;
    alignBook(); schedule();
  }
  function closeReader() {if(state.root){state.root.hidden=true;state.root.classList.remove('lfr-show-tools');}state.sourceMessage=null;}
  window.addEventListener('resize', () => { if (state.root && !state.root.hidden) { alignBook(); schedule(); } });
  document.addEventListener('keydown',e=>{
    if(!state.root||state.root.hidden)return;
    if(e.key==='Escape'){e.preventDefault();closeReader();}
    else if(e.key==='ArrowLeft'){e.preventDefault();turn(-1);}
    else if(e.key==='ArrowRight'){e.preventDefault();turn(1);}
  });
  function init(){
    addLaunchButtons();
    state.observer=new MutationObserver(()=>{clearTimeout(state.scanTimer);state.scanTimer=setTimeout(addLaunchButtons,250);});
    const chat=$('#chat');if(chat)state.observer.observe(chat,{childList:true,subtree:true});
    // SillyTavern can replace #chat during navigation; rescan periodically as fallback.
    setInterval(addLaunchButtons,4000);
    console.info('[Little Fish Reader] Extension loaded');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
