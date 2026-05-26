const CRC_VERSION = '1.1.0';

console.info(
  `%c CLIMATE-ROW-CARD %c v${CRC_VERSION} `,
  'color: white; background: #ef4444; font-weight: 700; padding: 2px 6px; border-radius: 4px 0 0 4px;',
  'color: #ef4444; background: #1f2937; font-weight: 700; padding: 2px 6px; border-radius: 0 4px 4px 0;'
);

const HVAC_ACTION_ICONS = {
  heating: 'mdi:fire',
  cooling: 'mdi:snowflake',
  idle: 'mdi:radiator-disabled',
  off: 'mdi:radiator-off',
  fan: 'mdi:fan',
  drying: 'mdi:water-percent',
  defrosting: 'mdi:snowflake-melt',
  preheating: 'mdi:fire-circle',
};

const HVAC_ACTION_LABELS = {
  heating: 'heizt',
  cooling: 'kuehlt',
  idle: 'bereit',
  off: 'aus',
  fan: 'lueftet',
  drying: 'trocknet',
  defrosting: 'enteist',
  preheating: 'aufwaermen',
};

const HVAC_MODE_ICONS = {
  off: 'mdi:power',
  heat: 'mdi:fire',
  cool: 'mdi:snowflake',
  heat_cool: 'mdi:sun-snowflake-variant',
  auto: 'mdi:autorenew',
  dry: 'mdi:water-percent',
  fan_only: 'mdi:fan',
};

const HVAC_MODE_LABELS = {
  off: 'aus',
  heat: 'heizen',
  cool: 'kuehlen',
  heat_cool: 'auto h/c',
  auto: 'auto',
  dry: 'trocknen',
  fan_only: 'luefter',
};

class ClimateRowCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._items = [];
    this._panelEls = {};
    this._localTemps = {};
    this._dragging = {};
    this._releaseTimers = {};
  }

  static getStubConfig() {
    return {
      title: 'Heizung',
      icon: 'mdi:radiator',
      orientation: 'horizontal',
      entities: [],
    };
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.entities) || config.entities.length === 0) {
      throw new Error('Mindestens eine climate-Entitaet unter "entities" angeben.');
    }
    const items = config.entities.map((e, i) => {
      const obj = typeof e === 'string' ? { entity: e } : { ...e };
      if (!obj.entity || typeof obj.entity !== 'string' || !obj.entity.startsWith('climate.')) {
        throw new Error(`Eintrag ${i + 1} ist keine gueltige climate-Entitaet: ${JSON.stringify(e)}`);
      }
      if (obj.window && (typeof obj.window !== 'string' || !obj.window.startsWith('binary_sensor.'))) {
        throw new Error(`Eintrag ${i + 1}: 'window' muss eine binary_sensor-Entitaet sein.`);
      }
      if (obj.current_sensor && (typeof obj.current_sensor !== 'string' || !obj.current_sensor.startsWith('sensor.'))) {
        throw new Error(`Eintrag ${i + 1}: 'current_sensor' muss eine sensor-Entitaet sein.`);
      }
      if (obj.icon !== undefined && obj.icon !== null && typeof obj.icon !== 'string') {
        throw new Error(`Eintrag ${i + 1}: 'icon' muss ein String sein (z. B. mdi:radiator).`);
      }
      return obj;
    });

    const orientation = config.orientation === 'vertical' ? 'vertical' : 'horizontal';
    const stacksRaw = typeof config.stacks === 'number' && config.stacks > 0
      ? Math.min(config.stacks, items.length) : 0;
    const colsRaw = typeof config.cols === 'number' && config.cols > 0
      ? Math.min(config.cols, items.length) : 0;
    let displayCols, flowColumn, rows;
    if (stacksRaw > 0) {
      displayCols = stacksRaw;
      rows = Math.ceil(items.length / stacksRaw);
      flowColumn = true;
    } else if (colsRaw > 0) {
      displayCols = colsRaw;
      rows = 0;
      flowColumn = false;
    } else {
      displayCols = orientation === 'horizontal' ? 1 : items.length;
      rows = 0;
      flowColumn = false;
    }

    this._config = {
      title: config.title ?? '',
      icon: config.icon ?? 'mdi:radiator',
      orientation,
      accent_color: config.accent_color ?? '#ef4444',
      track_color: config.track_color ?? 'rgba(127,127,127,0.18)',
      slider_size: typeof config.slider_size === 'number'
        ? config.slider_size
        : (orientation === 'vertical' ? 140 : 0),
      cols: displayCols,
      stacks: stacksRaw,
      _flowColumn: flowColumn,
      _rows: rows,
      show_icon: config.show_icon !== false,
      show_name: config.show_name !== false,
      show_target: config.show_target !== false,
      show_current: config.show_current !== false,
      show_hvac_action: config.show_hvac_action !== false,
      show_window: config.show_window !== false,
      show_preset: config.show_preset !== false,
      show_hvac_toggle: config.show_hvac_toggle !== false,
    };
    this._items = items;
    this._build();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._build();
    else this._refresh();
  }

  getCardSize() {
    if (this._config?.orientation === 'horizontal') {
      const rows = Math.ceil(this._items.length / Math.max(1, this._config.cols));
      return Math.max(3, rows * 3);
    }
    return Math.max(4, Math.round((this._config?.slider_size || 140) / 60) + 3);
  }

  _build() {
    if (!this.shadowRoot || !this._config) return;
    this.shadowRoot.innerHTML = '';

    const style = document.createElement('style');
    style.textContent = this._css();
    this.shadowRoot.appendChild(style);

    const card = document.createElement('ha-card');
    card.className = 'cr-card';

    if (this._config.title) {
      const header = document.createElement('div');
      header.className = 'cr-header';
      const ic = document.createElement('ha-icon');
      ic.setAttribute('icon', this._config.icon);
      const lbl = document.createElement('span');
      lbl.textContent = this._config.title;
      header.appendChild(ic);
      header.appendChild(lbl);
      card.appendChild(header);
    }

    const row = document.createElement('div');
    row.className = `cr-row cr-${this._config.orientation}`;
    row.style.setProperty('--cr-cols', String(this._config.cols));
    if (this._config._flowColumn) {
      row.classList.add('cr-flow-column');
      row.style.setProperty('--cr-rows', String(this._config._rows));
    }

    this._panelEls = {};
    for (const item of this._items) {
      const panel = this._buildPanel(item);
      row.appendChild(panel.root);
      this._panelEls[item.entity] = panel;
    }

    card.appendChild(row);
    this.shadowRoot.appendChild(card);
    this._refresh();
  }

  _buildPanel(item) {
    const root = document.createElement('div');
    root.className = 'cr-panel';
    root.dataset.entity = item.entity;

    const top = document.createElement('div');
    top.className = 'cr-top';

    const iconWrap = document.createElement('div');
    iconWrap.className = 'cr-icon-wrap';
    const iconMain = document.createElement('ha-icon');
    iconMain.className = 'cr-icon-main';
    const actionBadge = document.createElement('div');
    actionBadge.className = 'cr-action-badge';
    const actionBadgeIcon = document.createElement('ha-icon');
    actionBadge.appendChild(actionBadgeIcon);
    iconWrap.appendChild(iconMain);
    iconWrap.appendChild(actionBadge);
    top.appendChild(iconWrap);

    const name = document.createElement('div');
    name.className = 'cr-name';
    top.appendChild(name);

    const badges = document.createElement('div');
    badges.className = 'cr-badges';

    const windowIcon = document.createElement('ha-icon');
    windowIcon.className = 'cr-window';
    windowIcon.setAttribute('icon', 'mdi:window-open-variant');
    windowIcon.title = 'Fenster offen';
    badges.appendChild(windowIcon);

    top.appendChild(badges);
    root.appendChild(top);

    const temps = document.createElement('div');
    temps.className = 'cr-temps';
    const target = document.createElement('div');
    target.className = 'cr-target';
    const current = document.createElement('div');
    current.className = 'cr-current';
    temps.appendChild(target);
    temps.appendChild(current);
    root.appendChild(temps);

    const sliderWrap = document.createElement('div');
    sliderWrap.className = 'cr-slider-wrap';

    const minus = this._mkBtn('cr-minus', 'mdi:minus', 'Kuehler', () => this._adjustTemp(item.entity, -1));
    const plus = this._mkBtn('cr-plus', 'mdi:plus', 'Waermer', () => this._adjustTemp(item.entity, +1));

    const slider = document.createElement('div');
    slider.className = 'cr-slider';
    const track = document.createElement('div');
    track.className = 'cr-track';
    const fill = document.createElement('div');
    fill.className = 'cr-fill';
    const thumb = document.createElement('div');
    thumb.className = 'cr-thumb';
    track.appendChild(fill);
    track.appendChild(thumb);
    slider.appendChild(track);
    this._attachSliderEvents(slider, track, item.entity, root);

    sliderWrap.appendChild(plus);
    sliderWrap.appendChild(slider);
    sliderWrap.appendChild(minus);

    const mid = document.createElement('div');
    mid.className = 'cr-mid';
    mid.appendChild(sliderWrap);

    const controls = document.createElement('div');
    controls.className = 'cr-controls';

    const hvacBtn = document.createElement('button');
    hvacBtn.className = 'cr-hvac-btn';
    hvacBtn.type = 'button';
    hvacBtn.title = 'HVAC-Mode wechseln';
    const hvacIcon = document.createElement('ha-icon');
    const hvacLabel = document.createElement('span');
    hvacBtn.appendChild(hvacIcon);
    hvacBtn.appendChild(hvacLabel);
    hvacBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const so = this._hass?.states?.[item.entity];
      if (so) this._cycleHvac(item.entity, so);
    });
    controls.appendChild(hvacBtn);

    const presetSelect = document.createElement('select');
    presetSelect.className = 'cr-preset';
    presetSelect.title = 'Preset';
    presetSelect.addEventListener('change', (e) => {
      e.stopPropagation();
      const value = presetSelect.value;
      if (value) this._setPreset(item.entity, value);
    });
    controls.appendChild(presetSelect);

    mid.appendChild(controls);
    root.appendChild(mid);

    root.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this._fireMoreInfo(item.entity);
    });

    return {
      root, name, target, fill, thumb, current,
      iconWrap, iconMain, actionBadge, actionBadgeIcon,
      windowIcon,
      hvacBtn, hvacIcon, hvacLabel,
      presetSelect, minus, plus,
    };
  }

  _mkBtn(cls, icon, title, onClick) {
    const b = document.createElement('button');
    b.className = `cr-btn ${cls}`;
    b.type = 'button';
    b.title = title;
    b.setAttribute('aria-label', title);
    const i = document.createElement('ha-icon');
    i.setAttribute('icon', icon);
    b.appendChild(i);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  _adjustTemp(entityId, direction) {
    const so = this._hass?.states?.[entityId];
    if (!so) return;
    const step = so.attributes.target_temp_step ?? 0.5;
    const min = so.attributes.min_temp ?? 7;
    const max = so.attributes.max_temp ?? 35;
    const current = this._localTemps[entityId] ?? so.attributes.temperature ?? min;
    const raw = current + direction * step;
    const next = Math.max(min, Math.min(max, Math.round(raw / step) * step));
    this._hass.callService('climate', 'set_temperature', { entity_id: entityId, temperature: next });
  }

  _attachSliderEvents(slider, track, entityId, panelRoot) {
    let pendingTemp = null;
    const calcTemp = (clientX, clientY) => {
      const so = this._hass?.states?.[entityId];
      if (!so) return null;
      const min = so.attributes.min_temp ?? 7;
      const max = so.attributes.max_temp ?? 35;
      const step = so.attributes.target_temp_step ?? 0.5;
      const rect = track.getBoundingClientRect();
      let ratio;
      if (this._config.orientation === 'vertical') {
        const offset = clientY - rect.top;
        ratio = 1 - Math.min(1, Math.max(0, offset / rect.height));
      } else {
        const offset = clientX - rect.left;
        ratio = Math.min(1, Math.max(0, offset / rect.width));
      }
      const raw = min + ratio * (max - min);
      const stepped = Math.round(raw / step) * step;
      return Math.round(stepped * 100) / 100;
    };

    const onDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      this._dragging[entityId] = true;
      panelRoot.classList.add('cr-dragging');
      try { slider.setPointerCapture(e.pointerId); } catch {}
      pendingTemp = calcTemp(e.clientX, e.clientY);
      this._localTemps[entityId] = pendingTemp;
      this._renderPanel(entityId);
    };
    const onMove = (e) => {
      if (!this._dragging[entityId]) return;
      pendingTemp = calcTemp(e.clientX, e.clientY);
      this._localTemps[entityId] = pendingTemp;
      this._renderPanel(entityId);
    };
    const onUp = (e) => {
      if (!this._dragging[entityId]) return;
      this._dragging[entityId] = false;
      panelRoot.classList.remove('cr-dragging');
      try { slider.releasePointerCapture(e.pointerId); } catch {}
      if (pendingTemp !== null) {
        this._hass.callService('climate', 'set_temperature', { entity_id: entityId, temperature: pendingTemp });
        pendingTemp = null;
      }
      clearTimeout(this._releaseTimers[entityId]);
      this._releaseTimers[entityId] = setTimeout(() => {
        delete this._localTemps[entityId];
        this._renderPanel(entityId);
      }, 1500);
    };

    slider.addEventListener('pointerdown', onDown);
    slider.addEventListener('pointermove', onMove);
    slider.addEventListener('pointerup', onUp);
    slider.addEventListener('pointercancel', onUp);
  }

  _cycleHvac(entityId, so) {
    const modes = Array.isArray(so.attributes?.hvac_modes) ? so.attributes.hvac_modes : [];
    if (modes.length === 0) return;
    const idx = modes.indexOf(so.state);
    const next = modes[(idx + 1) % modes.length];
    this._hass.callService('climate', 'set_hvac_mode', { entity_id: entityId, hvac_mode: next });
  }

  _setPreset(entityId, preset) {
    this._hass.callService('climate', 'set_preset_mode', { entity_id: entityId, preset_mode: preset });
  }

  _fireMoreInfo(entity_id) {
    const ev = new Event('hass-more-info', { bubbles: true, composed: true });
    ev.detail = { entityId: entity_id };
    this.dispatchEvent(ev);
  }

  _refresh() {
    if (!this._panelEls || !this._items) return;
    for (const item of this._items) this._renderPanel(item.entity);
  }

  _renderPanel(entityId) {
    const els = this._panelEls[entityId];
    if (!els) return;
    const so = this._hass?.states?.[entityId];
    const item = this._items.find((i) => i.entity === entityId);
    const unavailable = !so || so.state === 'unavailable' || so.state === 'unknown';

    const nameText = item?.name ?? so?.attributes?.friendly_name ?? entityId.split('.').pop().replace(/_/g, ' ');
    if (this._config.show_name) {
      els.name.textContent = nameText;
      els.name.style.display = '';
      els.name.title = nameText;
    } else {
      els.name.style.display = 'none';
    }

    const min = so?.attributes?.min_temp ?? 7;
    const max = so?.attributes?.max_temp ?? 35;
    const targetRaw = this._localTemps[entityId] ?? so?.attributes?.temperature;
    const targetForRender = typeof targetRaw === 'number' ? targetRaw : min;
    const clamped = Math.max(min, Math.min(max, targetForRender));
    const ratio = max > min ? (clamped - min) / (max - min) : 0;
    const pct = ratio * 100;

    if (this._config.orientation === 'vertical') {
      els.fill.style.height = `${pct}%`;
      els.fill.style.width = '';
      els.thumb.style.bottom = `calc(${pct}% - 9px)`;
      els.thumb.style.left = '';
    } else {
      els.fill.style.width = `${pct}%`;
      els.fill.style.height = '';
      els.thumb.style.left = `calc(${pct}% - 9px)`;
      els.thumb.style.bottom = '';
    }

    if (this._config.show_target) {
      els.target.style.display = '';
      els.target.textContent = typeof targetRaw === 'number' ? this._fmtTemp(targetRaw) : '–';
    } else {
      els.target.style.display = 'none';
    }

    if (this._config.show_current) {
      els.current.style.display = '';
      const cur = this._readCurrentTemp(item, so);
      els.current.textContent = (cur !== null) ? `Raum ${this._fmtTemp(cur)}` : '';
    } else {
      els.current.style.display = 'none';
    }

    const iconStr = item?.icon ?? so?.attributes?.icon ?? 'mdi:radiator';
    if (this._config.show_icon) {
      els.iconWrap.style.display = '';
      els.iconMain.setAttribute('icon', iconStr);
    } else {
      els.iconWrap.style.display = 'none';
    }

    const act = so?.attributes?.hvac_action;
    if (this._config.show_icon && this._config.show_hvac_action && act) {
      els.actionBadge.style.display = '';
      els.actionBadgeIcon.setAttribute('icon', HVAC_ACTION_ICONS[act] ?? 'mdi:thermostat');
      els.actionBadge.dataset.action = act;
      els.actionBadge.title = HVAC_ACTION_LABELS[act] ?? act;
    } else {
      els.actionBadge.style.display = 'none';
    }

    if (this._config.show_window) {
      const open = this._isWindowOpen(item);
      els.windowIcon.style.display = open ? '' : 'none';
    } else {
      els.windowIcon.style.display = 'none';
    }

    if (this._config.show_hvac_toggle) {
      els.hvacBtn.style.display = '';
      const mode = so?.state ?? 'off';
      els.hvacIcon.setAttribute('icon', HVAC_MODE_ICONS[mode] ?? 'mdi:thermostat');
      els.hvacLabel.textContent = HVAC_MODE_LABELS[mode] ?? mode;
      els.hvacBtn.classList.toggle('cr-hvac-on', mode !== 'off');
      els.hvacBtn.dataset.mode = mode;
      els.hvacBtn.disabled = unavailable;
    } else {
      els.hvacBtn.style.display = 'none';
    }

    if (this._config.show_preset) {
      const presets = Array.isArray(so?.attributes?.preset_modes) ? so.attributes.preset_modes : [];
      const current = so?.attributes?.preset_mode ?? '';
      if (presets.length === 0) {
        els.presetSelect.style.display = 'none';
      } else {
        els.presetSelect.style.display = '';
        const existing = Array.from(els.presetSelect.options).map((o) => o.value);
        const same = existing.length === presets.length && presets.every((p, i) => existing[i] === p);
        if (!same) {
          els.presetSelect.innerHTML = '';
          for (const p of presets) {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = p;
            els.presetSelect.appendChild(opt);
          }
        }
        if (els.presetSelect.value !== current) els.presetSelect.value = current;
        els.presetSelect.disabled = unavailable;
      }
    } else {
      els.presetSelect.style.display = 'none';
    }

    els.root.classList.toggle('cr-unavailable', unavailable);

    if (els.minus) els.minus.disabled = unavailable || (typeof targetRaw === 'number' && targetRaw <= min);
    if (els.plus) els.plus.disabled = unavailable || (typeof targetRaw === 'number' && targetRaw >= max);
  }

  _isWindowOpen(item) {
    if (!item?.window) return false;
    const ws = this._hass?.states?.[item.window];
    if (!ws) return false;
    return ws.state === 'on';
  }

  _readCurrentTemp(item, so) {
    if (item?.current_sensor) {
      const ss = this._hass?.states?.[item.current_sensor];
      if (ss && ss.state !== 'unavailable' && ss.state !== 'unknown') {
        const v = Number(ss.state);
        if (!Number.isNaN(v)) return v;
      }
    }
    const a = so?.attributes?.current_temperature;
    return (a !== undefined && a !== null) ? a : null;
  }

  _fmtTemp(t) {
    if (t === null || t === undefined || Number.isNaN(t)) return '–';
    const n = Math.round(t * 10) / 10;
    return `${n.toFixed(1)} °C`;
  }

  _css() {
    return `
      :host {
        --cr-accent: ${this._config.accent_color};
        --cr-track-bg: ${this._config.track_color};
        --cr-radius: 14px;
        --cr-slider-size: ${this._config.slider_size || 140}px;
      }
      .cr-card { padding: 14px 12px 12px; }
      .cr-header {
        display: flex; align-items: center; gap: 8px;
        font-size: 1.05rem; font-weight: 600;
        color: var(--primary-text-color);
        padding: 2px 6px 12px;
      }
      .cr-header ha-icon { color: var(--cr-accent); --mdc-icon-size: 22px; }

      .cr-row {
        display: grid;
        grid-template-columns: repeat(var(--cr-cols, 1), minmax(0, 1fr));
        gap: 8px;
        align-items: stretch;
        padding: 4px 2px 6px;
      }
      .cr-row.cr-flow-column {
        grid-template-rows: repeat(var(--cr-rows, 1), auto);
        grid-auto-flow: column;
      }
      .cr-panel {
        min-width: 0;
        display: flex; flex-direction: column;
        gap: 8px;
        padding: 12px 10px;
        background: var(--ha-card-background, var(--card-background-color));
        border-radius: var(--cr-radius);
        box-shadow: 0 1px 2px rgba(0,0,0,0.06);
        border: 1px solid rgba(127,127,127,0.14);
      }

      .cr-top {
        display: flex; justify-content: space-between; align-items: center; gap: 8px;
        min-height: 22px;
      }
      .cr-name {
        font-size: 0.9rem; font-weight: 600;
        color: var(--primary-text-color);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        flex: 1 1 auto; min-width: 0;
      }
      .cr-badges {
        display: flex; align-items: center; gap: 6px;
        flex: 0 0 auto;
      }
      .cr-window { color: #ef4444; --mdc-icon-size: 20px; }

      .cr-icon-wrap {
        position: relative;
        flex: 0 0 auto;
        width: 32px; height: 32px;
        display: inline-flex; align-items: center; justify-content: center;
      }
      .cr-icon-main {
        --mdc-icon-size: 28px;
        color: var(--cr-accent);
      }
      .cr-action-badge {
        position: absolute;
        right: -3px; bottom: -2px;
        width: 16px; height: 16px;
        border-radius: 50%;
        display: inline-flex; align-items: center; justify-content: center;
        background: rgba(127,127,127,0.5);
        color: #fff;
        box-shadow: 0 0 0 2px var(--ha-card-background, var(--card-background-color));
      }
      .cr-action-badge ha-icon { --mdc-icon-size: 12px; }
      .cr-action-badge[data-action="heating"],
      .cr-action-badge[data-action="preheating"] { background: #ef4444; }
      .cr-action-badge[data-action="idle"]       { background: #3b82f6; }
      .cr-action-badge[data-action="cooling"],
      .cr-action-badge[data-action="defrosting"] { background: #06b6d4; }
      .cr-action-badge[data-action="drying"]     { background: #d97706; }
      .cr-action-badge[data-action="fan"]        { background: #14b8a6; }
      .cr-action-badge[data-action="off"]        { background: rgba(127,127,127,0.7); }

      .cr-temps {
        display: flex;
        align-items: baseline;
        justify-content: center;
        gap: 10px;
        flex-wrap: wrap;
        line-height: 1.05;
      }
      .cr-target {
        font-size: 1.7rem; font-weight: 700;
        color: var(--primary-text-color);
        font-variant-numeric: tabular-nums;
        letter-spacing: -0.5px;
      }
      .cr-current {
        font-size: 0.82rem;
        color: var(--secondary-text-color);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .cr-current:empty { display: none; }

      .cr-mid {
        display: flex; flex-direction: column;
        gap: 6px;
      }
      .cr-horizontal .cr-mid {
        flex-direction: row;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .cr-horizontal .cr-mid .cr-slider-wrap {
        flex: 1 1 120px;
        min-width: 100px;
      }
      .cr-horizontal .cr-mid .cr-controls {
        flex: 0 0 auto;
      }
      .cr-slider-wrap {
        display: flex; gap: 6px;
        align-items: center; justify-content: center;
      }
      .cr-vertical .cr-slider-wrap {
        flex-direction: column;
      }
      .cr-vertical .cr-slider-wrap .cr-plus  { order: 1; }
      .cr-vertical .cr-slider-wrap .cr-slider { order: 2; }
      .cr-vertical .cr-slider-wrap .cr-minus { order: 3; }
      .cr-horizontal .cr-slider-wrap {
        flex-direction: row;
        gap: 4px;
      }
      .cr-horizontal .cr-slider-wrap .cr-minus { order: 1; }
      .cr-horizontal .cr-slider-wrap .cr-slider { order: 2; }
      .cr-horizontal .cr-slider-wrap .cr-plus  { order: 3; }

      .cr-horizontal .cr-panel {
        padding: 8px 10px;
        gap: 4px;
      }
      .cr-horizontal .cr-top { min-height: 20px; }
      .cr-horizontal .cr-target { font-size: 1.2rem; }
      .cr-horizontal .cr-current { font-size: 0.72rem; }
      .cr-horizontal .cr-btn { width: 32px; height: 26px; }
      .cr-horizontal .cr-slider { height: 28px; padding: 4px; }
      .cr-horizontal .cr-hvac-btn { padding: 4px 8px; font-size: 0.74rem; }
      .cr-horizontal .cr-preset {
        padding: 4px 22px 4px 8px; font-size: 0.74rem;
        flex: 0 1 130px; min-width: 90px; max-width: 160px;
      }
      .cr-horizontal .cr-controls { margin-top: 0; gap: 4px; flex-wrap: nowrap; }

      .cr-btn {
        appearance: none; border: none;
        background: rgba(127,127,127,0.12);
        color: var(--primary-text-color);
        border-radius: 10px;
        width: 36px; height: 30px;
        display: inline-flex; align-items: center; justify-content: center;
        cursor: pointer; padding: 0; flex: 0 0 auto;
        transition: background-color 120ms ease, transform 80ms ease, color 120ms ease;
      }
      .cr-btn:hover { background: rgba(127,127,127,0.22); color: var(--cr-accent); }
      .cr-btn:active { transform: scale(0.92); }
      .cr-btn:disabled {
        opacity: 0.35;
        cursor: not-allowed;
        background: rgba(127,127,127,0.06);
        color: var(--secondary-text-color);
        transform: none;
      }
      .cr-btn:disabled:hover {
        background: rgba(127,127,127,0.06);
        color: var(--secondary-text-color);
      }
      .cr-btn ha-icon { --mdc-icon-size: 20px; }

      .cr-slider {
        touch-action: none;
        padding: 6px;
        display: flex; justify-content: center; align-items: center;
      }
      .cr-vertical .cr-slider {
        flex: 0 0 auto;
        width: 36px;
        height: var(--cr-slider-size, 140px);
      }
      .cr-horizontal .cr-slider {
        flex: 1 1 auto;
        min-width: 60px;
        height: 36px;
      }
      .cr-track {
        position: relative;
        border-radius: 8px;
        background: var(--cr-track-bg);
        cursor: pointer;
      }
      .cr-vertical .cr-track { width: 14px; height: 100%; }
      .cr-horizontal .cr-track { width: 100%; height: 14px; }
      .cr-fill {
        position: absolute;
        background: var(--cr-accent);
        opacity: 0.85;
        border-radius: 8px;
        transition: width 180ms ease, height 180ms ease;
        pointer-events: none;
      }
      .cr-vertical .cr-fill { bottom: 0; left: 0; right: 0; }
      .cr-horizontal .cr-fill { left: 0; top: 0; bottom: 0; }
      .cr-thumb {
        position: absolute;
        background: var(--cr-accent);
        border-radius: 7px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.28);
        transition: bottom 180ms ease, left 180ms ease;
        pointer-events: none;
      }
      .cr-vertical .cr-thumb { left: 50%; transform: translateX(-50%); width: 24px; height: 18px; }
      .cr-horizontal .cr-thumb { top: 50%; transform: translateY(-50%); width: 18px; height: 24px; }
      .cr-dragging .cr-fill, .cr-dragging .cr-thumb { transition: none; }

      .cr-controls {
        display: flex; gap: 6px; align-items: stretch;
        margin-top: 2px;
        flex-wrap: wrap;
      }
      .cr-hvac-btn {
        appearance: none; border: none;
        background: rgba(127,127,127,0.14);
        color: var(--secondary-text-color);
        border-radius: 10px;
        padding: 6px 10px;
        display: inline-flex; align-items: center; gap: 6px;
        font-size: 0.78rem; font-weight: 600;
        cursor: pointer; flex: 0 0 auto;
        transition: background-color 120ms ease, color 120ms ease;
        white-space: nowrap;
      }
      .cr-hvac-btn:hover { background: rgba(127,127,127,0.22); }
      .cr-hvac-btn.cr-hvac-on {
        background: rgba(239,68,68,0.18);
        color: #ef4444;
      }
      .cr-hvac-btn[data-mode="cool"] { background: rgba(59,130,246,0.18); color: #3b82f6; }
      .cr-hvac-btn[data-mode="auto"], .cr-hvac-btn[data-mode="heat_cool"] {
        background: rgba(168,85,247,0.18); color: #a855f7;
      }
      .cr-hvac-btn[data-mode="dry"] { background: rgba(234,179,8,0.18); color: #d97706; }
      .cr-hvac-btn[data-mode="fan_only"] { background: rgba(20,184,166,0.18); color: #14b8a6; }
      .cr-hvac-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .cr-hvac-btn ha-icon { --mdc-icon-size: 18px; }

      .cr-preset {
        appearance: none;
        flex: 1 1 100px;
        font: inherit;
        font-size: 0.78rem;
        padding: 6px 24px 6px 10px;
        border-radius: 10px;
        border: none;
        background-color: rgba(127,127,127,0.14);
        background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%23888' d='M1 1l5 5 5-5'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 8px center;
        color: var(--primary-text-color);
        cursor: pointer;
        min-width: 0;
      }
      .cr-preset:disabled { opacity: 0.4; cursor: not-allowed; }

      .cr-unavailable { opacity: 0.45; pointer-events: none; filter: grayscale(0.6); }

      @media (max-width: 600px) {
        .cr-panel { padding: 10px 8px; gap: 6px; }
        .cr-target { font-size: 1.45rem; }
        .cr-hvac-btn { padding: 5px 8px; font-size: 0.74rem; }
      }
    `;
  }
}

