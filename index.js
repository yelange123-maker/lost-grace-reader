/* Little Fish Reader — isolated SillyTavern extension prototype.
   Only inserts launch buttons and an overlay; never changes existing message content. */
(() => {
  'use strict';
  if (window.__littleFishReaderLoaded) return;
  window.__littleFishReaderLoaded = true;
  const $ = (selector, root = document) => root.querySelector(selector);
  const state = { root: null, raw: '', pages: [], spread: 0, font: 20, timer: 0, resize: null, observer: null, lastTouch: null, swiped: 0, tools: false, sourceMessage: null, richSource: null, turning: false, flipLayer: null, flipTimer: null, streamTimer: null, streamBusy: false, streamText: '', streamFrozen: [], streamSourceText: '', streamLastCheck: 0, align: true, showPenguin: false, excludedTags: ['thinking','think','visible-analysis','status_panel','status_collect','status_sex','Jiang_StatusBar','Shan_StatusBar','baisui_status','details'] };
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
    bubble.textContent=text;
    // Zero-width boundary markers make the entire visual component visible to
    // text-offset pagination, including its otherwise textless avatar.
    box.append(document.createTextNode('\u200B'),avatar,bubble,document.createTextNode('\u200B'));return box;
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
  // The penguin switch controls the entire component, not merely its skin.
  // Reconcile rendered text against raw chat markers, just as Slate recovery
  // reconciles rendered layout with the original structured message.
  // Remove empty containers left behind when a whole penguin component is filtered.
  // Do this BEFORE pagination: hiding only the text leaves paragraph margins and
  // whitespace-only wrappers in the measured page flow.
  function prunePenguinGap(node, snapshot) {
    let current = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    while (current && current !== snapshot) {
      const parent = current.parentElement;
      if (!parent) break;
      // Never collapse Slate or another styled component's structural wrapper.
      if (current.closest('.elegant-slate-container,.lfr-penguin')) break;
      if (current.textContent.trim() || current.querySelector('img,svg,video,canvas,.elegant-slate-container,.lfr-penguin')) break;
      // A lone <br> left in a now-empty paragraph is an artifact, not prose.
      if (current.matches('p,div,span,blockquote') &&
          !current.querySelector('hr,table,ul,ol')) {
        current.remove();
        current = parent;
      } else break;
    }
  }
  // Treat penguin-only paragraphs as compact inline inserts. The generic
  // novel paragraph rule adds 1em before adjacent blocks; a chat bubble
  // should not reserve that spacing (including when later hidden).
  function compactPenguinBlocks(snapshot) {
    for (const bubble of snapshot.querySelectorAll('.lfr-penguin')) {
      const block = bubble.closest('p,blockquote');
      if (!block || !snapshot.contains(block)) continue;
      // Only alter blocks whose visible content is this one penguin component.
      const other = block.textContent.replace(bubble.textContent, '').trim();
      if (other) continue;
      block.classList.add('lfr-penguin-block');
    }
  }
  function restorePenguins(snapshot, mes) {
    const raw = originalMessage(mes);
    const tokens = raw ? [...raw.matchAll(/\[企鹅说\|(normal|playful|serious|sad|rebut|lewd)\|([^\]]+)\]/g)] : [];
    if (!tokens.length) {
      console.info('[Little Fish Reader] Penguin: no raw markers available; rendered dm-* components handled directly');
      return;
    }
    let matched = 0;
    // Walk backwards: modifying a later token cannot invalidate earlier text.
    // Recompute text offsets after each edit because DOM ranges change.
    for (const token of tokens.reverse()) {
      const kind = token[1], spoken = token[2], marker = token[0];
      const existing = [...snapshot.querySelectorAll('.lfr-penguin')]
        .some(el => el.textContent.trim() === spoken.trim());
      if (existing && state.showPenguin) { matched++; continue; }
      const positions = textPositions(snapshot);
      const flat = positions.nodes.map(n => n.node.nodeValue).join('');
      // Some regex engines leave the original marker visible, others leave
      // only the spoken words. Prefer the complete marker when present.
      let start = flat.lastIndexOf(marker), end = start + marker.length;
      if (start < 0) {
        start = flat.lastIndexOf(spoken);
        end = start + spoken.length;
      }
      if (start < 0) {
        const compact = spoken.replace(/\s+/g, '');
        if (!compact) continue;
        const compactAt = flat.replace(/\s+/g, '').lastIndexOf(compact);
        if (compactAt < 0) continue;
        let seen = 0; start = -1; end = -1;
        for (let i = 0; i < flat.length; i++) {
          if (/\s/.test(flat[i])) continue;
          if (seen === compactAt) start = i;
          seen++;
          if (seen === compactAt + compact.length) { end = i + 1; break; }
        }
      }
      if (start < 0 || end < 0) continue;
      const locate = offset => {
        for (const n of positions.nodes) if (offset < n.end) return [n.node, offset - n.start];
        const last = positions.nodes.at(-1);
        return last ? [last.node, last.node.nodeValue.length] : null;
      };
      const first = locate(start), last = locate(end);
      if (!first || !last) continue;
      // Existing styled components are handled by richSnapshot.copy().
      if (first[0].parentElement?.closest('.lfr-penguin') || last[0].parentElement?.closest('.lfr-penguin')) continue;
      const range = document.createRange();
      range.setStart(first[0], first[1]); range.setEnd(last[0], last[1]);
      // Capture the containing element before Range.deleteContents() splits it.
      const host = first[0].parentElement;
      range.deleteContents();
      if (state.showPenguin) range.insertNode(penguinBubble(kind, spoken));
      else prunePenguinGap(host, snapshot);
      matched++;
    }
    console.info('[Little Fish Reader] Penguin:', state.showPenguin ? 'shown' : 'hidden', matched, 'of', tokens.length);
  }
  // Generic regex-HTML compatibility: sample the browser's already-computed
  // styles instead of executing <style> blocks or importing arbitrary selectors.
  // Copy only a narrow set of visual properties; never copy positioning, URLs,
  // animations, transforms, visibility, or untrusted class names.
  const decorativeProps = ['backgroundColor','borderRadius','paddingTop','paddingRight','paddingBottom','paddingLeft',
    'marginTop','marginRight','marginBottom','marginLeft','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth',
    'borderTopStyle','borderRightStyle','borderBottomStyle','borderLeftStyle','borderTopColor','borderRightColor','borderBottomColor','borderLeftColor',
    'boxShadow','textAlign','lineHeight','fontSize','maxWidth'];
  function safeDecorValue(prop,value) {
    if (!value || value.length > 180 || /url\s*\(|expression\s*\(|var\s*\(|[;{}]/i.test(value)) return false;
    if (prop === 'boxShadow') return value === 'none' || (/^[#\w\s.,()%+-]+$/.test(value) && value.length < 130);
    if (prop === 'maxWidth') return /^(none|\d+(?:\.\d+)?(?:px|%))$/.test(value);
    if (prop === 'fontSize') return /^\d+(?:\.\d+)?px$/.test(value) && parseFloat(value)>=8 && parseFloat(value)<=60;
    if (prop === 'lineHeight') return /^(normal|\d+(?:\.\d+)?px)$/.test(value);
    if (/^(padding|margin|border.*Width)/.test(prop)) return /^-?\d+(?:\.\d+)?px$/.test(value) && Math.abs(parseFloat(value))<=80;
    if (prop === 'textAlign') return /^(left|right|center|justify|start|end)$/.test(value);
    if (prop.endsWith('Style')) return /^(none|solid|dashed|dotted|double)$/.test(value);
    if (prop.endsWith('Color') || prop === 'backgroundColor') return /^(transparent|currentcolor|rgba?\([\d\s.,%]+\)|#[\da-f]{3,8})$/i.test(value);
    if (prop === 'borderRadius') return /^[\d.%px\s/]+$/.test(value) && value.length<90;
    return false;
  }
  function decorateFromSource(el,out) {
    if (!el.classList.length || [...el.classList].some(c=>slateClasses.has(c)) || el.closest('.lfr-penguin')) return;
    const cs=getComputedStyle(el);
    // Avoid turning ordinary SillyTavern paragraphs into decorative widgets.
    const visual = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent' ||
      [...['Top','Right','Bottom','Left']].some(side=>parseFloat(cs['border'+side+'Width'])>0) ||
      [...['Top','Right','Bottom','Left']].some(side=>parseFloat(cs['padding'+side])>=5) ||
      cs.boxShadow !== 'none';
    const isLayout = cs.display === 'flex' || cs.display === 'inline-flex';
    if (!visual && !isLayout) return;
    out.classList.add('lfr-decorated');
    for(const prop of decorativeProps){
      const value=cs[prop];
      if(safeDecorValue(prop,value))out.style[prop]=value;
    }
    if (isLayout) {
      out.style.display=cs.display;
      if (/^(row|column|row-reverse|column-reverse)$/.test(cs.flexDirection))out.style.flexDirection=cs.flexDirection;
      if (/^(flex-start|flex-end|center|stretch|baseline)$/.test(cs.alignItems))out.style.alignItems=cs.alignItems;
      if (/^(flex-start|flex-end|center|space-between|space-around|space-evenly)$/.test(cs.justifyContent))out.style.justifyContent=cs.justifyContent;
      if (/^\d+(?:\.\d+)?px$/.test(cs.gap) && parseFloat(cs.gap)<=48)out.style.gap=cs.gap;
    } else if (cs.display === 'inline-block') out.style.display='inline-block';
    // Keep the complete component together when possible; the paginator may
    // split it as a fallback if it exceeds a full page.
    out.dataset.lfrDecorated='1';
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
        // An entire recognized dm-* component is omitted when disabled.
        const words=el.querySelector(':scope > span:not(.dm-avatar)');
        const spoken=(words || el).textContent || '';
        if (state.showPenguin) parent.append(penguinBubble(penguin,spoken));
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
      decorateFromSource(el,out);
      parent.append(out);
      for (const child of el.childNodes) copy(child,out);
    }
    // Copy the source element itself when it is an allowlisted component.
    // Previously its class was lost because only source.childNodes were copied.
    if ([...source.classList].some(c => slateClasses.has(c))) copy(source,wrapper);
    else for (const child of source.childNodes) copy(child,wrapper);
    restoreSlate(wrapper,mes);
    restorePenguins(wrapper,mes);
    compactPenguinBlocks(wrapper);
    // Also handle a regex-rendered dm-* component that was skipped in copy().
    // It may have left an empty parent block that still carries margin/padding.
    if (!state.showPenguin) {
      for (const el of [...wrapper.querySelectorAll('p,div,span,blockquote')].reverse()) {
        if (el.closest('.elegant-slate-container,.lfr-penguin')) continue;
        if (!el.textContent.trim() && !el.querySelector('img,svg,video,canvas,hr,table,ul,ol')) el.remove();
      }
    }
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
    left.replaceChildren();right.replaceChildren();
    const source=state.richSource,positions=textPositions(source);
    // Preserve fully completed leading pages when the source only grows.
    // Always reflow the last two pages: their margins/markup can still change.
    const prior=state.streamFrozen;
    const canReuse=prior.length && positions.total>=state.streamSourceText.length &&
      positions.nodes.map(n=>n.node.nodeValue).join('').startsWith(state.streamSourceText);
    state.pages=canReuse?prior.map(x=>x.slice()):[];
    const bubbles=[...source.querySelectorAll('.lfr-penguin,.lfr-decorated')].filter(el=>
      el.classList.contains('lfr-penguin') || !el.parentElement?.closest('.lfr-decorated')).map(el=>{
      const nodes=positions.nodes.filter(n=>el.contains(n.node));
      return nodes.length?{start:nodes[0].start,end:nodes[nodes.length-1].end}:null;
    }).filter(Boolean);
    let start=state.pages.length?state.pages[state.pages.length-1][1]:0,guard=0;
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
      // A bubble at the start of a page should remain intact if it fits.
      // Only an individually oversized bubble may fall back to text splitting.
      if(crossing && crossing.start===start) {
        const whole=crossing.end;
        if(fitsRange(el,whole)) best=Math.max(best,whole);
      }
      if(best===start)best=start+1;
      if(best<positions.total){
        const [a,ao]=(()=>{for(const x of positions.nodes)if(best<x.end)return [x.node,best-x.start];return [null,0];})();
        if(a && ao>0 && ao<a.nodeValue.length && /[\uDC00-\uDFFF]/.test(a.nodeValue[ao]) && /[\uD800-\uDBFF]/.test(a.nodeValue[ao-1]))best--;
      }
      best=Math.max(start+1,best);
      state.pages.push([start,best]);start=best;
      el.replaceChildren();
    }
    state.streamSourceText=positions.nodes.map(n=>n.node.nodeValue).join('');
    state.streamFrozen=state.pages.slice(0,Math.max(0,state.pages.length-2)).map(x=>x.slice());
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
      btn.textContent = ''; // icon supplied by CSS; aria-label remains for accessibility
      btn.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); openReader(mes); });
      anchor.append(btn);
    });
  }
  function buildOverlay() {
    const root = document.createElement('div'); root.id = 'lfr-root';
    root.innerHTML = `<div class="lfr-backdrop"></div><section class="lfr-book" role="dialog" aria-modal="true" aria-label="小鱼阅读器"><div class="lfr-tools"><span class="lfr-title">小鱼阅读器 · v0.3</span><button data-action="smaller" title="缩小字号">A−</button><button data-action="larger" title="放大字号">A+</button><button data-action="close" title="退出阅读模式">退出 ✕</button><button data-action="settings" title="阅读设置">⚙</button></div><div class="lfr-settings" hidden><label><input type="checkbox" class="lfr-align-toggle" checked> 对齐酒馆聊天区域</label><label><input type="checkbox" class="lfr-penguin-toggle"> 显示特殊美化（弹幕、短信等）</label><button type="button" class="lfr-debug-toggle" data-action="toggle-debug" aria-pressed="false">Debug：关闭</button><label for="lfr-tags">清洗标签（每行一个标签名，不带尖括号）</label><textarea id="lfr-tags" spellcheck="false"></textarea><div class="lfr-settings-actions"><button data-action="save-settings">保存并重新排版</button><button data-action="cancel-settings">取消</button></div></div><div class="lfr-pages"><article class="lfr-page" data-page="left"></article><article class="lfr-page" data-page="right"></article><span class="lfr-num lfr-num-left"></span><span class="lfr-num lfr-num-right"></span><div class="lfr-notice" aria-live="polite"></div></div></section>`;
    document.body.append(root);
    state.root = root;
    cssFont();
    // Diagnostic control: cycles visibility of distinct page sources.
    const debug=document.createElement('div');
    debug.className='lfr-debug-panel';
    debug.hidden=true;
    debug.innerHTML='<span class="lfr-debug-title">图层诊断 · 调试工具</span><button type="button" class="lfr-debug-cycle">模式：全部显示</button><span class="lfr-debug-note">点击切换模式，再翻页录屏</span>';
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
      if (action === 'toggle-debug') {
        const enabled = root.classList.toggle('lfr-debug-enabled');
        debug.hidden = !enabled;
        if (!enabled) {
          modeIndex = 0;
          root.dataset.lfrDebug = 'all';
          debug.querySelector('.lfr-debug-cycle').textContent = '模式：全部显示';
        }
        const toggle = $('.lfr-debug-toggle', root);
        toggle.textContent = enabled ? 'Debug：开启' : 'Debug：关闭';
        toggle.setAttribute('aria-pressed', String(enabled));
        return;
      }
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
        state.streamFrozen=[];state.streamSourceText='';alignBook(); state.spread = 0; schedule(); return;
      }
      if (e.target.closest('.lfr-settings')) return;
      if (action === 'smaller' || action === 'larger') {
        state.font = Math.max(12, Math.min(34, state.font + (action === 'larger' ? 2 : -2)));
        state.streamFrozen=[];state.streamSourceText='';cssFont(); state.spread = 0; schedule(); return;
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
  // Streaming messages are edited in-place by SillyTavern. Poll the source, not
  // the reader overlay, so reader rendering never triggers recursive updates.
  // Coalesce changes and never interrupt a page-turn transition.
  function syncStream() {
    const mes=state.sourceMessage;
    if(!mes || !state.root || state.root.hidden || !mes.isConnected || state.turning)return;
    const raw=getMessageText(mes);
    if(raw===state.streamText)return;
    const old=state.streamText;
    state.streamText=raw;
    if(!raw)return;
    // Edits/regenerations invalidate frozen boundaries.
    if(!raw.startsWith(old)) {state.streamFrozen=[];state.streamSourceText='';}
    state.raw=raw;state.richSource=richSnapshot(mes);
    schedule();
  }
  function startStream() {
    stopStream();
    state.streamTimer=setInterval(syncStream,350);
  }
  function stopStream() {
    if(state.streamTimer){clearInterval(state.streamTimer);state.streamTimer=null;}
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
  // Conceal only the source message visually. Keep its DOM and computed child
  // styles intact so streaming snapshots and rich-text parsing still work.
  function restoreSourceMessage() {
    if (state.sourceMessage) state.sourceMessage.classList.remove('lfr-source-concealed');
  }
  function openReader(mes) {
    const text=getMessageText(mes);
    if(!text)return;
    if(!state.root)buildOverlay();
    clearFlip();stopStream();restoreSourceMessage();state.streamFrozen=[];state.streamSourceText='';
    state.sourceMessage=mes;state.raw=text;state.streamText=text;state.richSource=richSnapshot(mes);state.spread=0;
    inheritAppearance(mes);
    state.root.hidden=false;state.root.classList.remove('lfr-show-tools');
    mes.classList.add('lfr-source-concealed');
    $('.lfr-settings', state.root).hidden = true;
    alignBook(); schedule();startStream();
  }
  function closeReader() {stopStream();clearFlip();restoreSourceMessage();if(state.root){state.root.hidden=true;state.root.classList.remove('lfr-show-tools');}state.sourceMessage=null;state.richSource=null;}
  window.addEventListener('resize', () => { if (state.root && !state.root.hidden) { state.streamFrozen=[];state.streamSourceText='';alignBook(); schedule(); } });
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
