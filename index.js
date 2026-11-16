/* Little Fish Reader — isolated SillyTavern extension prototype.
   Only inserts launch buttons and an overlay; never changes existing message content. */
(() => {
  'use strict';
  if (window.__littleFishReaderLoaded) return;
  window.__littleFishReaderLoaded = true;
  const $ = (selector, root = document) => root.querySelector(selector);
  const state = { root: null, raw: '', pages: [], spread: 0, font: 20, timer: 0, resize: null, observer: null, lastTouch: null, swiped: 0, tools: false, sourceMessage: null };
  const cssFont = () => state.root?.style.setProperty('--lfr-font', state.font + 'px');
  function getMessageText(mes) {
    const node = $('.mes_text', mes) || $('.mes-text', mes);
    if (!node) return '';
    const clone = node.cloneNode(true);
    clone.querySelectorAll('script,style,button,input,textarea,select,.mes_buttons,.mes_button').forEach(n => n.remove());
    clone.querySelectorAll('br').forEach(n => n.replaceWith('\n'));
    clone.querySelectorAll('p,div,blockquote,li,h1,h2,h3,h4,pre').forEach(n => n.append('\n\n'));
    return (clone.textContent || '').replace(/\u00a0/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
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
    root.innerHTML = `<div class="lfr-backdrop"></div><section class="lfr-book" role="dialog" aria-modal="true" aria-label="小鱼阅读器"><div class="lfr-tools"><span class="lfr-title">小鱼阅读器 · 测试版</span><button data-action="smaller" title="缩小字号">A−</button><button data-action="larger" title="放大字号">A+</button><button data-action="close" title="退出阅读模式">退出 ✕</button></div><div class="lfr-pages"><article class="lfr-page" data-page="left"></article><article class="lfr-page" data-page="right"></article><span class="lfr-num lfr-num-left"></span><span class="lfr-num lfr-num-right"></span><div class="lfr-notice" aria-live="polite"></div></div></section>`;
    document.body.append(root);
    state.root = root;
    cssFont();
    root.addEventListener('click', e => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'close') return closeReader();
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
    state.root.hidden=false;state.root.classList.remove('lfr-show-tools');
    schedule();
  }
  function closeReader() {if(state.root){state.root.hidden=true;state.root.classList.remove('lfr-show-tools');}state.sourceMessage=null;}
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