ClimateRowCard.getConfigElement = function () {
  return document.createElement('climate-row-card-editor');
};

const EDITOR_LABELS = {
  entities: 'Climate-Entitaeten',
  title: 'Titel',
  icon: 'Icon',
  orientation: 'Slider-Orientierung',
  slider_size: 'Slider-Laenge (vertikal, px)',
  stacks: 'Vertikale Stapel (column-fill)',
  cols: 'Spalten (row-fill, ignoriert wenn Stapel gesetzt)',
  accent_color: 'Akzentfarbe',
  track_color: 'Schienen-Farbe',
  show_icon: 'Icon anzeigen (mit HVAC-Action-Badge)',
  show_name: 'Name anzeigen',
  show_target: 'Solltemperatur anzeigen',
  show_current: 'Raumtemperatur anzeigen',
  show_hvac_action: 'HVAC-Action anzeigen',
  show_window: 'Fenster-Symbol anzeigen',
  show_preset: 'Preset-Dropdown anzeigen',
  show_hvac_toggle: 'HVAC-Mode-Button anzeigen',
};

const EDITOR_SCHEMA_BASE = [
  {
    name: 'entities',
    required: true,
    selector: { entity: { multiple: true, filter: { domain: 'climate' } } },
  },
  {
    type: 'grid', name: '',
    schema: [
      { name: 'title', selector: { text: {} } },
      { name: 'icon', selector: { icon: {} } },
    ],
  },
  {
    type: 'grid', name: '',
    schema: [
      {
        name: 'orientation',
        selector: { select: { mode: 'dropdown', options: [
          { value: 'horizontal', label: 'Horizontal' },
          { value: 'vertical', label: 'Vertikal' },
        ] } },
      },
      { name: 'slider_size', selector: { number: { min: 60, max: 400, step: 10, mode: 'box', unit_of_measurement: 'px' } } },
    ],
  },
  {
    type: 'grid', name: '',
    schema: [
      { name: 'stacks', selector: { number: { min: 0, max: 12, step: 1, mode: 'box' } } },
      { name: 'cols', selector: { number: { min: 0, max: 12, step: 1, mode: 'box' } } },
    ],
  },
  {
    type: 'grid', name: '',
    schema: [
      { name: 'accent_color', selector: { text: {} } },
      { name: 'track_color', selector: { text: {} } },
    ],
  },
  {
    type: 'grid', name: '',
    schema: [
      { name: 'show_icon', selector: { boolean: {} } },
      { name: 'show_name', selector: { boolean: {} } },
      { name: 'show_target', selector: { boolean: {} } },
      { name: 'show_current', selector: { boolean: {} } },
      { name: 'show_hvac_action', selector: { boolean: {} } },
      { name: 'show_window', selector: { boolean: {} } },
      { name: 'show_preset', selector: { boolean: {} } },
      { name: 'show_hvac_toggle', selector: { boolean: {} } },
    ],
  },
];

