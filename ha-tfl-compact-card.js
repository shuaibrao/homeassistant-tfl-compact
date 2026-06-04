// TfL Compact Line Status Card for Home Assistant
// Minimal side-by-side line status widget matching the bus card's compact style, with full-card modal popup on click.

const LINE_METADATA = {
  // Tube Lines
  'bakerloo': { name: 'Bakerloo', color: '#B26300', mode: 'tube' },
  'central': { name: 'Central', color: '#DC241F', mode: 'tube' },
  'circle': { name: 'Circle', color: '#FFD329', text_color: '#00205B', mode: 'tube' },
  'district': { name: 'District', color: '#007D32', mode: 'tube' },
  'dlr': { name: 'DLR', color: '#00AFAD', mode: 'dlr' },
  'elizabeth': { name: 'Elizabeth line', color: '#5D3792', mode: 'elizabeth-line' },
  'hammersmith-city': { name: 'Hammersmith & City', color: '#F4A9BE', text_color: '#00205B', mode: 'tube' },
  'jubilee': { name: 'Jubilee', color: '#A1A5A7', mode: 'tube' },
  'metropolitan': { name: 'Metropolitan', color: '#9B0058', mode: 'tube' },
  'northern': { name: 'Northern', color: '#000000', mode: 'tube' },
  'piccadilly': { name: 'Piccadilly', color: '#0019A8', mode: 'tube' },
  'victoria': { name: 'Victoria', color: '#0098D8', mode: 'tube' },
  'waterloo-city': { name: 'Waterloo & City', color: '#93CEBA', text_color: '#00205B', mode: 'tube' },

  // Tram
  'tram': { name: 'Tram', color: '#00BD19', mode: 'tram' },

  // London Overground Lines
  'london-overground': { name: 'London Overground', color: '#EF7B10', mode: 'overground' },
  'liberty': { name: 'Liberty', color: '#676767', mode: 'overground' },
  'lioness': { name: 'Lioness', color: '#F1B41C', text_color: '#00205B', mode: 'overground' },
  'mildmay': { name: 'Mildmay', color: '#437EC1', mode: 'overground' },
  'suffragette': { name: 'Suffragette', color: '#39B97A', mode: 'overground' },
  'weaver': { name: 'Weaver', color: '#893B67', mode: 'overground' },
  'windrush': { name: 'Windrush', color: '#D22730', mode: 'overground' }
};

class TfLCompactCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._statuses = {};
    this._loading = true;
    this._error = null;
    this._pollTimer = null;
    
    // Modal popup states
    this._modalOpen = false;
    this._expandedLines = new Set();
    this._allLinesData = [];
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

      // Parse all lines for the modal view
      this._allLinesData = data.map(line => {
        const meta = LINE_METADATA[line.id] || { name: line.name, color: '#EF7B10', mode: line.modeName };
        const activeStatuses = (line.lineStatuses || [])
          .filter(status => status.statusSeverity !== 10)
          .map(status => ({
            severityText: status.statusSeverityDescription,
            reason: status.reason || ''
          }));
        const isGoodService = activeStatuses.length === 0;
        const statuses = isGoodService 
          ? [{ severityText: 'Good service', reason: '' }] 
          : activeStatuses;

        // Extract unique, normalized reasons
        const uniqueReasons = [];
        for (const s of statuses) {
          if (!s.reason) continue;
          const cleaned = s.reason.trim();
          const norm = cleaned.toLowerCase().replace(/\s+/g, ' ').replace(/\.$/, '');
          if (!uniqueReasons.some(r => r.toLowerCase().replace(/\s+/g, ' ').replace(/\.$/, '') === norm)) {
            uniqueReasons.push(cleaned);
          }
        }

        return {
          id: line.id,
          name: meta.name || line.name,
          mode: meta.mode || line.modeName,
          color: meta.color,
          textColor: meta.text_color || '#FFFFFF',
          isGoodService,
          statuses,
          reasons: uniqueReasons
        };
      });

      // Map and filter statuses for the compact card view
      const statuses = {};
      for (const line of this._allLinesData) {
        if (!this.config.lines.includes(line.id)) continue;

        statuses[line.id] = {
          isGood: line.isGoodService,
          text: line.statuses.map(s => s.severityText).join(', '),
          reason: line.reasons.join(' ')
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

  // --- Modal Interaction handlers ---

  _openModal() {
    this._modalOpen = true;
    this._render();
  }

  _closeModal(e) {
    if (e) e.stopPropagation();
    this._modalOpen = false;
    this._expandedLines.clear();
    this._render();
  }

  _toggleExpand(lineId, e) {
    if (e) e.stopPropagation();
    if (this._expandedLines.has(lineId)) {
      this._expandedLines.delete(lineId);
    } else {
      this._expandedLines.add(lineId);
    }
    this._render();
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
        const meta = LINE_METADATA[id] || { name: id, color: '#888' };
        const textColor = meta.text_color || meta.textColor || '#fff';
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

    // Prepare full card content for the modal if data is available
    let modalBodyHtml = '';
    if (this._loading) {
      modalBodyHtml = `
        <div class="loader-container">
          <div class="spinner"></div>
          <div class="loader-text">Loading Tube Status...</div>
        </div>`;
    } else if (this._error) {
      modalBodyHtml = `
        <div class="error-container">
          <div class="error-title">Unable to load TfL status</div>
          <div class="error-message">${this._error}</div>
        </div>`;
    } else if (this._allLinesData.length > 0) {
      const disrupted = this._allLinesData.filter(l => !l.isGoodService).sort((a, b) => a.name.localeCompare(b.name));
      const goodService = this._allLinesData.filter(l => l.isGoodService).sort((a, b) => a.name.localeCompare(b.name));
      const rows = [];

      // Render disrupted lines
      for (const line of disrupted) {
        const isExpanded = this._expandedLines.has(line.id);
        const hasReason = line.reasons.length > 0;
        const hoverClass = hasReason ? 'interactive' : '';
        const expandedClass = isExpanded ? 'expanded' : '';

        const reasonsHtml = line.reasons.map(r => `<div class="tfl-disruption-reason">${r}</div>`).join('');

        rows.push(`
          <div class="tfl-row ${expandedClass} ${hoverClass}" data-line-id="${line.id}">
            <div class="tfl-row-header">
              <div class="tfl-line-name-col" style="background-color: ${line.color}; color: ${line.textColor};">
                ${line.name}
              </div>
              <div class="tfl-status-col">
                <div class="tfl-status-text">
                  ${line.statuses.map(s => `<div class="tfl-status-item">${s.severityText}</div>`).join('')}
                </div>
                ${hasReason ? `
                  <div class="tfl-chevron">
                    <svg viewBox="0 0 24 24"><path d="M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z"/></svg>
                  </div>
                ` : '<div></div>'}
              </div>
            </div>
            ${hasReason ? `
              <div class="tfl-row-details" style="max-height: ${isExpanded ? '500px' : '0'};">
                <div class="tfl-details-content">
                  ${reasonsHtml}
                </div>
              </div>
            ` : ''}
          </div>
        `);
      }

      // Render Good Service lines grouped
      if (goodService.length > 0) {
        const isExpanded = this._expandedLines.has('good_service_grouped');
        const expandedClass = isExpanded ? 'expanded' : '';

        rows.push(`
          <div class="tfl-row ${expandedClass} interactive" data-line-id="good_service_grouped">
            <div class="tfl-row-header">
              <div class="tfl-stripes-col">
                ${goodService.map(line => `<div class="tfl-stripe" style="background-color: ${line.color};" title="${line.name}"></div>`).join('')}
              </div>
              <div class="tfl-status-col">
                <div class="tfl-status-text">
                  <div class="tfl-status-item">
                    ${disrupted.length === 0 ? 'Good service on all lines' : 'Good service on all other lines'}
                  </div>
                </div>
                <div class="tfl-chevron">
                  <svg viewBox="0 0 24 24"><path d="M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z"/></svg>
                </div>
              </div>
            </div>
            <div class="tfl-row-details" style="max-height: ${isExpanded ? '500px' : '0'};">
              <div class="tfl-details-content">
                <div class="good-service-detail-title">Operational Lines:</div>
                <div class="good-service-list">
                  ${goodService.map(line => `
                    <div class="good-service-line-tag">
                      <span class="line-dot" style="background-color: ${line.color};"></span>
                      <span class="line-tag-name">${line.name}</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>
        `);
      }

      modalBodyHtml = `
        <div class="ha-tfl-card">
          <div class="card-content">
            ${rows.join('')}
          </div>
        </div>`;
    }

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          
          --primary-text-color: var(--primary-text-color, #333333);
          --secondary-text-color: var(--secondary-text-color, #7f8c8d);
          --divider-color: var(--divider-color, #e0e0e0);
          --card-content-bg: #ffffff;
          --row-bg: #FAF6E9;
          --row-text-color: #00205B;
          --row-hover-bg: #f5eed3;
          --row-border-color: #ffffff;
          --row-details-bg: #fdfbf7;
          --row-details-text-color: #333333;
          --error-bg: #fdf5f5;
        }
        @media (prefers-color-scheme: dark) {
          :host {
            --primary-text-color: var(--primary-text-color, #ffffff);
            --secondary-text-color: var(--secondary-text-color, #bbbbbb);
            --divider-color: var(--divider-color, #333333);
            --card-content-bg: var(--ha-card-background, var(--card-background-color, #1c1c1c));
            --row-bg: var(--ha-card-background, var(--card-background-color, #1c1c1c));
            --row-text-color: var(--primary-text-color, #ffffff);
            --row-hover-bg: var(--secondary-background-color, #222222);
            --row-border-color: var(--divider-color, #333333);
            --row-details-bg: var(--ha-card-background, var(--card-background-color, #1c1c1c));
            --row-details-text-color: var(--primary-text-color, #ffffff);
            --error-bg: var(--ha-card-background, var(--card-background-color, #1c1c1c));
          }
        }

        /* Compact Card Styling */
        .compact-card {
          font-family: var(--paper-font-body1_-_font-family, system-ui, -apple-system, sans-serif);
          background: #ffffff;
          color: var(--primary-text-color, #333333);
          border-radius: var(--ha-card-border-radius, 12px);
          border: var(--ha-card-border, 1px solid var(--divider-color, #e0e0e0));
          box-shadow: var(--ha-card-box-shadow, none);
          overflow: hidden;
          cursor: pointer;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .compact-card:hover {
          box-shadow: var(--ha-card-box-shadow, 0 4px 12px rgba(0, 0, 0, 0.08));
          transform: translateY(-1px);
        }
        @media (prefers-color-scheme: dark) {
          .compact-card {
            background: var(--ha-card-background, var(--card-background-color, #1c1c1c));
          }
          .compact-card:hover {
            box-shadow: var(--ha-card-box-shadow, 0 4px 12px rgba(0, 0, 0, 0.3));
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

        /* Modal Overlay & Backdrop - Matches Native HASS Popups */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(5px);
          -webkit-backdrop-filter: blur(5px);
          z-index: 99999;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.2s ease-in-out;
          padding: 16px;
          box-sizing: border-box;
        }
        .modal-overlay.visible {
          opacity: 1;
          pointer-events: auto;
        }
        .modal-container {
          background: var(--ha-card-background, var(--card-background-color, #ffffff));
          color: var(--primary-text-color, #333333);
          width: 100%;
          max-width: 540px;
          max-height: 90vh;
          border-radius: var(--ha-card-border-radius, 12px);
          box-shadow: 0 16px 24px 2px rgba(0,0,0,0.14), 0 6px 30px 5px rgba(0,0,0,0.12), 0 8px 10px -5px rgba(0,0,0,0.2);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          transform: scale(0.9);
          transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .modal-overlay.visible .modal-container {
          transform: scale(1);
        }

        /* Modal Header (Native HASS more-info Layout) */
        .modal-header {
          display: flex;
          align-items: center;
          padding: 16px 20px;
          border-bottom: 1px solid var(--divider-color, #e0e0e0);
          gap: 16px;
          flex-shrink: 0;
        }
        .modal-close-btn {
          background: none;
          border: none;
          color: var(--primary-text-color, #333333);
          cursor: pointer;
          padding: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          transition: background-color 0.2s;
        }
        .modal-close-btn:hover {
          background-color: var(--secondary-background-color, rgba(0, 0, 0, 0.05));
        }
        .modal-close-btn svg {
          width: 24px;
          height: 24px;
          fill: currentColor;
        }
        .modal-title-container {
          display: flex;
          flex-direction: column;
          flex: 1;
        }
        .modal-subtitle {
          font-size: 11px;
          color: var(--secondary-text-color, #7f8c8d);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-weight: 500;
          line-height: 1.2;
        }
        .modal-title {
          font-size: 18px;
          font-weight: 600;
          color: var(--primary-text-color, #333333);
          line-height: 1.3;
        }

        /* Modal Body */
        .modal-body {
          overflow-y: auto;
          flex: 1;
          padding: 0;
          background: var(--card-content-bg, #ffffff);
        }

        /* Full Card Content Layout within Modal */
        .modal-body .ha-tfl-card {
          background-color: transparent;
          border: none;
          box-shadow: none;
          border-radius: 0;
        }
        .card-content {
          padding: 0;
          display: flex;
          flex-direction: column;
        }
        
        /* Row structure */
        .tfl-row {
          display: flex;
          flex-direction: column;
          border-bottom: 2px solid var(--row-border-color);
          box-sizing: border-box;
          background-color: var(--row-bg);
        }
        .tfl-row:last-child {
          border-bottom: none;
        }
        .tfl-row-header {
          display: flex;
          min-height: 48px;
          align-self: stretch;
        }
        
        /* Column 1: Line Name / Stripes */
        .tfl-line-name-col {
          width: 40%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 8px 12px;
          font-weight: bold;
          font-size: 13px;
          text-align: center;
          box-sizing: border-box;
          border-right: 2px solid var(--row-border-color);
          line-height: 1.2;
          letter-spacing: 0.2px;
          text-shadow: 0 0 1px rgba(0,0,0,0.1);
        }
        .tfl-stripes-col {
          width: 40%;
          display: flex;
          flex-direction: column;
          align-self: stretch;
          border-right: 2px solid var(--row-border-color);
          box-sizing: border-box;
        }
        .tfl-stripe {
          flex: 1;
          width: 100%;
          border-bottom: 1px solid rgba(255, 255, 255, 0.15);
        }
        .tfl-stripe:last-child {
          border-bottom: none;
        }
        
        /* Column 2: Status Details */
        .tfl-status-col {
          width: 60%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 16px;
          background-color: var(--row-bg);
          color: var(--row-text-color);
          box-sizing: border-box;
          font-size: 13.5px;
          font-weight: 500;
        }
        .tfl-status-text {
          display: flex;
          flex-direction: column;
          gap: 2px;
          flex: 1;
        }
        .tfl-status-item {
          line-height: 1.3;
        }
        
        /* Chevron */
        .tfl-chevron {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .tfl-chevron svg {
          width: 20px;
          height: 20px;
          fill: var(--row-text-color);
        }
        .tfl-row.expanded .tfl-chevron {
          transform: rotate(90deg);
        }
        
        /* Interactive feedback */
        .interactive {
          cursor: pointer;
        }
        .interactive:hover .tfl-status-col {
          background-color: var(--row-hover-bg);
        }
        
        /* Details panel styling */
        .tfl-row-details {
          max-height: 0;
          overflow: hidden;
          transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          background-color: var(--row-details-bg);
          border-top: 1.5px solid var(--row-border-color);
        }
        .tfl-details-content {
          padding: 12px 16px;
          color: var(--row-details-text-color);
          font-size: 12.5px;
          line-height: 1.45;
          border-bottom: 1.5px solid var(--divider-color);
        }
        .tfl-disruption-reason {
          margin-bottom: 8px;
        }
        .tfl-disruption-reason:last-child {
          margin-bottom: 0;
        }
        
        /* Good Service Details */
        .good-service-detail-title {
          font-weight: bold;
          margin-bottom: 8px;
          color: var(--row-text-color);
          font-size: 13px;
        }
        .good-service-list {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 6px 12px;
        }
        .good-service-line-tag {
          display: flex;
          align-items: center;
          font-size: 12px;
        }
        .line-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          margin-right: 6px;
          display: inline-block;
          flex-shrink: 0;
          border: 1px solid rgba(0,0,0,0.1);
        }
        .line-tag-name {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        /* Loading and Error states within Modal */
        .loader-container {
          padding: 48px 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
        }
        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid rgba(0, 32, 91, 0.1);
          border-top-color: #00205B;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        .loader-text {
          font-size: 13px;
          color: var(--secondary-text-color);
          font-weight: 500;
        }
        .error-container {
          padding: 32px 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
        .error-title {
          font-weight: bold;
          color: #c0392b;
          font-size: 14px;
          margin-bottom: 4px;
        }
        .error-message {
          font-size: 12px;
          color: var(--secondary-text-color);
          line-height: 1.4;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      </style>

      <div class="compact-card" id="compact-card-body">
        ${bodyHtml}
      </div>

      <div class="modal-overlay ${this._modalOpen ? 'visible' : ''}" id="modal-overlay">
        <div class="modal-container" id="modal-container">
          <div class="modal-header">
            <button class="modal-close-btn" id="modal-close-btn" aria-label="Close">
              <svg viewBox="0 0 24 24"><path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/></svg>
            </button>
            <div class="modal-title-container">
              <div class="modal-subtitle">Transport for London</div>
              <div class="modal-title">Live Tube Status</div>
            </div>
          </div>
          <div class="modal-body">
            ${modalBodyHtml}
          </div>
        </div>
      </div>
    `;

    // --- Attach Event Listeners ---

    // 1. Compact card click opens modal
    const compactCard = this.shadowRoot.getElementById('compact-card-body');
    if (compactCard) {
      compactCard.addEventListener('click', () => this._openModal());
    }

    // 2. Close button click closes modal
    const closeBtn = this.shadowRoot.getElementById('modal-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => this._closeModal(e));
    }

    // 3. Click on overlay background backdrop closes modal
    const overlay = this.shadowRoot.getElementById('modal-overlay');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          this._closeModal(e);
        }
      });
    }

    // 4. Stop click propagation on modal container to prevent closing when clicking inside content
    const container = this.shadowRoot.getElementById('modal-container');
    if (container) {
      container.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    // 5. Interactive rows in modal (expandable details)
    const modalRows = this.shadowRoot.querySelectorAll('.modal-body .tfl-row.interactive');
    modalRows.forEach(row => {
      row.addEventListener('click', (e) => {
        const lineId = row.getAttribute('data-line-id');
        this._toggleExpand(lineId, e);
      });
    });
  }
}

customElements.define('ha-tfl-compact-card', TfLCompactCard);

// Register with the HA card picker
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'ha-tfl-compact-card',
  name: 'TfL Compact Status Card',
  description: 'Minimal side-by-side tube line status widget with interactive full-status details popup.',
  preview: true
});
