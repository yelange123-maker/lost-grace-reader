/* Little Fish Reader — isolated SillyTavern extension prototype.
   Only inserts launch buttons and an overlay; never changes existing message content. */
(() => {
  'use strict';
  if (window.__littleFishReaderLoaded) return;
  window.__littleFishReaderLoaded = true;
  const $ = (selector, root = document) => root.querySelector(selector);
  const state = { root: null, raw: '', pages: [], spread: 0, font: 20, timer: 0, resize: null, observer: null, lastTouch: null, swiped: 0, tools: false, sourceMessage: null, richSource: null, turning: false, flipLayer: null, flipTimer: null, align: true, showPenguin: false, excludedTags: ['thinking','think','visible-analysis','status_panel','status_collect','status_sex','Jiang_StatusBar','Shan_StatusBar','baisui_status','details'] };
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
    if (typeof saved.showPenguin === 'boolean') state.showPenguin = saved.showPenguin;
  } catch (_) {}
  function saveSettings() {
    try { localStorage.setItem(settingKey, JSON.stringify({ excludedTags: state.excludedTags, align: state.align, showPenguin: state.showPenguin })); } catch (_) {}
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
    const topInset = 8; // Keep the top fade and toolbar clear of the chat viewport edge.
    book.classList.add('lfr-aligned');
    book.style.left = Math.round(r.left + pad) + 'px';
    book.style.top = Math.round(r.top + pad + topInset) + 'px';
    book.style.width = Math.round(r.width - 2 * pad) + 'px';
    book.style.height = Math.round(r.height - 2 * pad - topInset) + 'px';
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
      if (el.matches(excluded) || skipReaderComponent(el) || isInvisible(el) || state.excludedTags.some(tag => el.tagName.toLowerCase() === tag.toLowerCase())) return;
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
  // Build a safe, styled snapshot from the rendered SillyTavern message.
  // No raw HTML injection: only allowlisted elements and text nodes are copied.
  // Reader-only filter: folded panels are UI, not novel prose.
  // Exclude the whole details subtree, including its summary.
  // Keep this separate from editable tag exclusions.
  function skipReaderComponent(el) {
    if (el.tagName === 'DETAILS') return true;
    // A specific preset's decorative ending, not narrative prose.
    // Require both the exact text and the centered paragraph styling.
    if (el.tagName === 'P' &&
        el.textContent.replace(/\s+/g, ' ').trim() === '☽ 故事未定 ☾' &&
        el.style.textAlign === 'center') return true;
    return false;
  }
  // Slate markup is the only custom layout allowed into the reader.
  // Copy only known class names; never carry arbitrary source attributes/styles.
  const slateClasses = new Set([
    'elegant-slate-container', 'slate-scene-no', 'slate-title',
    'slate-meta-block', 'slate-location', 'slate-time-weather', 'slate-atmosphere'
  ]);
  // Penguin regex beautifier: rebuild only this known component from rendered
  // text, without importing arbitrary source HTML, styles, or remote markup.
  const penguinFaces = Object.freeze({
    normal:'https://i.postimg.cc/y8q5tgCv/Screenshot-2026-04-20-17-19-18-456-com-xingin-xhs.png',
    playful:'https://i.postimg.cc/Twfj8xtm/Screenshot-2026-04-20-21-30-09-202-com-xingin-xhs.png',
    serious:'https://i.postimg.cc/159d0hPN/Screenshot-2026-04-20-21-28-36-146-com-xingin-xhs.png',
    sad:'https://i.postimg.cc/gkF3PzVB/Screenshot-2026-04-21-17-54-57-203-com-discord.png',
    rebut:'https://i.postimg.cc/bJnd6nFK/Screenshot-2026-04-21-19-17-20-142-com-xingin-xhs.png',
    lewd:'https://i.postimg.cc/4yJZzhC2/Screenshot-2026-04-20-20-57-59-469-com-xingin-xhs.png'
  });
  function penguinKind(el) {
    if (el.tagName !== 'SPAN') return null;
    return Object.keys(penguinFaces).find(kind => el.classList.contains('dm-' + kind)) || null;
  }
  function penguinBubble(kind, text) {
    const box=document.createElement('span');box.className='lfr-penguin lfr-penguin-'+kind;
    const avatar=document.createElement('span');avatar.className='lfr-penguin-avatar';
    avatar.style.backgroundImage='url("'+penguinFaces[kind]+'")';
    const bubble=document.createElement('span');bubble.className='lfr-penguin-bubble';
    bubble.textContent=text;box.append(avatar,bubble);return box;
  }
  const richTags = new Set(['P','DIV','SPAN','EM','I','STRONG','B','U','S','DEL','BLOCKQUOTE','BR','H1','H2','H3','H4','H5','H6','UL','OL','LI','CODE','PRE','SMALL','SUP','SUB','MARK']);
  const richBlocks = new Set(['P','DIV','BLOCKQUOTE','H1','H2','H3','H4','H5','H6','UL','OL','LI','PRE']);
  // Reconstruct a trusted Slate component from the ORIGINAL message when
  // the rendered message has lost its structural classes. Never execute its HTML.
  function originalMessage(mes) {
    try {
      const id = Number(mes.getAttribute('mesid') ?? mes.dataset.mesid);
      const context = window.SillyTavern?.getContext?.();
      const entry = Number.isInteger(id) && id >= 0 ? context?.chat?.[id] : null;
      return typeof entry?.mes === 'string' ? entry.mes : '';
    } catch (_) { return ''; }
  }
  function parseSlate(raw) {
    const match = raw.match(/<Slate>\s*\[Scene\|([^|\]\r\n]*)\|([^\]]*)\]\s*\[Location\|([^\]]*)\]\s*\[TimeWeather\|([^|\]]*)\|([^\]]*)\](?:\s*\[Start_Atmosphere\|([\s\S]*?)\])?\s*<\/Slate>/i);
    if (!match) return null;
    return { number:match[1].trim(), title:match[2].trim(), location:match[3].trim(), time:match[4].trim(), weather:match[5].trim(), atmosphere:(match[6]||'').trim() };
  }
  function buildSlate(data) {
    const root=document.createElement('div');root.className='elegant-slate-container';
    const field=(parent,cls,value)=>{const el=document.createElement('div');el.className=cls;el.textContent=value;parent.append(el);};
    field(root,'slate-scene-no','SCENE '+data.number);
    field(root,'slate-title',data.title);
    const meta=document.createElement('div');meta.className='slate-meta-block';
    field(meta,'slate-location',data.location);
    field(meta,'slate-time-weather',data.time+' ｜ '+data.weather);
    root.append(meta);
    if(data.atmosphere)field(root,'slate-atmosphere',data.atmosphere);
    return root;
  }
  function restoreSlate(snapshot,mes) {
    const data=parseSlate(originalMessage(mes));
    if (!data) { console.info('[Little Fish Reader] Slate: original message unavailable or unmatched');return; }
    // Detect an existing Slate's rendered text before changing anything.
    // The source may be styled by a preset yet lack its wrapper/class in our snapshot.
    const positions=textPositions(snapshot),flat=positions.nodes.map(n=>n.node.nodeValue).join('');
    const scenePattern=new RegExp('SCENE\\s*'+data.number.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i');
    const scene=scenePattern.exec(flat);
    const firstAtmosphere=data.atmosphere.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    const endMarker=firstAtmosphere.length?firstAtmosphere[firstAtmosphere.length-1]:data.weather;
    // Ignore layout whitespace, but NOT punctuation. The previous normalizer
    // dropped the final '。' from the atmosphere boundary and left it behind
    // as a standalone text node after inserting the reconstructed Slate.
    const normalize=x=>x.replace(/\s+/g,'');
    if(!scene || scene.index>1500 || !endMarker) {console.info('[Little Fish Reader] Slate: rendered header not located');return;}
    // Find the last atmosphere line allowing arbitrary spaces/newlines between characters.
    const tail=flat.slice(scene.index,scene.index+6000);
    const normalizedTail=normalize(tail),normalizedEnd=normalize(endMarker);
    const normalizedStart=normalize(tail.slice(0,scene[0].length));
    const normalizedIndex=normalizedTail.indexOf(normalizedEnd,normalizedStart.length);
    if(normalizedIndex<0) {console.info('[Little Fish Reader] Slate: atmosphere boundary not found');return;}
    let seen=0,stop=0;
    for(let i=0;i<tail.length;i++) {
      if(normalize(tail[i]).length)seen+=normalize(tail[i]).length;
      if(seen>=normalizedIndex+normalizedEnd.length){stop=i+1;break;}
    }
    if(!stop)return;
    const at=(offset)=>{for(const n of positions.nodes)if(offset<n.end)return [n.node,offset-n.start];const n=positions.nodes.at(-1);return [n.node,n.node.nodeValue.length];};
    const [a,ao]=at(scene.index),[b,bo]=at(scene.index+stop);
    const range=document.createRange();range.setStart(a,ao);range.setEnd(b,bo);
    range.deleteContents();range.insertNode(buildSlate(data));
    // Remove now-empty ancestor blocks left by replacement, without touching prose.
    for(const el of [...snapshot.querySelectorAll('div,p,span')].reverse()){
      if(el!==snapshot && !el.textContent.trim() && !el.querySelector('.elegant-slate-container,br,img'))el.remove();
    }
    console.info('[Little Fish Reader] Slate: reconstructed from original message');
  }
  function richSnapshot(mes) {
    const source = sourceNode(mes);
    if (!source) return null;
    const wrapper = document.createElement('div');
    wrapper.className = 'lfr-rich';
    const excluded = 'script,style,template,button,input,textarea,select,svg,canvas,iframe,video,audio,.mes_buttons,.mes_button,.lfr-launch';
    function copy(node, parent) {
      if (node.nodeType === Node.TEXT_NODE) { parent.append(document.createTextNode(node.nodeValue || '')); return; }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node;
      if (el.matches(excluded) || skipReaderComponent(el) || isInvisible(el) || state.excludedTags.some(t => el.tagName.toLowerCase() === t.toLowerCase())) return;
      const penguin=penguinKind(el);
      if (penguin) {
        // Disabled = the same ordinary spoken text as v0.3.28; enabled = bubble.
        // The original regex emits an avatar span and a text span.
        const words=el.querySelector(':scope > span:not(.dm-avatar)');
        const spoken=(words || el).textContent || '';
        if (state.showPenguin) parent.append(penguinBubble(penguin,spoken));
        else parent.append(document.createTextNode(spoken));
        return;
      }
      const tag = richTags.has(el.tagName) ? el.tagName.toLowerCase() : 'span';
      const out = document.createElement(tag);
      for (const cls of el.classList) if (slateClasses.has(cls)) out.classList.add(cls);
      const cs = getComputedStyle(el);
      // Only typographic computed styles are copied; no positioning, backgrounds,
      // transforms, user HTML event handlers, or source CSS selectors can leak in.
      if (cs.color) out.style.color = cs.color;
      if (cs.fontStyle !== 'normal') out.style.fontStyle = cs.fontStyle;
      if (!el.classList.contains('slate-title') && !el.classList.contains('slate-location') && cs.fontWeight !== '400' && cs.fontWeight !== 'normal') out.style.fontWeight = cs.fontWeight;
      if (cs.textDecorationLine && cs.textDecorationLine !== 'none') out.style.textDecorationLine = cs.textDecorationLine;
      if (cs.textDecorationColor && cs.textDecorationColor !== 'currentcolor') out.style.textDecorationColor = cs.textDecorationColor;
      // Allowlist layout typography takes precedence over the source's computed font.
      if (cs.fontFamily && !el.classList.contains('slate-title')) out.style.fontFamily = cs.fontFamily;
      // Retain theme's explicit quote/italic/underline colors as computed by the browser.
      // The source's typography is the authority; no hard-coded theme color constants.
      parent.append(out);
      for (const child of el.childNodes) copy(child,out);
    }
    // Copy the source element itself when it is an allowlisted component.
    // Previously its class was lost because only source.childNodes were copied.
    if ([...source.classList].some(c => slateClasses.has(c))) copy(source,wrapper);
    else for (const child of source.childNodes) copy(child,wrapper);
    restoreSlate(wrapper,mes);
    return wrapper;
  }
  function textPositions(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes=[];let total=0,n;
    while ((n=walker.nextNode())) {const length=n.nodeValue.length;if(length){nodes.push({node:n,start:total,end:total+length});total+=length;}}
    return {nodes,total};
  }
  function rangeSlice(source,positions,start,end) {
    const frag=document.createDocumentFragment();
    if(end<=start || !positions.nodes.length)return frag;
    const locate=(offset)=>{
      for(const item of positions.nodes)if(offset<item.end)return [item.node,offset-item.start];
      const last=positions.nodes[positions.nodes.length-1];return [last.node,last.node.nodeValue.length];
    };
    const [a,ao]=locate(start),[b,bo]=locate(end);
    const range=document.createRange();range.setStart(a,ao);range.setEnd(b,bo);
    const fragment = range.cloneContents();
    // Range.cloneContents() omits ancestors of its starting text node.
    // If a page starts mid-Slate, restore the missing allowlisted wrapper(s)
    // so the scoped component stylesheet still applies on continuation pages.
    let ancestor = a.parentElement;
    const missing = [];
    while (ancestor && ancestor !== source) {
      if (ancestor.classList.contains('elegant-slate-container')) {
        missing.push(ancestor);
        break;
      }
      ancestor = ancestor.parentElement;
    }
    if (missing.length && !fragment.querySelector('.elegant-slate-container')) {
      const slate = document.createElement('div');
      slate.className = 'elegant-slate-container lfr-slate-continuation';
      slate.append(fragment);
      const wrapped = document.createDocumentFragment();
      wrapped.append(slate);
      return wrapped;
    }
    return fragment;
  }
  function richPaginate() {
    const left=$('[data-page="left"]',state.root),right=$('[data-page="right"]',state.root);
    left.replaceChildren();right.replaceChildren();state.pages=[];
    const source=state.richSource,positions=textPositions(source);
    const bubbles=[...source.querySelectorAll('.lfr-penguin')].map(el=>{
      const nodes=positions.nodes.filter(n=>el.contains(n.node));
      return nodes.length?{start:nodes[0].start,end:nodes[nodes.length-1].end}:null;
    }).filter(Boolean);
    let start=0,guard=0;
    const fitsRange=(el,end)=>{
      el.replaceChildren(rangeSlice(source,positions,start,end));
      return el.scrollHeight<=el.clientHeight+1 && el.scrollWidth<=el.clientWidth+1;
    };
    while(start<positions.total && guard++<10000){
      const el=state.pages.length%2?right:left;
      let lo=start+1,hi=positions.total,best=start;
      while(lo<=hi){const mid=Math.floor((lo+hi)/2);if(fitsRange(el,mid)){best=mid;lo=mid+1;}else hi=mid-1;}
      // Keep an entire bubble on one page whenever it can fit there.
      // Oversized bubbles retain normal character-level pagination as fallback.
      const crossing=bubbles.find(b=>b.start<best && best<b.end);
      if(crossing && crossing.start>start) best=crossing.start;
      if(best===start)best=start+1;
      if(best<positions.total){
        const [a,ao]=(()=>{for(const x of positions.nodes)if(best<x.end)return [x.node,best-x.start];return [null,0];})();
        if(a && ao>0 && ao<a.nodeValue.length && /[\uDC00-\uDFFF]/.test(a.nodeValue[ao]) && /[\uD800-\uDBFF]/.test(a.nodeValue[ao-1]))best--;
      }
      best=Math.max(start+1,best);
      state.pages.push([start,best]);start=best;
      el.replaceChildren();
    }
    state.spread=Math.min(state.spread,Math.max(0,Math.ceil(state.pages.length/2)-1));
    render();
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
    root.innerHTML = `<div class="lfr-backdrop"></div><section class="lfr-book" role="dialog" aria-modal="true" aria-label="小鱼阅读器"><div class="lfr-tools"><span class="lfr-title">小鱼阅读器 · 测试版</span><button data-action="smaller" title="缩小字号">A−</button><button data-action="larger" title="放大字号">A+</button><button data-action="close" title="退出阅读模式">退出 ✕</button><button data-action="settings" title="阅读设置">⚙</button></div><div class="lfr-settings" hidden><label><input type="checkbox" class="lfr-align-toggle" checked> 对齐酒馆聊天区域</label><label><input type="checkbox" class="lfr-penguin-toggle"> 显示企鹅弹幕（头像＋气泡）</label><label for="lfr-tags">清洗标签（每行一个标签名，不带尖括号）</label><textarea id="lfr-tags" spellcheck="false"></textarea><div class="lfr-settings-actions"><button data-action="save-settings">保存并重新排版</button><button data-action="cancel-settings">取消</button></div></div><div class="lfr-pages"><article class="lfr-page" data-page="left"></article><article class="lfr-page" data-page="right"></article><span class="lfr-num lfr-num-left"></span><span class="lfr-num lfr-num-right"></span><div class="lfr-notice" aria-live="polite"></div></div></section>`;
    document.body.append(root);
    state.root = root;
    cssFont();
    // Diagnostic control: cycles visibility of distinct page sources.
    const debug=document.createElement('div');
    debug.className='lfr-debug-panel';
    debug.innerHTML='<span class="lfr-debug-title">图层诊断 · 仅测试版</span><button type="button" class="lfr-debug-cycle">模式：全部显示</button><span class="lfr-debug-note">点击切换模式，再翻页录屏</span>';
    root.append(debug);
    const modes=[['all','全部显示'],['live','隐藏原始书页'],['stationary','隐藏静止副本'],['sheet','隐藏旋转纸张'],['opaque','不透明隔离']];
    let modeIndex=0;
    debug.querySelector('.lfr-debug-cycle').addEventListener('click',e=>{
      e.stopPropagation();
      modeIndex=(modeIndex+1)%modes.length;
      root.dataset.lfrDebug=modes[modeIndex][0];
      e.currentTarget.textContent='模式：'+modes[modeIndex][1];
    });
    root.dataset.lfrDebug='all';
    root.addEventListener('click', e => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'close') return closeReader();
      if (action === 'settings') {
        const panel = $('.lfr-settings', root);
        panel.hidden = !panel.hidden;
        if (!panel.hidden) {
          $('.lfr-align-toggle', panel).checked = state.align;
          $('.lfr-penguin-toggle', panel).checked = state.showPenguin;
          $('#lfr-tags', panel).value = state.excludedTags.join('\n');
          root.classList.add('lfr-show-tools');
        }
        return;
      }
      if (action === 'cancel-settings') { $('.lfr-settings', root).hidden = true; return; }
      if (action === 'save-settings') {
        const panel = $('.lfr-settings', root);
        state.align = $('.lfr-align-toggle', panel).checked;
        state.showPenguin = $('.lfr-penguin-toggle', panel).checked;
        state.excludedTags = [...new Set($('#lfr-tags', panel).value.split(/[\n,，]+/).map(x => x.trim().replace(/^<|>$/g, '')).filter(x => /^[\w-]+$/.test(x)))].slice(0,80);
        saveSettings(); panel.hidden = true;
        if (state.sourceMessage) { state.raw = getMessageText(state.sourceMessage); state.richSource = richSnapshot(state.sourceMessage); }
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
    left.classList.toggle('lfr-rich-page', !!state.richSource);
    right.classList.toggle('lfr-rich-page', !!state.richSource);
    if (state.richSource) return richPaginate();
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
    const left=$('[data-page="left"]',state.root),right=$('[data-page="right"]',state.root);
    if(state.richSource){
      const positions=textPositions(state.richSource);
      for(const [el,page] of [[left,state.pages[state.spread*2]],[right,state.pages[state.spread*2+1]]])
        el.replaceChildren(page?rangeSlice(state.richSource,positions,page[0],page[1]):document.createDocumentFragment());
    } else {left.textContent=state.pages[state.spread*2]||'';right.textContent=state.pages[state.spread*2+1]||'';}
    $('.lfr-num-left',state.root).textContent=state.pages.length?String(state.spread*2+1):'';
    $('.lfr-num-right',state.root).textContent=state.pages[state.spread*2+1]?String(state.spread*2+2):'';
    $('.lfr-notice',state.root).textContent='';
  }
  function schedule() {
    clearFlip();
    if(state.timer) cancelAnimationFrame(state.timer);
    state.timer=requestAnimationFrame(()=>{state.timer=0;try{paginate();}catch(err){console.error('[Little Fish Reader]',err);if(state.root)$('.lfr-notice',state.root).textContent='排版失败：'+err.message;}});
  }
  // 3D flip is a presentation-only layer: never repaginate or mutate source DOM.
  // Forward: old right page rotates right-to-left, with next left on its back.
  // Backward: old left page rotates left-to-right, with previous right on its back.
  function clearFlip() {
    if (state.flipTimer) { clearTimeout(state.flipTimer); state.flipTimer = null; }
    state.flipLayer?.remove(); state.flipLayer = null;
    state.turning = false;
    state.root?.classList.remove('lfr-flipping','lfr-flip-forward-active','lfr-flip-backward-active','lfr-flip-mid');
  }
  function turn(direction) {
    if (state.turning) return;
    const oldSpread=state.spread, next=oldSpread+direction;
    if(next<0||next>=Math.ceil(state.pages.length/2))return;
    const pages=$('.lfr-pages',state.root);
    const left=$('[data-page="left"]',pages),right=$('[data-page="right"]',pages);
    if(getComputedStyle(right).display==='none'||window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      state.spread=next;render();return;
    }
    // Snapshot both spreads without leaving the destination in the live DOM.
    // Keeping the original spread visible is essential for translucent paper.
    const oldLeft=left.cloneNode(true),oldRight=right.cloneNode(true);
    state.spread=next;render();
    const newLeft=left.cloneNode(true),newRight=right.cloneNode(true);
    state.spread=oldSpread;render();
    const layer=document.createElement('div');layer.className='lfr-flip-layer';
    const stationary=document.createElement('div');stationary.className='lfr-flip-stationary';
    const sheet=document.createElement('div');sheet.className='lfr-flip-sheet '+(direction>0?'lfr-flip-forward':'lfr-flip-backward');
    const front=document.createElement('div');front.className='lfr-flip-face lfr-flip-front';
    const back=document.createElement('div');back.className='lfr-flip-face lfr-flip-back';
    const cloneInto=(target,source)=>{
      target.classList.add('lfr-page');
      if(source.classList.contains('lfr-rich-page'))target.classList.add('lfr-rich-page');
      target.replaceChildren(...Array.from(source.childNodes).map(n=>n.cloneNode(true)));
    };
    // The opposite destination page must be visible as the turning sheet lifts.
    // The stationary old page is the actual original DOM, not a transparent clone
    // laid over prematurely rendered destination content.
    cloneInto(stationary,direction>0?newRight:newLeft);
    stationary.classList.add(direction>0?'lfr-stationary-right':'lfr-stationary-left');
    cloneInto(front,direction>0?oldRight:oldLeft);
    cloneInto(back,direction>0?newLeft:newRight);
    const numberFor=(spread,side)=>{const index=spread*2+(side==='right'?1:0);return state.pages[index]?String(index+1):'';};
    const addNumber=(el,value)=>{if(!value)return;const num=document.createElement('div');num.className='lfr-flip-number';num.textContent=value;el.append(num);};
    addNumber(stationary,numberFor(next,direction>0?'right':'left'));
    addNumber(front,numberFor(oldSpread,direction>0?'right':'left'));
    addNumber(back,numberFor(next,direction>0?'left':'right'));
    sheet.append(front,back);layer.append(stationary,sheet);pages.append(layer);
    // Temporary labels reveal which DOM surface contributes to a ghost.
    layer.setAttribute('data-debug-layer','临时图层');
    stationary.setAttribute('data-debug-layer','静止副本');
    front.setAttribute('data-debug-layer','旋转正面');
    back.setAttribute('data-debug-layer','旋转背面');
    state.flipLayer=layer;state.turning=true;state.root.classList.add('lfr-flipping',direction>0?'lfr-flip-forward-active':'lfr-flip-backward-active');
    void sheet.offsetWidth;
    const finish=()=>{
      if(state.flipLayer!==layer)return;
      // Atomic handoff: the temporary faces and the live spread must never
      // coexist for a fading frame (which caused ghost text and double folios).
      state.spread=next;
      render();
      clearFlip();
    };
    sheet.addEventListener('transitionend',e=>{
      if(e.target===sheet&&e.propertyName==='transform')finish();
    });
    sheet.addEventListener('transitioncancel',finish,{once:true});
    requestAnimationFrame(()=>{
      if(state.flipLayer!==layer)return;
      sheet.classList.add('lfr-flip-go');
      // Once the turning face passes the spine, its back covers the old
      // stationary page; hide the old live text to avoid translucent ghosting.
      setTimeout(()=>{if(state.flipLayer===layer)state.root.classList.add('lfr-flip-mid');},375);
      state.flipTimer=setTimeout(finish,540);
    });
  }
  function openReader(mes) {
    const text=getMessageText(mes);
    if(!text)return;
    if(!state.root)buildOverlay();
    clearFlip();state.sourceMessage=mes;state.raw=text;state.richSource=richSnapshot(mes);state.spread=0;
    inheritAppearance(mes);
    state.root.hidden=false;state.root.classList.remove('lfr-show-tools');
    $('.lfr-settings', state.root).hidden = true;
    alignBook(); schedule();
  }
  function closeReader() {clearFlip();if(state.root){state.root.hidden=true;state.root.classList.remove('lfr-show-tools');}state.sourceMessage=null;state.richSource=null;}
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
