// TfL Compact Line Status Card for Home Assistant
// Minimal side-by-side line status widget matching the bus card's compact style.

const COMPACT_LINE_META = {
  // Tube Lines
  'bakerloo': { name: 'Bakerloo', color: '#B26300' },
  'central': { name: 'Central', color: '#DC241F' },
  'circle': { name: 'Circle', color: '#FFD329', textColor: '#00205B' },
  'district': { name: 'District', color: '#007D32' },
  'dlr': { name: 'DLR', color: '#00AFAD' },
  'elizabeth': { name: 'Elizabeth line', color: '#5D3792' },
  'hammersmith-city': { name: 'Hammersmith & City', color: '#F4A9BE', textColor: '#00205B' },
  'jubilee': { name: 'Jubilee', color: '#A1A5A7' },
  'metropolitan': { name: 'Metropolitan', color: '#9B0058' },
  'northern': { name: 'Northern', color: '#000000' },
  'piccadilly': { name: 'Piccadilly', color: '#0019A8' },
  'victoria': { name: 'Victoria', color: '#0098D8' },
  'waterloo-city': { name: 'Waterloo & City', color: '#93CEBA', textColor: '#00205B' },

  // Tram
  'tram': { name: 'Tram', color: '#00BD19' },

  // London Overground Lines
  'london-overground': { name: 'London Overground', color: '#EF7B10' },
  'liberty': { name: 'Liberty', color: '#676767' },
  'lioness': { name: 'Lioness', color: '#F1B41C', textColor: '#00205B' },
  'mildmay': { name: 'Mildmay', color: '#437EC1' },
  'suffragette': { name: 'Suffragette', color: '#39B97A' },
  'weaver': { name: 'Weaver', color: '#893B67' },
  'windrush': { name: 'Windrush', color: '#D22730' }
};

class TfLCompactCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._statuses = {};
    this._loading = true;
    this._error = null;
    this._pollTimer = null;
  }

  // --- Home Assistant Card Lifecycle ---

  setConfig(config) {
    if (!config.lines?.length) {
      throw new Error('Define at least one line in "lines" (e.g. "jubilee", "metropolitan").');
    }

    this.config = {
      update_interval: 60,
      api_key: null,
      ...config
    };

    this._restartPolling();
    this._fetchStatus();
  }

  set hass(hass) {
    this._hass = hass;
  }

  connectedCallback() {
    if (this.config) this._restartPolling();
    this._render();
  }

  disconnectedCallback() {
    clearInterval(this._pollTimer);
    this._pollTimer = null;
  }

  getCardSize() {
    return 1;
  }

  // --- Polling ---

  _restartPolling() {
    clearInterval(this._pollTimer);
    this._pollTimer = setInterval(
      () => this._fetchStatus(),
      this.config.update_interval * 1000
    );
  }

  // --- Data Fetching ---

  async _fetchStatus() {
    const firstLoad = Object.keys(this._statuses).length === 0;
    if (firstLoad) {
      this._loading = true;
      this._render();
    }

    try {
      let url = 'https://api.tfl.gov.uk/line/mode/tube,dlr,overground,elizabeth-line,tram/status';
      if (this.config.api_key) {
        url += `?app_key=${this.config.api_key}`;
      }

      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`TfL API error (${resp.status})`);
      const data = await resp.json();

      const statuses = {};
      for (const line of data) {
        if (!this.config.lines.includes(line.id)) continue;

        const disruptions = (line.lineStatuses || [])
          .filter(s => s.statusSeverity !== 10);

        statuses[line.id] = {
          isGood: disruptions.length === 0,
          text: disruptions.length === 0
            ? 'Good service'
            : disruptions.map(s => s.statusSeverityDescription).join(', '),
          reason: disruptions.map(s => s.reason).filter(Boolean).join(' ')
        };
      }

      this._statuses = statuses;
      this._error = null;
    } catch (err) {
      console.error('TfL Compact Card:', err);
      if (firstLoad) this._error = err.message;
    } finally {
      this._loading = false;
      this._render();
    }
  }

  // --- Rendering ---

  _render() {
    if (!this.shadowRoot) return;

    const lines = this.config?.lines || [];
    let bodyHtml;

    if (this._loading) {
      bodyHtml = '<div class="compact-msg"><div class="compact-spinner"></div>Loading...</div>';
    } else if (this._error) {
      bodyHtml = `<div class="compact-msg compact-error">${this._error}</div>`;
    } else {
      const bannerCells = lines.map(id => {
        const meta = COMPACT_LINE_META[id] || { name: id, color: '#888' };
        const textColor = meta.textColor || '#fff';
        return `<div class="compact-banner-cell" style="background:${meta.color};color:${textColor};">${meta.name}</div>`;
      }).join('');

      const statusCells = lines.map(id => {
        const status = this._statuses[id];
        if (!status) return '<div class="compact-status-cell">—</div>';
        const cls = status.isGood ? '' : ' compact-disrupted';
        const title = status.reason || '';
        return `<div class="compact-status-cell${cls}" title="${title}">${status.text}</div>`;
      }).join('');

      bodyHtml = `
        <div class="compact-banner-row">${bannerCells}</div>
        <div class="compact-status-row">${statusCells}</div>`;
    }

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }
        .compact-card {
          font-family: var(--paper-font-body1_-_font-family, system-ui, -apple-system, sans-serif);
          background: #ffffff;
          color: var(--primary-text-color, #333333);
          border-radius: var(--ha-card-border-radius, 12px);
          border: var(--ha-card-border, 1px solid var(--divider-color, #e0e0e0));
          box-shadow: var(--ha-card-box-shadow, none);
          overflow: hidden;
        }
        @media (prefers-color-scheme: dark) {
          .compact-card {
            background: var(--ha-card-background, var(--card-background-color, #1c1c1c));
            color: var(--primary-text-color, #ffffff);
            --primary-text-color: var(--primary-text-color);
            --secondary-text-color: var(--secondary-text-color);
            --divider-color: var(--divider-color);
          }
        }

        /* Split banner row */
        .compact-banner-row {
          display: flex;
        }
        .compact-banner-cell {
          flex: 1;
          padding: 8px 12px;
          font-size: 13px;
          font-weight: 700;
          text-align: center;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .compact-banner-cell + .compact-banner-cell {
          border-left: 2px solid rgba(255, 255, 255, 0.25);
        }

        /* Status row */
        .compact-status-row {
          display: flex;
        }
        .compact-status-cell {
          flex: 1;
          padding: 6px 8px;
          font-size: 11.5px;
          font-weight: 500;
          text-align: center;
          color: var(--primary-text-color, #333);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .compact-status-cell + .compact-status-cell {
          border-left: 1px solid var(--divider-color, #f0f0f0);
        }
        .compact-disrupted {
          color: #DC241F;
          font-weight: 600;
        }

        /* State messages */
        .compact-msg {
          padding: 14px 12px;
          font-size: 12px;
          color: var(--secondary-text-color, #888);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }
        .compact-error {
          color: #c0392b;
        }
        .compact-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(0, 0, 0, 0.1);
          border-top-color: #666;
          border-radius: 50%;
          animation: compact-spin 0.7s linear infinite;
        }
        @keyframes compact-spin {
          to { transform: rotate(360deg); }
        }
      </style>
      <div class="compact-card">
        ${bodyHtml}
      </div>`;
  }
}

customElements.define('ha-tfl-compact-card', TfLCompactCard);

// Register with the HA card picker
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'ha-tfl-compact-card',
  name: 'TfL Compact Status Card',
  description: 'Minimal side-by-side tube line status widget.',
  preview: true
});