const sanitizeKey = (id) => 'cfg__' + id.replace(/[^a-zA-Z0-9]/g, '_');

class ClimateRowCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._namesByEntity = {};
    this._iconsByEntity = {};
    this._windowsByEntity = {};
    this._currentSensorsByEntity = {};
    this._lastNamesKey = '';
    this._nameInputs = {};
    this._iconInputs = {};
    this._windowSelectors = {};
    this._currentSensorSelectors = {};
  }

  setConfig(config) {
    this._config = config || {};
    this._namesByEntity = {};
    this._iconsByEntity = {};
    this._windowsByEntity = {};
    this._currentSensorsByEntity = {};
    if (Array.isArray(this._config.entities)) {
      for (const e of this._config.entities) {
        if (e && typeof e === 'object' && e.entity) {
          if (e.name) this._namesByEntity[e.entity] = e.name;
          if (e.icon) this._iconsByEntity[e.entity] = e.icon;
          if (e.window) this._windowsByEntity[e.entity] = e.window;
          if (e.current_sensor) this._currentSensorsByEntity[e.entity] = e.current_sensor;
        }
      }
    }
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _selectedEntityIds() {
    if (!Array.isArray(this._config.entities)) return [];
    return this._config.entities
      .map((e) => (typeof e === 'string' ? e : e?.entity))
      .filter(Boolean);
  }

  _formData() {
    return {
      title: this._config.title ?? '',
      icon: this._config.icon ?? 'mdi:radiator',
      entities: this._selectedEntityIds(),
      orientation: this._config.orientation === 'vertical' ? 'vertical' : 'horizontal',
      slider_size: typeof this._config.slider_size === 'number' ? this._config.slider_size : 140,
      stacks: typeof this._config.stacks === 'number' ? this._config.stacks : 0,
      cols: typeof this._config.cols === 'number' ? this._config.cols : 0,
      accent_color: this._config.accent_color ?? '#ef4444',
      track_color: this._config.track_color ?? 'rgba(127,127,127,0.18)',
      show_icon: this._config.show_icon !== false,
      show_name: this._config.show_name !== false,
      show_target: this._config.show_target !== false,
      show_current: this._config.show_current !== false,
      show_hvac_action: this._config.show_hvac_action !== false,
      show_window: this._config.show_window !== false,
      show_preset: this._config.show_preset !== false,
      show_hvac_toggle: this._config.show_hvac_toggle !== false,
    };
  }

  _render() {
    if (!this.shadowRoot) return;
    if (!this._form) {
      this.shadowRoot.innerHTML = '';
      const style = document.createElement('style');
      style.textContent = `
        :host { display: block; }
        .crr-editor { padding: 8px 4px 4px; }
        .crr-hint {
          margin: 10px 4px 0; padding: 8px 10px;
          font-size: 0.8rem; color: var(--secondary-text-color);
          background: rgba(127,127,127,0.08);
          border-left: 3px solid #ef4444; border-radius: 4px;
        }
        .crr-hint code {
          background: rgba(127,127,127,0.18);
          padding: 1px 4px; border-radius: 3px; font-size: 0.78rem;
        }
        .crr-entities { margin: 14px 4px 4px; }
        .crr-entities-heading {
          font-size: 0.85rem; font-weight: 600;
          color: var(--primary-text-color); margin-bottom: 4px;
        }
        .crr-entities-sub {
          font-size: 0.75rem; color: var(--secondary-text-color);
          margin-bottom: 8px;
        }
        .crr-entity-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 6px;
          padding: 10px;
          margin-bottom: 8px;
          border: 1px solid var(--divider-color, rgba(127,127,127,0.2));
          border-radius: 8px;
          background: rgba(127,127,127,0.04);
        }
        .crr-entity-head {
          display: flex; flex-direction: row;
          align-items: center; gap: 8px;
          min-width: 0;
        }
        .crr-entity-reorder {
          display: inline-flex; flex-direction: column;
          gap: 2px; flex: 0 0 auto;
        }
        .crr-reorder-btn {
          appearance: none; border: none;
          background: rgba(127,127,127,0.14);
          color: var(--secondary-text-color);
          border-radius: 4px;
          width: 24px; height: 16px;
          display: inline-flex; align-items: center; justify-content: center;
          cursor: pointer; padding: 0;
          font-size: 11px; line-height: 1;
          transition: background-color 120ms ease, color 120ms ease;
        }
        .crr-reorder-btn:hover {
          background: rgba(127,127,127,0.25);
          color: var(--primary-color, #03a9f4);
        }
        .crr-reorder-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .crr-entity-meta {
          display: flex; flex-direction: column;
          min-width: 0; flex: 1 1 auto;
        }
        .crr-entity-friendly {
          font-size: 0.85rem; font-weight: 600;
          color: var(--primary-text-color);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .crr-entity-id {
          font-size: 0.7rem; color: var(--secondary-text-color);
          font-family: var(--code-font-family, monospace);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .crr-entity-fields {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 6px 8px;
        }
        .crr-entity-fields label {
          display: flex; flex-direction: column; gap: 4px;
          font-size: 0.75rem; color: var(--secondary-text-color);
          min-width: 0;
        }
        .crr-entity-fields .crr-full { grid-column: 1 / -1; }
        .crr-input, .crr-select {
          font: inherit; font-size: 0.85rem;
          padding: 7px 10px;
          border-radius: 6px;
          border: 1px solid var(--divider-color, rgba(127,127,127,0.3));
          background: var(--card-background-color, transparent);
          color: var(--primary-text-color);
          width: 100%;
          box-sizing: border-box;
        }
        .crr-input:focus, .crr-select:focus {
          outline: none; border-color: var(--primary-color, #03a9f4);
        }
        @media (max-width: 600px) {
          .crr-entity-fields {
            grid-template-columns: minmax(0, 1fr);
          }
        }
      `;
      const wrap = document.createElement('div');
      wrap.className = 'crr-editor';
      const form = document.createElement('ha-form');
      form.addEventListener('value-changed', (ev) => this._valueChanged(ev));
      const entitiesSection = document.createElement('div');
      entitiesSection.className = 'crr-entities';
      const hint = document.createElement('div');
      hint.className = 'crr-hint';
      hint.innerHTML =
        'Pro Thermostat l&auml;sst sich unten ein eigener Name, ein <code>binary_sensor</code> als Fensterkontakt und ein <code>sensor</code> als externer Ist-Temperatur-Sensor festlegen. ' +
        'Ohne Ist-Sensor wird das <code>current_temperature</code>-Attribut der Climate-Entit&auml;t verwendet.';
      wrap.appendChild(form);
      wrap.appendChild(entitiesSection);
      wrap.appendChild(hint);
      this.shadowRoot.appendChild(style);
      this.shadowRoot.appendChild(wrap);
      this._form = form;
      this._entitiesSection = entitiesSection;
    }
    this._form.hass = this._hass;
    this._form.schema = EDITOR_SCHEMA_BASE;
    this._form.data = this._formData();
    this._form.computeLabel = (s) => EDITOR_LABELS[s.name] ?? s.name;
    this._renderEntitiesSection();
  }

  _renderEntitiesSection() {
    if (!this._entitiesSection) return;
    const entities = this._selectedEntityIds();
    const key = entities.join('|');

    if (key === this._lastNamesKey) {
      for (const id of entities) {
        const nameIn = this._nameInputs[id];
        const iconIn = this._iconInputs[id];
        const wsel = this._windowSelectors[id];
        const csel = this._currentSensorSelectors[id];
        if (nameIn && this.shadowRoot.activeElement !== nameIn) {
          const v = this._namesByEntity[id] ?? '';
          if (nameIn.value !== v) nameIn.value = v;
        }
        if (iconIn && this.shadowRoot.activeElement !== iconIn) {
          const v = this._iconsByEntity[id] ?? '';
          if (iconIn.value !== v) iconIn.value = v;
        }
        if (wsel && this.shadowRoot.activeElement !== wsel) {
          this._populateBinarySensorOptions(wsel, this._windowsByEntity[id] ?? '');
        }
        if (csel && this.shadowRoot.activeElement !== csel) {
          this._populateTempSensorOptions(csel, this._currentSensorsByEntity[id] ?? '');
        }
      }
      return;
    }

    this._lastNamesKey = key;
    this._entitiesSection.innerHTML = '';
    this._nameInputs = {};
    this._iconInputs = {};
    this._windowSelectors = {};
    this._currentSensorSelectors = {};
    if (!entities.length) return;

    const heading = document.createElement('div');
    heading.className = 'crr-entities-heading';
    heading.textContent = 'Pro Thermostat: Name + Fensterkontakt';
    const sub = document.createElement('div');
    sub.className = 'crr-entities-sub';
    sub.textContent = 'Reihenfolge per ▲/▼. Name leer = Friendly-Name. Icon leer = Entity-Icon oder mdi:radiator.';
    this._entitiesSection.appendChild(heading);
    this._entitiesSection.appendChild(sub);

    entities.forEach((id, idx) => {
      const row = document.createElement('div');
      row.className = 'crr-entity-row';

      const head = document.createElement('div');
      head.className = 'crr-entity-head';

      const reorder = document.createElement('div');
      reorder.className = 'crr-entity-reorder';
      const upBtn = document.createElement('button');
      upBtn.type = 'button';
      upBtn.className = 'crr-reorder-btn';
      upBtn.textContent = '▲';
      upBtn.title = 'Nach oben';
      upBtn.disabled = idx === 0;
      upBtn.addEventListener('click', (ev) => { ev.preventDefault(); this._moveEntity(id, -1); });
      const downBtn = document.createElement('button');
      downBtn.type = 'button';
      downBtn.className = 'crr-reorder-btn';
      downBtn.textContent = '▼';
      downBtn.title = 'Nach unten';
      downBtn.disabled = idx === entities.length - 1;
      downBtn.addEventListener('click', (ev) => { ev.preventDefault(); this._moveEntity(id, +1); });
      reorder.appendChild(upBtn);
      reorder.appendChild(downBtn);
      head.appendChild(reorder);

      const meta = document.createElement('div');
      meta.className = 'crr-entity-meta';
      const friendly = this._hass?.states?.[id]?.attributes?.friendly_name ?? id;
      const f = document.createElement('span');
      f.className = 'crr-entity-friendly';
      f.textContent = friendly;
      f.title = friendly;
      const e = document.createElement('span');
      e.className = 'crr-entity-id';
      e.textContent = id;
      e.title = id;
      meta.appendChild(f);
      meta.appendChild(e);
      head.appendChild(meta);

      row.appendChild(head);

      const fields = document.createElement('div');
      fields.className = 'crr-entity-fields';

      const iconLbl = document.createElement('label');
      iconLbl.textContent = 'Icon (z. B. mdi:radiator)';
      const iconInput = document.createElement('input');
      iconInput.type = 'text';
      iconInput.className = 'crr-input';
      const stateIcon = this._hass?.states?.[id]?.attributes?.icon;
      iconInput.placeholder = stateIcon || 'mdi:radiator';
      iconInput.value = this._iconsByEntity[id] ?? '';
      iconInput.addEventListener('input', () => this._onIconInput(id, iconInput.value));
      iconLbl.appendChild(iconInput);
      fields.appendChild(iconLbl);

      const nameLbl = document.createElement('label');
      nameLbl.textContent = 'Name';
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'crr-input';
      nameInput.placeholder = friendly;
      nameInput.value = this._namesByEntity[id] ?? '';
      nameInput.addEventListener('input', () => this._onNameInput(id, nameInput.value));
      nameLbl.appendChild(nameInput);
      fields.appendChild(nameLbl);

      const winLbl = document.createElement('label');
      winLbl.textContent = 'Fensterkontakt (binary_sensor)';
      const winSel = document.createElement('select');
      winSel.className = 'crr-select';
      this._populateBinarySensorOptions(winSel, this._windowsByEntity[id] ?? '');
      winSel.addEventListener('change', () => this._onWindowChange(id, winSel.value));
      winLbl.appendChild(winSel);
      fields.appendChild(winLbl);

      const curLbl = document.createElement('label');
      curLbl.textContent = 'Ist-Temperatur-Sensor (extern, optional)';
      const curSel = document.createElement('select');
      curSel.className = 'crr-select';
      this._populateTempSensorOptions(curSel, this._currentSensorsByEntity[id] ?? '');
      curSel.addEventListener('change', () => this._onCurrentSensorChange(id, curSel.value));
      curLbl.appendChild(curSel);
      fields.appendChild(curLbl);

      row.appendChild(fields);
      this._entitiesSection.appendChild(row);
      this._nameInputs[id] = nameInput;
      this._iconInputs[id] = iconInput;
      this._windowSelectors[id] = winSel;
      this._currentSensorSelectors[id] = curSel;
    });
  }

  _populateBinarySensorOptions(sel, currentValue) {
    const sensors = this._hass
      ? Object.keys(this._hass.states)
          .filter((id) => id.startsWith('binary_sensor.'))
          .sort()
      : [];
    this._fillSensorSelect(sel, sensors, currentValue);
  }

  _populateTempSensorOptions(sel, currentValue) {
    const sensors = this._hass
      ? Object.entries(this._hass.states)
          .filter(([id, st]) =>
            id.startsWith('sensor.') &&
            (st?.attributes?.device_class === 'temperature' ||
             st?.attributes?.unit_of_measurement === '°C' ||
             st?.attributes?.unit_of_measurement === '°F')
          )
          .map(([id]) => id)
          .sort()
      : [];
    this._fillSensorSelect(sel, sensors, currentValue);
  }

  _fillSensorSelect(sel, sensors, currentValue) {
    const existing = Array.from(sel.options).map((o) => o.value);
    const want = ['', ...sensors];
    const same = existing.length === want.length && want.every((v, i) => existing[i] === v);
    if (!same) {
      sel.innerHTML = '';
      const none = document.createElement('option');
      none.value = '';
      none.textContent = '— keiner —';
      sel.appendChild(none);
      for (const id of sensors) {
        const opt = document.createElement('option');
        opt.value = id;
        const fn = this._hass?.states?.[id]?.attributes?.friendly_name;
        opt.textContent = fn ? `${fn} (${id})` : id;
        sel.appendChild(opt);
      }
    }
    if (sel.value !== currentValue) sel.value = currentValue;
  }

  _onNameInput(entityId, raw) {
    const v = (raw ?? '').trim();
    if (v) this._namesByEntity[entityId] = v;
    else delete this._namesByEntity[entityId];
    this._emitConfig();
  }

  _onWindowChange(entityId, value) {
    if (value) this._windowsByEntity[entityId] = value;
    else delete this._windowsByEntity[entityId];
    this._emitConfig();
  }

  _onCurrentSensorChange(entityId, value) {
    if (value) this._currentSensorsByEntity[entityId] = value;
    else delete this._currentSensorsByEntity[entityId];
    this._emitConfig();
  }

  _onIconInput(entityId, raw) {
    const v = (raw ?? '').trim();
    if (v) this._iconsByEntity[entityId] = v;
    else delete this._iconsByEntity[entityId];
    this._emitConfig();
  }

  _moveEntity(entityId, delta) {
    const ids = this._selectedEntityIds().slice();
    const idx = ids.indexOf(entityId);
    const target = idx + delta;
    if (idx < 0 || target < 0 || target >= ids.length) return;
    [ids[idx], ids[target]] = [ids[target], ids[idx]];
    const entities = ids.map((id) => this._buildEntityEntry(id));
    this._config = { ...this._config, entities };
    this._lastNamesKey = '';
    this.dispatchEvent(
      new CustomEvent('config-changed', { detail: { config: this._config }, bubbles: true, composed: true })
    );
  }

  _buildEntityEntry(id) {
    const name = this._namesByEntity[id];
    const icon = this._iconsByEntity[id];
    const win = this._windowsByEntity[id];
    const cur = this._currentSensorsByEntity[id];
    if (name || icon || win || cur) {
      const obj = { entity: id };
      if (icon) obj.icon = icon;
      if (name) obj.name = name;
      if (win) obj.window = win;
      if (cur) obj.current_sensor = cur;
      return obj;
    }
    return id;
  }

  _emitConfig() {
    const entities = this._selectedEntityIds().map((id) => this._buildEntityEntry(id));
    this._config = { ...this._config, entities };
    this.dispatchEvent(
      new CustomEvent('config-changed', { detail: { config: this._config }, bubbles: true, composed: true })
    );
  }

  _valueChanged(ev) {
    ev.stopPropagation();
    const value = ev.detail?.value ?? {};
    const next = { ...this._config };

    if (Array.isArray(value.entities)) {
      const stillSelected = new Set(value.entities);
      for (const map of [this._namesByEntity, this._iconsByEntity, this._windowsByEntity, this._currentSensorsByEntity]) {
        for (const k of Object.keys(map)) {
          if (!stillSelected.has(k)) delete map[k];
        }
      }
      next.entities = value.entities.map((id) => this._buildEntityEntry(id));
    }

    for (const k of ['title', 'icon', 'accent_color', 'track_color', 'orientation']) {
      if (value[k] !== undefined) next[k] = value[k];
      if (typeof next[k] === 'string' && next[k].trim() === '') delete next[k];
    }
    if (next.orientation === 'horizontal') delete next.orientation;
    for (const k of ['slider_size', 'stacks', 'cols']) {
      if (value[k] !== undefined) next[k] = value[k];
      if (next[k] === 0 || next[k] === null || next[k] === undefined) delete next[k];
    }
    if (next.slider_size === 140) delete next.slider_size;
    for (const k of ['show_icon', 'show_name', 'show_target', 'show_current', 'show_hvac_action', 'show_window', 'show_preset', 'show_hvac_toggle']) {
      if (value[k] !== undefined) next[k] = value[k];
      if (next[k] === true) delete next[k];
    }

    this._config = next;
    this.dispatchEvent(
      new CustomEvent('config-changed', { detail: { config: next }, bubbles: true, composed: true })
    );
  }
}

if (!customElements.get('climate-row-card-editor')) {
  customElements.define('climate-row-card-editor', ClimateRowCardEditor);
}
if (!customElements.get('climate-row-card')) {
  customElements.define('climate-row-card', ClimateRowCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === 'climate-row-card')) {
  window.customCards.push({
    type: 'climate-row-card',
    name: 'Climate Row',
    description: 'Mehrere Thermostate als Reihe/Stapel mit Slider (vertikal oder horizontal), HVAC-Mode, Preset, Soll-/Raumtemp, HVAC-Action und Fensterkontakt.',
    preview: false,
  });
}
