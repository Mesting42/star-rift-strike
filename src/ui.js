import { WEAPONS, ITEMS, SKILLS, SYNERGIES } from './content.js';
import { equipmentArt } from './equipment-art.js';
import { renderSettings } from './settings-ui.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const entry = (table, id) => typeof id === 'object' ? id : (Array.isArray(table) ? table.find(item => item.id === id) : table?.[id]) || { id, name: id || '未装配' };
const name = data => data?.name || data?.label || '未装配';
const description = data => data?.description || data?.desc || data?.detail || '';
const clamp = value => Math.max(0, Math.min(100, value));
const time = seconds => `${Math.floor((seconds || 0) / 60).toString().padStart(2, '0')}:${Math.floor((seconds || 0) % 60).toString().padStart(2, '0')}`;
const types = {
  start: ['出发空域', 'DEPLOY', 'start'], entry: ['出发空域', 'DEPLOY', 'start'], combat: ['交战空域', 'ENGAGE', 'combat'], battle: ['交战空域', 'ENGAGE', 'combat'], elite: ['精英截击', 'ELITE', 'elite'],
  shop: ['补给舰', 'SUPPLY', 'shop'], treasure: ['物资回收', 'SALVAGE', 'treasure'], cache: ['物资回收', 'SALVAGE', 'treasure'], reward: ['物资回收', 'SALVAGE', 'treasure'],
  event: ['异常信号', 'SIGNAL', 'event'], special: ['异常信号', 'SIGNAL', 'event'], secret: ['隐藏空域', 'UNKNOWN', 'secret'], hidden: ['隐藏空域', 'UNKNOWN', 'secret'], exit: ['跃迁入口', 'TRANSIT', 'exit'],
  boss: ['核心目标', 'NEMESIS', 'boss'], heal: ['维修平台', 'REPAIR', 'shop']
};
const typeInfo = type => types[type] || ['未知空域', 'UNKNOWN', 'event'];
const button = (label, action, value = '', className = '', disabled = false) => `<button class="${className}" data-action="${esc(action)}" data-value="${esc(value)}" ${disabled ? 'disabled' : ''}>${label}</button>`;
const chevron = '<span class="arrow" aria-hidden="true">↗</span>';
const plane = '<svg viewBox="0 0 52 48" aria-hidden="true"><path d="M26 1 31 20 49 31 49 37 31 32 30 41 37 46 37 48 26 45 15 48 15 46 22 41 21 32 3 37 3 31 21 20Z" fill="currentColor"/></svg>';

export class UI {
  constructor(root, onAction) {
    this.root = root;
    this.onAction = onAction;
    this.version = null;
    this.lastMode = '';
    this.lastHUD = 0;
    this.game = null;
    this.graphicsQuality = 'high';
    this.toastElement = document.getElementById('toast') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'toast' }));
    this.root.addEventListener('click', event => {
      const target = event.target.closest('[data-action]');
      if (!target || target.disabled || target.matches('input')) return;
      let value = target.dataset.value;
      if (/^(buy|takeReward|chooseEvent|switchWeapon)$/.test(target.dataset.action)) value = Number(value);
      if (target.dataset.action === 'chooseNode' && /^\d+$/.test(value)) value = Number(value);
      this.onAction(target.dataset.action, value);
    });
    this.root.addEventListener('input', event => {
      if (!event.target.matches('input[data-action]')) return;
      const input = event.target;
      const value = Number(input.value);
      const output = input.closest('.setting-row')?.querySelector('output');
      if (output) output.textContent = input.dataset.action === 'sensitivity' ? `${value.toFixed(1)}×` : `${Math.round(value * 100)}%`;
      this.onAction(input.dataset.action, value);
    });
    this.root.addEventListener('keydown', event => {
      const node = event.target.closest('.map-node[data-action]');
      if (!node || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }

  update(game) {
    this.game = game;
    if (game.uiVersion !== this.version || game.mode !== this.lastMode) {
      this.version = game.uiVersion;
      this.lastMode = game.mode;
      this.root.dataset.mode = game.mode;
      this.root.innerHTML = this.render(game);
      const focus = this.root.querySelector('[data-autofocus]');
      if (focus) focus.focus({ preventScroll: true });
    }
    if (game.mode === 'combat' && performance.now() - this.lastHUD > 85) {
      this.lastHUD = performance.now();
      this.updateHUD(game);
    }
    if (game.mode === 'map') this.updateMapTargets();
  }

  updateMapTargets() {
    const chart = this.root.querySelector('.flight-chart');
    const touch = document.documentElement.dataset.input === 'touch';
    if (!chart) return;
    const layout = `${chart.clientWidth}:${chart.clientHeight}:${touch}:${this.version}`;
    if (layout === this.mapLayout) return;
    this.mapLayout = layout;
    const matrix = chart.getScreenCTM();
    const scale = matrix ? Math.min(Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d)) : 1;
    // Invisible hit regions remain at least 48 CSS pixels wide after the SVG
    // is scaled down, without making the drawn nodes or route labels overlap.
    const radius = Math.max(25, 24 / Math.max(.1, scale));
    for (const target of chart.querySelectorAll('.node-target')) target.style.r = touch ? `${radius}px` : '';
  }

  toast(text) {
    clearTimeout(this.toastTimer);
    this.toastElement.textContent = text;
    this.toastElement.classList.add('visible');
    this.toastTimer = setTimeout(() => this.toastElement.classList.remove('visible'), 3100);
  }

  header(game, label = '飞行作战系统') {
    const navigation = ['help', 'settings', 'inventory'].includes(game.mode) ? button('<span class="key-hint">ESC</span> 返回', 'back', '', 'small-nav') : ['combat', 'map'].includes(game.mode) ? button('<span class="key-hint">ESC</span> 暂停', 'pause', '', 'small-nav') : '<span class="small-nav">安全空域</span>';
    return `<header class="nav-bar"><div class="wordmark"><span class="brand-mark">${plane}</span><span>STAR RIFT<i>星隙突击</i></span></div><div class="nav-meta"><span>${esc(label)}</span><span class="status-dot"></span><span>机组在线</span></div>${navigation}</header>`;
  }

  render(game) {
    switch (game.mode) {
      case 'menu': return this.menu(game);
      case 'combat': return this.combat(game);
      case 'map': return this.map(game);
      case 'shop': return this.shop(game);
      case 'reward': return this.reward(game);
      case 'event': return this.event(game);
      case 'pause': return this.pause(game);
      case 'inventory': return this.inventory(game);
      case 'settings': return this.settings(game);
      case 'help': return this.help(game);
      case 'win': return this.result(game, true);
      case 'dead': return this.result(game, false);
      default: return this.combat(game);
    }
  }

  menu(game) {
    return `<div class="menu-screen"><header class="menu-nav"><div class="wordmark"><span class="brand-mark">${plane}</span><span>STAR RIFT<i>独立飞行作战计划</i></span></div><div class="menu-nav-right"><span class="status-dot"></span> SYSTEM READY <span class="menu-serial">SR — 02</span></div></header>
      <div class="side-serial">航空作战档案 / FLIGHT OPERATIONS 2097</div>
      <main class="menu-hero"><div class="eyebrow"><span class="line-mark"></span> TWO SECTORS. ONE WAY HOME.</div><h1>STAR<br><span>RIFT<span class="title-dot">.</span></span></h1><div class="title-cn">星隙突击<span>竖版射击 / 随机航线 / 肉鸽构筑</span></div></main>
      <div class="craft-caption"><span class="caption-cross">+</span><span>游隼级 / PEREGRINE<br><b>单座多用途突击战机</b></span><span class="caption-line"></span></div>
      <footer class="menu-footer"><div class="briefing"><span class="eyebrow">MISSION BRIEF / 任务简报</span><p>穿过云海防线，跃迁至失控轨道。<br>选择航线，装配火力，击毁敌方核心。</p><div class="flight-meta"><span>02 作战区域</span><span>随机航线</span><span>单局 8–15 分钟</span></div></div><div class="menu-actions">${button(`<span><small>DEPLOY</small>开始出击</span>${chevron}`, 'start', '', 'primary launch-button')}
      <div class="menu-secondary">${button('操作指南 <span>↗</span>', 'help')}${button('游戏设置 <span>↗</span>', 'settings')}</div></div><div class="menu-bottom"><span>每一次出击，都是一条新航线。</span><span class="keyboard-hint">WASD 移动 · SHIFT 机动 · E 技能</span><span class="touch-hint">拖动战场移动 · 闪避与技能 · 自动开火</span></div></footer></div>`;
  }

  combat(game) {
    const weapon = entry(WEAPONS, game.weapons?.[game.weaponIndex || 0]);
    const skill = entry(SKILLS, game.skill);
    return `<div class="combat-screen"><header class="combat-top"><div class="combat-brand"><span class="tiny-plane">${plane}</span><b>SR</b><span id="hud-sector">${String(game.sector || 1).padStart(2, '0')}</span></div><div class="hull-block"><div class="hud-label"><b>机体完整度</b><span id="hud-hp">—</span></div><div class="hull-track"><i id="hud-hp-bar"></i></div><div class="shield-row"><span>SHIELD</span><div class="shield-track"><i id="hud-shield-bar"></i></div><span id="hud-shield">—</span></div><div class="damage-readout" aria-live="polite"><span id="hud-impact"></span><span id="hud-protection"></span></div></div><div class="combat-objective"><span id="hud-mission">${esc(this.currentNode(game)?.name || '清除空域威胁')}</span><small id="hud-timer">00:00</small></div><div class="hud-money"><b id="hud-money">0</b><span>信用点</span></div><button data-action="pause" class="pause-icon" aria-label="暂停游戏">Ⅱ</button></header>
      <div id="boss-hud" class="boss-hud" hidden><div class="boss-label"><span>敌方核心 / NEMESIS</span><strong id="hud-boss-phase">PHASE 01</strong></div><div class="boss-track"><i id="hud-boss-bar"></i></div></div>
      <div id="boss-warning" class="boss-warning" role="status" aria-live="polite" ${game.bossWarning ? '' : 'hidden'}><div class="boss-warning-band"><div class="boss-warning-meta"><span>THREAT DETECTED / 高危目标接近</span><span>SECTOR 02</span></div><div class="boss-warning-title"><svg viewBox="0 0 48 44" aria-hidden="true"><path d="M24 3 45 40H3Z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M24 15V26M24 31V33" stroke="currentColor" stroke-width="4"/></svg><strong>DANGER</strong></div><div class="boss-warning-target"><span>敌方核心母舰</span><b>${esc(game.bossWarning?.name || '天穹裁决者')}</b></div><div class="boss-warning-ready"><span>战斗即将开始</span><span id="hud-warning-time">2.0s</span></div><div class="boss-warning-track"><i id="hud-warning-bar"></i></div></div></div>
      <footer class="combat-bottom"><div class="weapon-block"><span class="hud-overline">主武器 / <span id="hud-weapon-number">01</span></span><strong id="hud-weapon">${esc(name(weapon))}</strong><div class="weapon-readout"><span id="hud-ammo">∞ 无限弹药</span></div><small>Q 切换武器 · 持续开火</small></div>
      <div class="flight-controls"><div class="cooldown-slot"><span class="key-box">SHIFT</span><div><b>闪避机动</b><span id="hud-dash">就绪</span></div><i id="hud-dash-bar"></i></div>${button(`<span class="key-box">E</span><span><b id="hud-skill">${esc(name(skill))}</b><small id="hud-skill-cd">就绪</small></span>`, 'useSkill', '', 'cooldown-slot skill-slot')}<div class="hud-aux">${button('装备 <span>TAB</span>', 'inventory')}${button('自动射击 <span id="hud-auto">开启</span>', 'auto')}</div></div><div class="combat-corner"><span id="hud-kills">0</span><small>击毁</small></div></footer></div>`;
  }

  currentNode(game) {
    return typeof game.currentNode === 'object' ? game.currentNode : game.map?.nodes?.find(node => node.id === game.currentNode);
  }

  updateHUD(game) {
    const p = game.player || {};
    const set = (id, value) => { const el = this.root.querySelector(`#${id}`); if (el && el.textContent !== String(value)) el.textContent = value; };
    const width = (id, value) => { const el = this.root.querySelector(`#${id}`); if (el) el.style.width = `${clamp(value)}%`; };
    set('hud-hp', `${Math.ceil(p.hp || 0)} / ${p.maxHp || 100}`);
    width('hud-hp-bar', (p.hp || 0) / (p.maxHp || 100) * 100);
    set('hud-shield', Math.ceil(p.shield || 0));
    width('hud-shield-bar', (p.shield || 0) / (p.maxShield || 1) * 100);
    const recentHit = game.hitFeedback && game.time - game.hitFeedback.at < 1.35 ? game.hitFeedback : null;
    const loss = value => Number(value.toFixed(1));
    const impact = recentHit ? [recentHit.shield > 0 ? `护盾 −${loss(recentHit.shield)}` : '',
      recentHit.hull > 0 ? `机体 −${loss(recentHit.hull)}` : ''].filter(Boolean).join(' / ') : '';
    set('hud-impact', impact);
    const protection = { entry: '入场保护', dash: '闪避保护', skill: '力场保护', hit: '受击保护' };
    set('hud-protection', p.inv > 0 ? protection[p.invReason] || '保护中' : '');
    const hullBlock = this.root.querySelector('.hull-block');
    if (hullBlock) {
      hullBlock.dataset.hit = recentHit ? recentHit.hull > 0 ? 'hull' : 'shield' : '';
      hullBlock.classList.toggle('protected', p.inv > 0);
    }
    set('hud-money', String(game.money || 0).padStart(3, '0'));
    set('hud-timer', time(game.elapsed ?? game.time));
    set('hud-kills', String(game.kills || 0).padStart(2, '0'));
    const weapon = entry(WEAPONS, game.weapons?.[game.weaponIndex || 0]);
    set('hud-weapon', name(weapon));
    set('hud-weapon-number', String((game.weaponIndex || 0) + 1).padStart(2, '0'));
    set('hud-dash', game.dashCooldown > 0 ? `${game.dashCooldown.toFixed(1)}s` : '就绪');
    width('hud-dash-bar', game.dashCooldown > 0 ? 100 - game.dashCooldown / (game.has?.('wing') ? 2.4 : 3.5) * 100 : 100);
    set('hud-skill', name(entry(SKILLS, game.skill)));
    set('hud-skill-cd', game.skillCooldown > 0 ? `${Math.ceil(game.skillCooldown)}s` : '就绪');
    set('hud-auto', game.autoFire ? '开启' : '关闭');
    const boss = this.root.querySelector('#boss-hud');
    if (boss) { boss.hidden = !game.boss; if (game.boss) { width('hud-boss-bar', game.boss.hp / game.boss.maxHp * 100); set('hud-boss-phase', `PHASE ${String(game.boss.phase || 1).padStart(2, '0')}`); } }
    const warning = this.root.querySelector('#boss-warning');
    if (warning) {
      warning.hidden = !game.bossWarning;
      if (game.bossWarning) {
        set('hud-warning-time', `${game.bossWarning.remaining.toFixed(1)}s`);
        width('hud-warning-bar', game.bossWarning.remaining / game.bossWarning.duration * 100);
      }
    }
    this.root.querySelector('.hull-block')?.classList.toggle('critical', p.hp / p.maxHp < 0.28);
  }

  map(game) {
    const nodes = game.map?.nodes || [];
    const available = new Set((game.availableNodes?.() || []).map(node => typeof node === 'object' ? node.id : node));
    const xs = nodes.map(node => node.x || 0), ys = nodes.map(node => node.y || 0);
    const minX = xs.length ? Math.min(...xs) : 0, maxX = xs.length ? Math.max(...xs) : 1, minY = ys.length ? Math.min(...ys) : 0, maxY = ys.length ? Math.max(...ys) : 1;
    const point = node => ({ x: 80 + ((node.x || 0) - minX) / (maxX - minX || 1) * 640, y: 58 + ((node.y || 0) - minY) / (maxY - minY || 1) * 390 });
    const current = this.currentNode(game);
    const lines = [];
    const seen = new Set();
    for (const node of nodes) for (const targetId of node.neighbors || []) {
      const target = nodes.find(other => other.id === (typeof targetId === 'object' ? targetId.id : targetId));
      if (!target) continue;
      const key = [node.id, target.id].sort().join('-');
      if (seen.has(key)) continue;
      seen.add(key);
      const a = point(node), b = point(target);
      lines.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="route-line ${node.visited && target.visited ? 'traveled' : ''} ${(!node.revealed || !target.revealed) ? 'unknown' : ''}"/>`);
    }
    const points = nodes.map(node => {
      const p = point(node), known = node.revealed || node.visited || available.has(node.id), active = node.id === current?.id, reachable = available.has(node.id);
      const info = typeInfo(node.type);
      const symbol = node.cleared ? '✓' : !known ? '?' : ({ combat: '×', elite: '!', shop: '$', treasure: '+', event: '·', secret: '?', exit: '↗', boss: '◆', start: '○' }[info[2]] || '·');
      return `<g class="map-node ${active ? 'current' : ''} ${reachable ? 'available' : ''} ${node.cleared ? 'cleared' : ''} ${known ? info[2] : 'unrevealed'}" ${reachable ? `data-action="chooseNode" data-value="${esc(node.id)}" tabindex="0" role="button" aria-label="前往${esc(node.name || info[0])}"` : ''}><title>${known ? esc(node.name || info[0]) : '尚未侦察'}</title><circle class="node-target" cx="${p.x}" cy="${p.y}" r="25"/><circle class="node-ring" cx="${p.x}" cy="${p.y}" r="${active ? 21 : 18}"/><circle class="node-body" cx="${p.x}" cy="${p.y}" r="12"/><text x="${p.x}" y="${p.y + 5}" class="node-symbol">${symbol}</text><text x="${p.x}" y="${p.y + 36}" class="node-name">${known ? esc(node.name || info[0]) : '未知信号'}</text>${active ? `<text x="${p.x}" y="${p.y - 30}" class="node-here">YOU ARE HERE</text>` : ''}</g>`;
    });
    return `<div class="chart-screen">${this.header(game, '作战航线 / FLIGHT CHART')}<main class="map-shell"><aside class="sector-panel"><span class="eyebrow">SECTOR ${String(game.sector).padStart(2, '0')}</span><h1>${game.sector === 2 ? '失控轨道' : '苍湾防线'}</h1><p>${game.sector === 2 ? '追踪核心信号。深入失控轨道，寻找敌方母舰。' : '穿过近地防御网。收集物资，寻找跃迁入口。'}</p><div class="sector-rule"></div><div class="sector-stat"><span>机体</span><b>${Math.ceil(game.player?.hp || 0)}<small> / ${game.player?.maxHp || 100}</small></b></div><div class="sector-stat"><span>信用点</span><b>${game.money || 0}</b></div><div class="sector-stat"><span>通行芯片</span><b>${game.keys || 0}</b></div><div class="route-tip"><span class="orange-tick"></span>点击亮起的节点<br>选择下一处空域</div>${button('查看装配 <span>TAB ↗</span>', 'inventory', '', 'line-button')}</aside><section class="chart-panel"><div class="chart-heading"><span>TACTICAL AIRSPACE / 航线侦察</span><span>种子 ${esc(game.seed)}</span></div><div class="chart-coordinate chart-coordinate-top">N 35° — E 137° / ${game.sector === 2 ? 'ORBITAL' : 'ATMOSPHERIC'}</div><svg class="flight-chart" viewBox="0 0 800 520" aria-label="随机作战航线图"><defs><pattern id="chart-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" stroke-width="0.5"/></pattern></defs><rect width="800" height="520" fill="url(#chart-grid)" class="chart-grid"/>${lines.join('')}${points.join('')}</svg><div class="chart-legend"><span><i class="legend-dot active"></i>可前往</span><span><i class="legend-dot done"></i>已清空</span><span><i class="legend-dot unknown"></i>未侦察</span><span>航线 ${String(nodes.length).padStart(2, '0')} 节点</span></div></section></main><footer class="chart-footer"><span>${esc(name(entry(WEAPONS, game.weapons?.[game.weaponIndex || 0])))}</span><span>${game.items?.length || 0} 件装备 · ${time(game.elapsed)}</span><span>探索可选空域，或继续推进主目标。</span></footer></div>`;
  }

  panel(game, eyebrow, title, body, footer = '', extraClass = '') {
    return `<div class="overlay-screen ${extraClass}">${this.header(game)}<main class="operation-panel"><div class="panel-heading"><span class="eyebrow">${eyebrow}</span><h1>${title}</h1></div>${body}${footer ? `<footer class="panel-footer">${footer}</footer>` : ''}</main></div>`;
  }

  itemData(offer) {
    if (offer.kind === 'weapon') return entry(WEAPONS, offer.id);
    if (offer.kind === 'item') return entry(ITEMS, offer.id);
    if (offer.kind === 'skill') return entry(SKILLS, offer.id);
    if (offer.kind === 'key') return { name: '通行芯片', description: '开启加密补给仓，或访问特殊航线。' };
    if (offer.kind === 'heal') return { name: '机体维修', description: '修复受损装甲，恢复机体完整度。' };
    if (offer.kind === 'shield') return { name: '护盾充能', description: '补充能量护盾。' };
    return { name: offer.name || offer.id || '补给物资', description: offer.description || '' };
  }

  category(kind) { return ({ weapon: '主武器', item: '被动装备', skill: '主动技能', key: '通行资源', heal: '机体修复', shield: '护盾补给' }[kind] || '物资'); }

  shop(game) {
    const body = `<div class="shop-intro"><p>补给舰「灰燕」已接入通讯。<br>带走需要的装备，然后继续你的航线。</p><div class="wallet"><span>可用信用点</span><b>${game.money || 0}<small> CR</small></b></div></div><div class="supply-list">${(game.offers || []).map((offer, index) => {
      const item = this.itemData(offer);
      return `<article class="supply-row ${offer.sold ? 'sold' : ''}"><span class="supply-index">${String(index + 1).padStart(2, '0')}</span>${equipmentArt(offer.kind, offer.id)}<div class="supply-info"><small>${this.category(offer.kind)}</small><h2>${esc(name(item))}</h2><p>${esc(description(item))}</p></div><div class="supply-purchase"><b>${offer.cost}<small> CR</small></b>${button(offer.sold ? '已购买' : (game.money < offer.cost ? '余额不足' : '购买 ↗'), 'buy', index, 'purchase-button', offer.sold || game.money < offer.cost)}</div></article>`;
    }).join('')}</div>`;
    return this.panel(game, 'SUPPLY RENDEZVOUS / 补给交易', '灰燕补给舰', body, `<span>交易完成后，可继续选择下一处空域。</span>${button(`返回航线 ${chevron}`, 'continue', '', 'primary')}`, 'shop-screen');
  }

  reward(game) {
    const choices = game.choices || game.rewards || [];
    const body = `<p class="panel-intro">回收信号已确认。选择一件物资加入本局装配。</p><div class="reward-list">${choices.map((offer, index) => { const item = this.itemData(offer); return button(`<span class="reward-index">${String(index + 1).padStart(2, '0')}</span>${equipmentArt(offer.kind, offer.id)}<span class="reward-content"><small>${this.category(offer.kind)}</small><strong>${esc(name(item))}</strong><span>${esc(description(item))}</span></span>${chevron}`, 'takeReward', index, 'reward-option'); }).join('')}</div>`;
    return this.panel(game, 'SALVAGE COMPLETE / 战场回收', '选择你的补给', body, '<span>装备效果会持续至本局结束。</span>');
  }

  event(game) {
    const event = game.eventData || { title: '异常信号', text: '前方出现未知通讯。', choices: [] };
    const body = `<div class="event-transmission"><span class="transmission-icon">≋</span><div><span class="eyebrow">INCOMING TRANSMISSION</span><p>${esc(event.text)}</p></div></div><div class="event-options">${event.choices.map((choice, index) => button(`<span class="event-choice-index">${String(index + 1).padStart(2, '0')}</span><span><strong>${esc(choice.label)}</strong><small>${esc(choice.detail || '')}</small></span>${chevron}`, 'chooseEvent', index, 'event-option', choice.disabled)).join('')}</div>`;
    return this.panel(game, 'UNIDENTIFIED SIGNAL / 特殊事件', esc(event.title), body);
  }

  pause(game) {
    return `<div class="pause-screen"><div class="pause-content"><span class="eyebrow">FLIGHT ON HOLD</span><h1>暂停飞行<span>PAUSED.</span></h1><div class="pause-meta">区域 ${String(game.sector || 1).padStart(2, '0')} · ${time(game.elapsed)} · ${game.kills || 0} 击毁</div><div class="pause-buttons">${button(`继续飞行 ${chevron}`, 'resume', '', 'primary')}${button('查看装配', 'inventory')}${button('操作说明', 'help')}${button('游戏设置', 'settings')}${button('重新出击', 'restart', '', 'danger-text')}</div><small class="pause-footnote">ESC 返回 · 当前飞行已暂停</small></div></div>`;
  }

  inventory(game) {
    const weapons = (game.weapons || []).map((id, index) => { const data = entry(WEAPONS, id); return `<article class="loadout-weapon ${index === game.weaponIndex ? 'equipped' : ''}"><div class="loadout-index">${String(index + 1).padStart(2, '0')}</div>${equipmentArt('weapon', id)}<div class="loadout-copy"><h3>${esc(name(data))}</h3><p>${esc(description(data))}</p><span class="weapon-specs">伤害 ${data.damage || '—'} · 射速 ${data.rate ? (1 / data.rate).toFixed(1) + '发/秒' : '—'} · 无限弹药</span></div>${button(index === game.weaponIndex ? '使用中' : '切换', 'switchWeapon', index, 'line-button', index === game.weaponIndex)}</article>`; }).join('');
    const items = (game.items || []).map(id => { const data = entry(ITEMS, id); return `<div class="loadout-item">${equipmentArt('item', id)}<div class="loadout-copy"><h3>${esc(name(data))}</h3><p>${esc(description(data))}</p></div></div>`; }).join('') || '<p class="empty-note">尚未装配被动装备。探索补给空域以获取强化。</p>';
    const skill = entry(SKILLS, game.skill);
    let synergies = [];
    try { synergies = game.synergies?.() || []; } catch { /* The loadout remains visible while a run is initializing. */ }
    const combo = synergies.map(combo => { const data = typeof combo === 'string' ? entry(SYNERGIES, combo) : combo; return `<div class="synergy-entry"><span>LINK ACTIVE</span><h3>${esc(name(data))}</h3><p>${esc(description(data))}</p></div>`; }).join('') || '<p class="empty-note">尚无协同激活。尝试组合不同武器与装备。</p>';
    return this.panel(game, 'AIRFRAME CONFIGURATION / 当前装配', '战机装配', `<div class="inventory-columns"><section><h2 class="section-label">01 / 主武器</h2>${weapons}<h2 class="section-label">02 / 主动技能</h2><div class="skill-summary">${equipmentArt('skill', game.skill)}<div class="loadout-copy"><strong>${esc(name(skill))}</strong><p>${esc(description(skill))}</p><small>E 使用技能</small></div></div></section><section><h2 class="section-label">03 / 被动装备</h2>${items}<h2 class="section-label">04 / 装备协同</h2>${combo}</section></div>`, `<span>装配状态随本局保留。</span>${button('返回 <span>ESC ↗</span>', 'back', '', 'primary')}`, 'inventory-screen');
  }

  settings(game) { return renderSettings(this, game, button); }

  help(game) {
    const controls = [['W A S D / ↑ ↓ ← →', '移动战机'], ['CTRL', '精细移动 · 显示受击轮廓'], ['鼠标左键 / SPACE', '持续开火 · 无限弹药'], ['SHIFT', '闪避机动 · 短暂无敌'], ['Q / 1–8', '切换主武器'], ['E', '使用主动技能'], ['F', '切换自动射击'], ['TAB', '查看武器与装备'], ['ESC', '暂停 / 返回']];
    return this.panel(game, 'PILOT HANDBOOK / 飞行手册', '操作指南', `<div class="touch-handbook touch-hint"><h2>手机与平板</h2><p>在战场任意位置按住并拖动，战机直接跟随手指位移；按下不瞬移，松手即停。另一根手指可同时使用底部的闪避、技能或切换武器。默认自动开火；关闭自动后，按住开火键持续射击。点精细可降低拖动位移倍率，游戏设置可调整触控灵敏度，装配可查看装备。手机、平板和横竖屏都可游玩。</p></div><div class="help-columns"><div class="controls-table">${controls.map(([key, label]) => `<div><kbd>${key}</kbd><span>${label}</span></div>`).join('')}</div><div class="handbook"><h2>你的任务</h2><p>探索第一作战区域，收集装备并找到跃迁入口。进入第二作战区域后，寻找核心目标空域并击毁 Boss。</p><h2>保持机动</h2><p>炮弹命中机身或机翼会先扣护盾，护盾不足时扣机体完整度。蓝色力场表示保护期间，此时接触的炮弹会被拦截；受击保护持续 0.85 秒。激光和区域攻击会提前预警，留意地面标记与敌方蓄能。</p><h2>选择你的航线</h2><p>清空交战空域后回到航线图。补给舰提供交易，未知信号可能带来资源与风险。某些事件会揭示隐藏空域。</p><h2>组合火力</h2><p>武器、被动装备与主动技能可以形成协同。探索不同奖励路线，尝试适合自己的作战方式。</p></div></div>`, `<span>精准躲避，果断开火。</span>${button('准备就绪 ↗', 'back', '', 'primary')}`, 'help-screen');
  }

  result(game, won) {
    const weapons = (game.weapons || []).map(id => esc(name(entry(WEAPONS, id)))).join(' / ');
    const items = (game.items || []).map(id => esc(name(entry(ITEMS, id)))).join(' · ');
    const explored = typeof game.explored === 'number' ? game.explored : game.map?.nodes?.filter(node => node.visited).length || 0;
    let combos = [];
    try { combos = game.synergies?.() || []; } catch { /* End reports can render without combo data. */ }
    return `<div class="result-screen ${won ? 'victory' : 'defeat'}"><header class="result-top"><span class="wordmark">STAR RIFT / 星隙突击</span><span>FLIGHT REPORT — ${esc(game.seed)}</span></header><main class="result-layout"><div class="result-heading"><span class="eyebrow">${won ? 'MISSION ACCOMPLISHED' : 'SIGNAL LOST'}</span><h1>${won ? '任务完成' : '通讯中断'}<span>${won ? 'CLEAR.' : 'LOST.'}</span></h1><p>${won ? '敌方核心已摧毁。<br>欢迎归航，飞行员。' : '战机已失联。<br>新的航线，等待下一次出击。'}</p>${button(`再次出击 ${chevron}`, 'restart', '', 'primary')}${button('游戏设置', 'settings', '', 'result-setting')}</div><div class="flight-report"><div class="report-title">作战记录 <span>AFTER ACTION REPORT</span></div><div class="report-stats"><div><span>飞行时间</span><strong>${time(game.elapsed)}</strong></div><div><span>目标击毁</span><strong>${String(game.kills || 0).padStart(2, '0')}</strong></div><div><span>探索空域</span><strong>${String(explored).padStart(2, '0')}</strong></div><div><span>抵达区域</span><strong>0${game.sector || 1}<small> / 02</small></strong></div></div><div class="report-section"><span>主武器</span><p>${weapons || '初始机炮'}</p></div><div class="report-section"><span>被动装备</span><p>${items || '未装配'}</p></div><div class="report-section"><span>激活协同</span><p>${combos.map(combo => esc(name(typeof combo === 'string' ? entry(SYNERGIES, combo) : combo))).join(' · ') || '无'}</p></div><div class="report-stamp">${won ? 'CLEARED / 核心已摧毁' : 'END OF TRANSMISSION'}</div></div></main><footer class="result-footer">两片空域，一条归途。<span>NO TWO FLIGHTS ARE THE SAME.</span></footer></div>`;
  }
}



