/**
 * SheetTrader Pro - Interactive Spreadsheet Engine & Multi-Exchange Client
 * Supports NSE (.NS), BSE (.BO), and US/Global Markets
 * Features:
 * - Dedicated Indian (NSE/BSE) Spreadsheet with ₹ INR P&L box
 * - Dedicated Global (US/Global) Spreadsheet with $ USD P&L box
 * - Shared, unified Purchasing Power (₹10 Crore / ~$1.16M USD)
 * - Bulletproof Cloud & Local Persistence with Anti-Data-Loss Protection
 */

class SpreadsheetApp {
  constructor() {
    this.storageKey = 'sheet_trader_portfolio_v3';
    this.backupKey = 'sheet_trader_portfolio_backup';
    this.displayCurrency = 'INR';
    this.usdInrRate = 86.50;
    this.defaultCashINR = 100000000.00; // ₹10,00,00,000 (10 Crore)
    this.defaultCashUSD = 1200000.00;
    
    // State
    this.cashBalance = this.defaultCashINR;
    this.holdings = [];
    this.watchlist = [];
    this.tradeHistory = [];
    this.quotes = {};
    this.updatedAt = new Date().toISOString();
    this.activeTab = 'active-indian';
    this.refreshTimer = null;
    this.backendAvailable = false;
    this.pendingConfirmCallback = null;

    this.init();
  }

  async init() {
    this.loadLocalState();
    this.bindEvents();
    this.renderTabs();
    await this.checkBackendAndSync();
    this.startAutoRefresh();
  }

  // ----------------------------------------------------
  // Helper: Detect Indian vs Global Stock
  // ----------------------------------------------------
  isIndianHolding(holding) {
    if (!holding) return false;
    const sym = holding.symbol || '';
    const exch = holding.exchange || '';
    const curr = holding.currency || '';
    if (sym.endsWith('.NS') || sym.endsWith('.BO')) return true;
    if (exch === 'NSE' || exch === 'BSE') return true;
    if (curr === 'INR') return true;
    return false;
  }

  // ----------------------------------------------------
  // Bulletproof Persistence & Anti-Data-Loss Engine
  // ----------------------------------------------------
  loadLocalState() {
    // Check primary storage
    let saved = localStorage.getItem(this.storageKey);
    
    // If empty, check older storage versions or backup to recover entries
    if (!saved) {
      saved = localStorage.getItem(this.backupKey) || 
              localStorage.getItem('sheet_trader_portfolio_v2') || 
              localStorage.getItem('sheet_trader_portfolio');
    }

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        this.displayCurrency = parsed.displayCurrency || 'INR';
        this.cashBalance = parsed.cashBalance ?? this.defaultCashINR;
        this.holdings = parsed.holdings || [];
        this.watchlist = parsed.watchlist || [];
        this.tradeHistory = parsed.tradeHistory || [];
        this.updatedAt = parsed.updatedAt || new Date().toISOString();

        // Create a safety backup
        if (this.holdings.length > 0 || this.tradeHistory.length > 0) {
          localStorage.setItem(this.backupKey, saved);
        }
      } catch (e) {
        console.error('Error parsing stored portfolio:', e);
        this.loadCleanState();
      }
    } else {
      this.loadCleanState();
    }
    this.updateCurrencyUI();
    this.renderAll();
  }

  async syncWithServer() {
    if (!this.backendAvailable) return;
    try {
      const res = await fetch('/api/portfolio');
      if (res.ok) {
        const serverData = await res.json();
        
        // Check if server actually has valid entries
        const serverHasData = serverData && (
          (serverData.holdings && serverData.holdings.length > 0) ||
          (serverData.watchlist && serverData.watchlist.length > 0) ||
          (serverData.tradeHistory && serverData.tradeHistory.length > 0)
        );

        const localHasData = (this.holdings && this.holdings.length > 0) ||
                             (this.tradeHistory && this.tradeHistory.length > 0);

        if (serverHasData) {
          // If server has data, compare timestamps to determine if server is newer
          const serverTime = new Date(serverData.updatedAt || 0).getTime();
          const localTime = new Date(this.updatedAt || 0).getTime();

          if (serverTime >= localTime || !localHasData) {
            this.displayCurrency = serverData.displayCurrency || this.displayCurrency;
            this.cashBalance = serverData.cashBalance ?? this.cashBalance;
            this.holdings = serverData.holdings || [];
            this.watchlist = serverData.watchlist || [];
            this.tradeHistory = serverData.tradeHistory || [];
            this.updatedAt = serverData.updatedAt || new Date().toISOString();

            localStorage.setItem(this.storageKey, JSON.stringify(serverData));
            localStorage.setItem(this.backupKey, JSON.stringify(serverData));
            this.updateCurrencyUI();
            this.renderAll();
            console.log('[Sync] Loaded portfolio from cloud server');
          } else {
            // Local is newer than server, upload local to server
            this.pushStateToServer();
          }
        } else if (localHasData) {
          // Server was empty (e.g. fresh cloud deploy), preserve local data & push to server!
          console.log('[Sync] Server empty after deploy; uploading local portfolio to cloud');
          this.pushStateToServer();
        }
      }
    } catch (e) {
      console.warn('[Sync] Could not sync with server:', e);
    }
  }

  saveState() {
    this.updatedAt = new Date().toISOString();
    const data = {
      displayCurrency: this.displayCurrency,
      cashBalance: this.cashBalance,
      holdings: this.holdings,
      watchlist: this.watchlist,
      tradeHistory: this.tradeHistory,
      updatedAt: this.updatedAt
    };
    
    // Save to primary storage and backup storage
    localStorage.setItem(this.storageKey, JSON.stringify(data));
    if (this.holdings.length > 0 || this.tradeHistory.length > 0) {
      localStorage.setItem(this.backupKey, JSON.stringify(data));
    }

    this.renderAll();
    this.pushStateToServer(data);
  }

  async pushStateToServer(data = null) {
    if (!this.backendAvailable) return;
    const payload = data || {
      displayCurrency: this.displayCurrency,
      cashBalance: this.cashBalance,
      holdings: this.holdings,
      watchlist: this.watchlist,
      tradeHistory: this.tradeHistory,
      updatedAt: this.updatedAt
    };

    try {
      await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.warn('[Sync] Failed to push state to server:', e);
    }
  }

  loadCleanState() {
    this.displayCurrency = 'INR';
    this.cashBalance = this.defaultCashINR; // ₹10 Crore
    this.holdings = [];
    this.watchlist = [];
    this.tradeHistory = [];
    this.updatedAt = new Date().toISOString();
    this.saveState();
  }

  loadDemoData() {
    this.displayCurrency = 'INR';
    this.cashBalance = 85000000.00;
    
    this.holdings = [
      // Indian Stocks (NSE / BSE)
      {
        id: 'h_1',
        symbol: 'RELIANCE.NS',
        name: 'Reliance Industries Ltd.',
        currency: 'INR',
        exchange: 'NSE',
        buyPrice: 1285.50,
        quantity: 5000,
        buyDate: '2024-05-15',
        isWatched: true,
        targetPrice: 1450.00
      },
      {
        id: 'h_2',
        symbol: 'TCS.NS',
        name: 'Tata Consultancy Services Ltd.',
        currency: 'INR',
        exchange: 'NSE',
        buyPrice: 2240.00,
        quantity: 2000,
        buyDate: '2024-06-01',
        isWatched: true,
        targetPrice: 2450.00
      },
      {
        id: 'h_3',
        symbol: 'HDFCBANK.NS',
        name: 'HDFC Bank Ltd.',
        currency: 'INR',
        exchange: 'NSE',
        buyPrice: 710.00,
        quantity: 4000,
        buyDate: '2024-04-10',
        isWatched: false,
        targetPrice: 820.00
      },
      {
        id: 'h_4',
        symbol: 'ITC.BO',
        name: 'ITC Ltd. (BSE)',
        currency: 'INR',
        exchange: 'BSE',
        buyPrice: 255.00,
        quantity: 5000,
        buyDate: '2024-07-20',
        isWatched: true,
        targetPrice: 290.00
      },
      // Global Stocks (US / Global)
      {
        id: 'h_5',
        symbol: 'NVDA',
        name: 'NVIDIA Corporation',
        currency: 'USD',
        exchange: 'NASDAQ',
        buyPrice: 118.50,
        quantity: 200,
        buyDate: '2024-06-15',
        isWatched: true,
        targetPrice: 140.00
      },
      {
        id: 'h_6',
        symbol: 'AAPL',
        name: 'Apple Inc.',
        currency: 'USD',
        exchange: 'NASDAQ',
        buyPrice: 220.00,
        quantity: 150,
        buyDate: '2024-07-01',
        isWatched: true,
        targetPrice: 240.00
      }
    ];

    this.watchlist = [
      { id: 'w_1', symbol: 'INFY.NS', name: 'Infosys Limited', currency: 'INR', exchange: 'NSE', targetPrice: 1100.00, isWatched: true },
      { id: 'w_2', symbol: 'SBIN.BO', name: 'State Bank of India (BSE)', currency: 'INR', exchange: 'BSE', targetPrice: 980.00, isWatched: true },
      { id: 'w_3', symbol: 'MSFT', name: 'Microsoft Corporation', currency: 'USD', exchange: 'NASDAQ', targetPrice: 420.00, isWatched: true }
    ];

    this.tradeHistory = [
      {
        id: 'th_1',
        symbol: 'TATAMOTORS.NS',
        action: 'SELL_CLOSE',
        quantity: 1000,
        currency: 'INR',
        exchange: 'NSE',
        buyPrice: 880.00,
        sellPrice: 995.50,
        costBasis: 880000.00,
        grossProceeds: 995500.00,
        realizedPnl: 115500.00,
        roi: 13.12,
        buyDate: '2024-03-01',
        sellDate: '2024-06-15',
        holdingDays: 106
      }
    ];

    this.saveState();
    this.syncQuotes();
    this.showToast('Demo portfolio loaded with Indian & Global stocks', 'success');
  }

  // ----------------------------------------------------
  // Warning & Confirmation Modal System
  // ----------------------------------------------------
  showWarningModal({ title, message, subtext, confirmText, isDanger, onConfirm }) {
    document.getElementById('confirmModalTitle').textContent = title || '⚠️ Warning Confirmation';
    document.getElementById('confirmModalTitle').style.color = isDanger ? 'var(--loss-red)' : 'var(--warning-amber)';
    document.getElementById('confirmModalMessage').textContent = message || 'Are you sure you want to proceed?';
    document.getElementById('confirmModalSubtext').textContent = subtext || 'This action cannot be undone.';
    document.getElementById('confirmModalIcon').textContent = isDanger ? '🚨' : '⚠️';
    
    const confirmBtn = document.getElementById('btnConfirmModalAction');
    confirmBtn.textContent = confirmText || 'Confirm Action';
    confirmBtn.className = isDanger ? 'btn btn-danger' : 'btn btn-primary';

    this.pendingConfirmCallback = onConfirm;
    document.getElementById('confirmModal').classList.add('active');
  }

  executePendingConfirm() {
    if (typeof this.pendingConfirmCallback === 'function') {
      const cb = this.pendingConfirmCallback;
      this.pendingConfirmCallback = null;
      this.closeModals();
      cb();
    } else {
      this.closeModals();
    }
  }

  // ----------------------------------------------------
  // Currency Toggle & UI
  // ----------------------------------------------------
  toggleCurrency() {
    if (this.displayCurrency === 'INR') {
      this.displayCurrency = 'USD';
    } else {
      this.displayCurrency = 'INR';
    }
    this.updateCurrencyUI();
    this.renderAll();
    this.showToast(`Switched base currency for totals to ${this.displayCurrency === 'INR' ? '₹ INR' : '$ USD'}`, 'success');
  }

  updateCurrencyUI() {
    const symbol = this.displayCurrency === 'INR' ? '₹ INR' : '$ USD';
    const currSym = this.displayCurrency === 'INR' ? '₹' : '$';
    
    document.getElementById('currencyDisplayLabel').textContent = symbol;
    document.getElementById('modalBuyPriceCurrency').textContent = currSym;
    document.getElementById('modalSellPriceCurrency').textContent = currSym;
  }

  // ----------------------------------------------------
  // Event Listeners & UI Binding
  // ----------------------------------------------------
  bindEvents() {
    document.getElementById('btnConfirmModalAction').addEventListener('click', () => {
      this.executePendingConfirm();
    });

    document.getElementById('btnToggleCurrency').addEventListener('click', () => {
      this.toggleCurrency();
    });

    document.querySelectorAll('.sheet-tab').forEach(tabBtn => {
      tabBtn.addEventListener('click', (e) => {
        const targetTab = tabBtn.getAttribute('data-tab');
        this.switchTab(targetTab);
      });
    });

    document.getElementById('btnRefreshQuotes').addEventListener('click', () => {
      this.syncQuotes(true);
    });

    document.getElementById('refreshInterval').addEventListener('change', (e) => {
      this.startAutoRefresh(parseInt(e.target.value, 10));
    });

    document.getElementById('btnOpenBuyModal').addEventListener('click', () => {
      const defaultExch = this.activeTab === 'active-global' ? 'US' : 'NSE';
      this.openBuyModal('', defaultExch);
    });

    document.getElementById('btnClearAll').addEventListener('click', () => {
      this.showWarningModal({
        title: '⚠️ Clear All Portfolio Data',
        message: 'Are you sure you want to Clear All? This will permanently remove all active holdings, watchlist items, and trade history.',
        subtext: 'Your Buying Power will be reset to ₹10,00,00,000 (₹10 Crore). This action cannot be reversed.',
        confirmText: 'Yes, Clear All Data',
        isDanger: true,
        onConfirm: () => {
          this.loadCleanState();
          this.showToast('Portfolio cleared! Buying power reset to ₹10 Crore', 'success');
        }
      });
    });

    document.getElementById('btnResetDemo').addEventListener('click', () => {
      this.showWarningModal({
        title: '⚡ Load Demo Portfolio',
        message: 'Are you sure you want to load Demo Data? This will overwrite your current active holdings and trade ledger with sample Indian & Global stock positions.',
        subtext: 'You can clear or edit these sample positions at any time.',
        confirmText: 'Yes, Load Demo Data',
        isDanger: false,
        onConfirm: () => {
          this.loadDemoData();
        }
      });
    });

    document.getElementById('btnExportCSV').addEventListener('click', () => {
      this.exportCSV();
    });

    document.getElementById('formulaInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = e.target.value.trim().toUpperCase();
        const exch = document.getElementById('formulaExchangeSelect').value;
        if (val) {
          const resolved = this.formatSymbolWithExchange(val, exch);
          this.openBuyModal(resolved, exch);
          e.target.value = '';
        }
      }
    });

    document.getElementById('btnQuickSearch').addEventListener('click', () => {
      const input = document.getElementById('formulaInput');
      const exch = document.getElementById('formulaExchangeSelect').value;
      const val = input.value.trim().toUpperCase();
      if (val) {
        const resolved = this.formatSymbolWithExchange(val, exch);
        this.openBuyModal(resolved, exch);
        input.value = '';
      }
    });

    document.getElementById('buyExchange').addEventListener('change', (e) => {
      const symInput = document.getElementById('buySymbol');
      const val = symInput.value.trim().toUpperCase();
      const currSpan = document.getElementById('modalBuyPriceCurrency');
      if (e.target.value === 'US') {
        currSpan.textContent = '$';
      } else {
        currSpan.textContent = '₹';
      }

      if (val) {
        symInput.value = this.formatSymbolWithExchange(val, e.target.value);
        this.fetchQuoteForBuyModal();
      }
    });

    const buyPriceInput = document.getElementById('buyPrice');
    const buyQtyInput = document.getElementById('buyQty');
    const updateBuyModalPreview = () => {
      const p = parseFloat(buyPriceInput.value) || 0;
      const q = parseFloat(buyQtyInput.value) || 0;
      const total = p * q;
      const rawSym = document.getElementById('buySymbol').value.trim().toUpperCase();
      const exch = document.getElementById('buyExchange').value;
      const resolvedSym = this.formatSymbolWithExchange(rawSym, exch);
      const curr = this.getTickerCurrency(resolvedSym);
      
      document.getElementById('modalTotalInvested').textContent = this.formatCurrency(total, curr);
      
      // Calculate remaining shared buying power in INR
      const costInINR = curr === 'INR' ? total : (total * this.usdInrRate);
      const remainingINR = this.cashBalance - costInINR;
      
      const remainingEl = document.getElementById('modalCashRemaining');
      remainingEl.textContent = this.formatCurrency(remainingINR, 'INR');
      remainingEl.style.color = remainingINR < 0 ? 'var(--loss-red)' : 'var(--text-primary)';
    };

    buyPriceInput.addEventListener('input', updateBuyModalPreview);
    buyQtyInput.addEventListener('input', updateBuyModalPreview);

    const sellPriceInput = document.getElementById('sellPrice');
    const sellQtyInput = document.getElementById('sellQty');
    const updateSellModalPreview = () => {
      const holdingId = document.getElementById('sellHoldingId').value;
      const holding = this.holdings.find(h => h.id === holdingId);
      if (!holding) return;

      const p = parseFloat(sellPriceInput.value) || 0;
      const q = parseFloat(sellQtyInput.value) || 0;
      const proceeds = p * q;
      const costBasis = holding.buyPrice * q;
      const pnl = proceeds - costBasis;
      const curr = holding.currency || 'INR';

      document.getElementById('sellModalProceeds').textContent = this.formatCurrency(proceeds, curr);
      const pnlEl = document.getElementById('sellModalEstPnl');
      pnlEl.textContent = `${pnl >= 0 ? '+' : ''}${this.formatCurrency(pnl, curr)} (${costBasis > 0 ? ((pnl / costBasis) * 100).toFixed(2) : 0}%)`;
      pnlEl.className = pnl >= 0 ? 'text-gain' : 'text-loss';
    };

    sellPriceInput.addEventListener('input', updateSellModalPreview);
    sellQtyInput.addEventListener('input', updateSellModalPreview);
  }

  formatSymbolWithExchange(symbol, exchangeChoice) {
    let clean = symbol.trim().toUpperCase();
    if (clean.includes('.')) return clean;

    if (exchangeChoice === 'NSE') return `${clean}.NS`;
    if (exchangeChoice === 'BSE') return `${clean}.BO`;
    if (exchangeChoice === 'US') return clean;

    const indianTickers = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'ITC', 'TATAMOTORS', 'BHARTIARTL', 'WIPRO', 'LT', 'HINDUNILVR', 'KOTAKBANK', 'MARUTI', 'BAJFINANCE', 'AXISBANK', 'ZOMATO', 'PAYTM', 'JIOFIN'];
    if (indianTickers.includes(clean)) {
      return `${clean}.NS`;
    }
    return clean;
  }

  getTickerCurrency(symbol) {
    if (symbol.endsWith('.NS') || symbol.endsWith('.BO')) return 'INR';
    if (this.quotes[symbol]?.currency) return this.quotes[symbol].currency;
    return 'USD';
  }

  getExchangeBadgeHtml(symbol, exchange) {
    if (!exchange) {
      if (symbol.endsWith('.NS')) exchange = 'NSE';
      else if (symbol.endsWith('.BO')) exchange = 'BSE';
      else exchange = 'US';
    }

    let badgeClass = 'badge-us';
    if (exchange === 'NSE') badgeClass = 'badge-nse';
    else if (exchange === 'BSE') badgeClass = 'badge-bse';

    return `<span class="badge-exchange ${badgeClass}">${exchange}</span>`;
  }

  switchTab(tabId) {
    this.activeTab = tabId;
    document.querySelectorAll('.sheet-tab').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
    });

    document.querySelectorAll('.sheet-panel').forEach(p => {
      p.classList.toggle('active', p.id === `tab-${tabId}`);
    });
  }

  // ----------------------------------------------------
  // Market Data & yfinance Integration Engine
  // ----------------------------------------------------
  getAllSymbols() {
    const symbols = new Set();
    this.holdings.forEach(h => symbols.add(h.symbol));
    this.watchlist.forEach(w => symbols.add(w.symbol));
    return Array.from(symbols);
  }

  async checkBackendAndSync() {
    try {
      const [healthRes, fxRes] = await Promise.all([
        fetch('/api/health'),
        fetch('/api/fx')
      ]);

      if (healthRes.ok) {
        this.backendAvailable = true;
        this.updateMarketStatusBadge(true, 'Live Feed Active (NSE/BSE/Global)');
        if (fxRes.ok) {
          const fxData = await fxRes.json();
          if (fxData.USDINR) this.usdInrRate = fxData.USDINR;
        }
        await this.syncWithServer();
      } else {
        this.backendAvailable = false;
        this.updateMarketStatusBadge(true, 'Local Simulator Active');
      }
    } catch (e) {
      this.backendAvailable = false;
      this.updateMarketStatusBadge(true, 'Local Simulator Active');
    }
    await this.syncQuotes();
  }

  updateMarketStatusBadge(online, text) {
    const badge = document.getElementById('marketStatusBadge');
    const label = document.getElementById('marketStatusText');
    label.textContent = text;
    if (online) {
      badge.classList.remove('closed');
    } else {
      badge.classList.add('closed');
    }
  }

  async syncQuotes(manual = false) {
    const symbols = this.getAllSymbols();
    if (symbols.length === 0) {
      this.renderAll();
      if (manual) this.showToast('No symbols to sync', 'info');
      return;
    }

    if (manual) {
      const btn = document.getElementById('btnRefreshQuotes');
      btn.textContent = '⏳ Fetching...';
      btn.disabled = true;
    }

    try {
      if (this.backendAvailable) {
        const symStr = symbols.join(',');
        const [quotesRes, histRes] = await Promise.all([
          fetch(`/api/quotes?symbols=${encodeURIComponent(symStr)}`),
          fetch(`/api/history?symbols=${encodeURIComponent(symStr)}&period=1mo`)
        ]);

        if (quotesRes.ok) {
          const quotesData = await quotesRes.json();
          const histData = histRes.ok ? await histRes.json() : {};

          for (const [sym, q] of Object.entries(quotesData)) {
            const prev = this.quotes[sym];
            this.quotes[sym] = {
              price: q.price,
              prevPrice: prev ? prev.price : q.price,
              change: q.change,
              changePct: q.changePct,
              high52: q.high52,
              low52: q.low52,
              name: q.name || sym,
              currency: q.currency || (sym.endsWith('.NS') || sym.endsWith('.BO') ? 'INR' : 'USD'),
              exchange: q.exchange || (sym.endsWith('.NS') ? 'NSE' : (sym.endsWith('.BO') ? 'BSE' : 'US')),
              history30d: histData[sym] || this.generateMockHistory(q.price)
            };
          }
        }
      } else {
        symbols.forEach(sym => {
          const current = this.quotes[sym];
          const basePrice = current ? current.price : this.getBasePriceForSymbol(sym);
          const delta = (Math.random() - 0.49) * (basePrice * 0.012);
          const newPrice = Math.max(1, +(basePrice + delta).toFixed(2));
          const prevClose = basePrice * 0.985;
          const change = +(newPrice - prevClose).toFixed(2);
          const changePct = +((change / prevClose) * 100).toFixed(2);
          const isIndian = sym.endsWith('.NS') || sym.endsWith('.BO');

          this.quotes[sym] = {
            price: newPrice,
            prevPrice: current ? current.price : newPrice,
            change: change,
            changePct: changePct,
            high52: +(newPrice * 1.25).toFixed(2),
            low52: +(newPrice * 0.72).toFixed(2),
            name: this.getCompanyNameForSymbol(sym),
            currency: isIndian ? 'INR' : 'USD',
            exchange: sym.endsWith('.NS') ? 'NSE' : (sym.endsWith('.BO') ? 'BSE' : 'US'),
            history30d: current?.history30d || this.generateMockHistory(newPrice)
          };
        });
      }

      this.renderAll();
      if (manual) this.showToast('Quotes updated successfully', 'success');
    } catch (err) {
      console.warn('Error syncing quotes:', err);
      if (manual) this.showToast('Quote sync failed, using cached values', 'error');
    } finally {
      if (manual) {
        const btn = document.getElementById('btnRefreshQuotes');
        btn.textContent = '🔄 Refresh';
        btn.disabled = false;
      }
    }
  }

  getBasePriceForSymbol(symbol) {
    const defaults = {
      'RELIANCE.NS': 1305.20,
      'RELIANCE.BO': 1305.30,
      'TCS.NS': 2290.50,
      'INFY.NS': 1128.90,
      'HDFCBANK.NS': 726.15,
      'ITC.BO': 267.40,
      'SBIN.BO': 1034.00,
      'NVDA': 128.40,
      'AAPL': 225.80,
      'MSFT': 445.10,
      'TSLA': 218.60
    };
    return defaults[symbol] || (symbol.endsWith('.NS') || symbol.endsWith('.BO') ? 850.00 : 150.00);
  }

  getCompanyNameForSymbol(symbol) {
    const names = {
      'RELIANCE.NS': 'Reliance Industries Ltd.',
      'RELIANCE.BO': 'Reliance Industries Ltd. (BSE)',
      'TCS.NS': 'Tata Consultancy Services',
      'INFY.NS': 'Infosys Limited',
      'HDFCBANK.NS': 'HDFC Bank Limited',
      'ITC.BO': 'ITC Limited (BSE)',
      'SBIN.BO': 'State Bank of India (BSE)',
      'NVDA': 'NVIDIA Corporation',
      'AAPL': 'Apple Inc.',
      'MSFT': 'Microsoft Corporation',
      'TSLA': 'Tesla, Inc.'
    };
    return names[symbol] || `${symbol}`;
  }

  generateMockHistory(currentPrice) {
    const points = [];
    let p = currentPrice * 0.92;
    for (let i = 30; i >= 0; i--) {
      p += (Math.random() - 0.48) * (currentPrice * 0.025);
      points.push(+Math.max(1, p).toFixed(2));
    }
    points[points.length - 1] = currentPrice;
    return points;
  }

  startAutoRefresh(intervalMs = 30000) {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (intervalMs > 0) {
      this.refreshTimer = setInterval(() => this.syncQuotes(false), intervalMs);
    }
  }

  // ----------------------------------------------------
  // Rendering & Dedicated P&L Boxes
  // ----------------------------------------------------
  renderAll() {
    this.renderKPIs();
    this.renderTabs();
    this.renderHoldingsTables();
    this.renderWatchlistTable();
    this.renderHistoryTable();
  }

  renderTabs() {
    const indianCount = this.holdings.filter(h => this.isIndianHolding(h)).length;
    const globalCount = this.holdings.filter(h => !this.isIndianHolding(h)).length;

    document.getElementById('tabBadgeIndian').textContent = indianCount;
    document.getElementById('tabBadgeGlobal').textContent = globalCount;
    document.getElementById('tabBadgeWatchlist').textContent = this.watchlist.length;
    document.getElementById('tabBadgeHistory').textContent = this.tradeHistory.length;
  }

  renderKPIs() {
    let indianInvested = 0;
    let indianValue = 0;
    let indianCount = 0;

    let globalInvested = 0;
    let globalValue = 0;
    let globalCount = 0;

    this.holdings.forEach(h => {
      const q = this.quotes[h.symbol] || { price: h.buyPrice, currency: h.currency || 'INR' };
      const invested = h.buyPrice * h.quantity;
      const currVal = q.price * h.quantity;

      if (this.isIndianHolding(h)) {
        indianInvested += invested;
        indianValue += currVal;
        indianCount++;
      } else {
        globalInvested += invested;
        globalValue += currVal;
        globalCount++;
      }
    });

    // Indian P&L (in ₹ INR)
    const indianPnl = indianValue - indianInvested;
    const indianPct = indianInvested > 0 ? (indianPnl / indianInvested) * 100 : 0;

    const indPnlEl = document.getElementById('kpiIndianPnl');
    indPnlEl.textContent = `${indianPnl >= 0 ? '+' : ''}${this.formatCurrency(indianPnl, 'INR')}`;
    indPnlEl.className = `kpi-value ${indianPnl >= 0 ? 'text-gain' : 'text-loss'}`;

    const indSubEl = document.getElementById('kpiIndianSub');
    indSubEl.textContent = `Invested: ${this.formatCurrency(indianInvested, 'INR')} (${indianPct >= 0 ? '+' : ''}${indianPct.toFixed(2)}%)`;
    indSubEl.className = `kpi-subtext ${indianPnl >= 0 ? 'text-gain' : 'text-loss'}`;
    document.getElementById('kpiIndianCountBadge').textContent = `${indianCount} stock${indianCount === 1 ? '' : 's'}`;

    // Global P&L (in $ USD)
    const globalPnl = globalValue - globalInvested;
    const globalPct = globalInvested > 0 ? (globalPnl / globalInvested) * 100 : 0;

    const globPnlEl = document.getElementById('kpiGlobalPnl');
    globPnlEl.textContent = `${globalPnl >= 0 ? '+' : ''}${this.formatCurrency(globalPnl, 'USD')}`;
    globPnlEl.className = `kpi-value ${globalPnl >= 0 ? 'text-gain' : 'text-loss'}`;

    const globSubEl = document.getElementById('kpiGlobalSub');
    globSubEl.textContent = `Invested: ${this.formatCurrency(globalInvested, 'USD')} (${globalPct >= 0 ? '+' : ''}${globalPct.toFixed(2)}%)`;
    globSubEl.className = `kpi-subtext ${globalPnl >= 0 ? 'text-gain' : 'text-loss'}`;
    document.getElementById('kpiGlobalCountBadge').textContent = `${globalCount} stock${globalCount === 1 ? '' : 's'}`;

    // Realized Closed Trades
    let totalRealizedPnlInINR = 0;
    let winCount = 0;
    this.tradeHistory.forEach(th => {
      const thCurr = th.currency || 'INR';
      let pnlNorm = th.realizedPnl;
      if (thCurr === 'USD') pnlNorm *= this.usdInrRate;

      totalRealizedPnlInINR += pnlNorm;
      if (th.realizedPnl > 0) winCount++;
    });
    const winRate = this.tradeHistory.length > 0 ? ((winCount / this.tradeHistory.length) * 100).toFixed(0) : 0;

    const realEl = document.getElementById('kpiRealizedPnl');
    realEl.textContent = `${totalRealizedPnlInINR >= 0 ? '+' : ''}${this.formatCurrency(totalRealizedPnlInINR, 'INR')}`;
    realEl.className = `kpi-value ${totalRealizedPnlInINR >= 0 ? 'text-gain' : 'text-loss'}`;
    document.getElementById('kpiWinRate').textContent = `${this.tradeHistory.length} closed trades (${winRate}% win rate)`;

    // Shared Purchasing Power (Unified Buying Power)
    const usdEquiv = (this.cashBalance / this.usdInrRate);
    document.getElementById('kpiCashBalance').textContent = this.formatCurrency(this.cashBalance, 'INR');
    const cashSubEl = document.getElementById('kpiCashSub');
    if (cashSubEl) {
      cashSubEl.textContent = `Shared (~${this.formatCurrency(usdEquiv, 'USD')})`;
    }
  }

  renderHoldingsTables() {
    const indianHoldings = this.holdings.filter(h => this.isIndianHolding(h));
    const globalHoldings = this.holdings.filter(h => !this.isIndianHolding(h));

    // Render Indian Table
    const indianTbody = document.getElementById('indianHoldingsTableBody');
    const indianEmpty = document.getElementById('indianHoldingsEmptyState');

    if (indianHoldings.length === 0) {
      indianTbody.innerHTML = '';
      indianEmpty.style.display = 'block';
    } else {
      indianEmpty.style.display = 'none';
      indianTbody.innerHTML = indianHoldings.map(h => this.renderHoldingRowHtml(h, 'INR')).join('');
    }

    // Render Global Table
    const globalTbody = document.getElementById('globalHoldingsTableBody');
    const globalEmpty = document.getElementById('globalHoldingsEmptyState');

    if (globalHoldings.length === 0) {
      globalTbody.innerHTML = '';
      globalEmpty.style.display = 'block';
    } else {
      globalEmpty.style.display = 'none';
      globalTbody.innerHTML = globalHoldings.map(h => this.renderHoldingRowHtml(h, 'USD')).join('');
    }
  }

  renderHoldingRowHtml(h, holdingCurr) {
    const q = this.quotes[h.symbol] || {
      price: h.buyPrice,
      prevPrice: h.buyPrice,
      change: 0,
      changePct: 0,
      name: h.name || h.symbol,
      currency: holdingCurr,
      exchange: h.exchange || (holdingCurr === 'INR' ? 'NSE' : 'US'),
      history30d: []
    };

    const invested = h.buyPrice * h.quantity;
    const currVal = q.price * h.quantity;
    const pnl = currVal - invested;
    const returnPct = invested > 0 ? (pnl / invested) * 100 : 0;
    const isGain = pnl >= 0;

    let flashClass = '';
    if (q.prevPrice && q.price !== q.prevPrice) {
      flashClass = q.price > q.prevPrice ? 'flash-up' : 'flash-down';
    }

    const sparklineSvg = this.generateSparklineSvg(q.history30d, isGain);
    const exchBadge = this.getExchangeBadgeHtml(h.symbol, h.exchange || q.exchange);

    return `
      <tr data-id="${h.id}">
        <td class="cell-center">
          <button class="star-toggle ${h.isWatched ? 'starred' : ''}" 
            onclick="window.sheetApp.toggleWatchlistHolding('${h.id}')" 
            title="${h.isWatched ? 'Starred in Watchlist' : 'Star to Watchlist'}">
            ${h.isWatched ? '⭐' : '☆'}
          </button>
        </td>
        <td>
          <div style="display: flex; align-items: center;">
            <strong style="color: var(--accent-blue); font-family: var(--font-mono); font-size: 0.92rem;">${h.symbol}</strong>
            ${exchBadge}
          </div>
        </td>
        <td class="cell-right cell-editable">
          <input type="number" step="0.01" value="${h.buyPrice.toFixed(2)}" 
            onchange="window.sheetApp.updateHoldingCell('${h.id}', 'buyPrice', this.value)" 
            title="Click to edit Buy Price" />
        </td>
        <td class="cell-right cell-editable">
          <input type="number" step="0.01" value="${h.quantity}" 
            onchange="window.sheetApp.updateHoldingCell('${h.id}', 'quantity', this.value)" 
            title="Click to edit Shares" />
        </td>
        <td class="cell-right cell-mono">${this.formatCurrency(invested, holdingCurr)}</td>
        <td class="cell-right cell-mono ${flashClass}">
          <strong>${this.formatCurrency(q.price, holdingCurr)}</strong>
        </td>
        <td class="cell-right">
          <span class="badge-pnl ${isGain ? 'gain' : 'loss'}">
            ${isGain ? '+' : ''}${this.formatCurrency(pnl, holdingCurr)}
          </span>
        </td>
        <td class="cell-right cell-mono ${isGain ? 'text-gain' : 'text-loss'}" style="font-weight: 600;">
          ${isGain ? '+' : ''}${returnPct.toFixed(2)}%
        </td>
        <td class="cell-center sparkline-cell">
          ${sparklineSvg}
        </td>
        <td class="cell-center">
          <div style="display: flex; gap: 4px; justify-content: center;">
            <button class="btn btn-secondary btn-sm" onclick="window.sheetApp.openBuyModal('${h.symbol}')" title="Buy more shares">➕</button>
            <button class="btn btn-success btn-sm" onclick="window.sheetApp.openSellModal('${h.id}')" title="Sell / Close position">Sell</button>
            <button class="btn btn-secondary btn-sm" onclick="window.sheetApp.deleteHolding('${h.id}')" title="Remove row">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }

  renderWatchlistTable() {
    const tbody = document.getElementById('watchlistTableBody');
    const emptyState = document.getElementById('watchlistEmptyState');

    if (this.watchlist.length === 0) {
      tbody.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }
    emptyState.style.display = 'none';

    tbody.innerHTML = this.watchlist.map(w => {
      const isIndian = this.isIndianHolding(w);
      const wCurr = isIndian ? 'INR' : 'USD';
      const q = this.quotes[w.symbol] || {
        price: isIndian ? 1000 : 150,
        changePct: 0,
        high52: isIndian ? 1200 : 180,
        low52: isIndian ? 800 : 120,
        name: w.name || w.symbol,
        currency: wCurr,
        exchange: w.exchange || (isIndian ? 'NSE' : 'US'),
        history30d: []
      };

      const isDayGain = (q.changePct || 0) >= 0;
      const target = w.targetPrice || q.price;
      const distancePct = target > 0 ? ((q.price - target) / target) * 100 : 0;
      const isTargetTriggered = q.price <= target;

      const low = q.low52 || (q.price * 0.75);
      const high = q.high52 || (q.price * 1.25);
      const range = high - low;
      const pctPos = range > 0 ? Math.min(100, Math.max(0, ((q.price - low) / range) * 100)) : 50;

      const sparklineSvg = this.generateSparklineSvg(q.history30d, isDayGain);
      const exchBadge = this.getExchangeBadgeHtml(w.symbol, w.exchange || q.exchange);

      return `
        <tr data-id="${w.id}">
          <td class="cell-center">
            <button class="star-toggle starred" onclick="window.sheetApp.removeWatchlist('${w.id}')" title="Remove from Watchlist">⭐</button>
          </td>
          <td>
            <div style="display: flex; align-items: center;">
              <strong style="color: var(--accent-blue); font-family: var(--font-mono); font-size: 0.92rem;">${w.symbol}</strong>
              ${exchBadge}
            </div>
          </td>
          <td style="color: var(--text-secondary);">${q.name || w.name || w.symbol}</td>
          <td class="cell-right cell-mono">
            <strong>${this.formatCurrency(q.price, wCurr)}</strong>
          </td>
          <td class="cell-right cell-mono ${isDayGain ? 'text-gain' : 'text-loss'}">
            ${isDayGain ? '▲' : '▼'} ${Math.abs(q.changePct || 0).toFixed(2)}%
          </td>
          <td class="cell-right cell-editable">
            <input type="number" step="0.01" value="${target.toFixed(2)}" 
              onchange="window.sheetApp.updateWatchlistTarget('${w.id}', this.value)" 
              title="Click to edit Target Buy Price" />
          </td>
          <td class="cell-right cell-mono">
            <span class="badge-pnl ${isTargetTriggered ? 'gain' : 'loss'}" style="font-size: 0.72rem;">
              ${isTargetTriggered ? '🎯 Target Hit!' : `${distancePct.toFixed(1)}% above`}
            </span>
          </td>
          <td class="cell-center">
            <div class="range-bar-container">
              <div class="range-bar-track">
                <div class="range-bar-fill" style="width: ${pctPos}%;"></div>
              </div>
              <div class="range-bar-labels">
                <span>${this.formatCompactCurrency(low, wCurr)}</span>
                <span>${this.formatCompactCurrency(high, wCurr)}</span>
              </div>
            </div>
          </td>
          <td class="cell-center sparkline-cell">
            ${sparklineSvg}
          </td>
          <td class="cell-center">
            <div style="display: flex; gap: 4px; justify-content: center;">
              <button class="btn btn-primary btn-sm" onclick="window.sheetApp.openBuyModal('${w.symbol}')">⚡ Quick Buy</button>
              <button class="btn btn-secondary btn-sm" onclick="window.sheetApp.removeWatchlist('${w.id}')">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  renderHistoryTable() {
    const tbody = document.getElementById('historyTableBody');
    const emptyState = document.getElementById('historyEmptyState');

    if (this.tradeHistory.length === 0) {
      tbody.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }
    emptyState.style.display = 'none';

    tbody.innerHTML = this.tradeHistory.map(th => {
      const isGain = th.realizedPnl >= 0;
      const thCurr = th.currency || (this.isIndianHolding(th) ? 'INR' : 'USD');
      const exchBadge = this.getExchangeBadgeHtml(th.symbol, th.exchange);

      return `
        <tr data-id="${th.id}">
          <td>
            <div style="display: flex; align-items: center;">
              <strong style="color: var(--accent-blue); font-family: var(--font-mono);">${th.symbol}</strong>
              ${exchBadge}
            </div>
          </td>
          <td>
            <span class="badge" style="background: var(--bg-tertiary); font-size: 0.72rem; padding: 2px 6px; border-radius: 4px;">
              CLOSED
            </span>
          </td>
          <td class="cell-right cell-mono">${th.quantity}</td>
          <td class="cell-right cell-mono">${this.formatCurrency(th.buyPrice, thCurr)}</td>
          <td class="cell-right cell-mono">${this.formatCurrency(th.sellPrice, thCurr)}</td>
          <td class="cell-right cell-mono">${this.formatCurrency(th.costBasis, thCurr)}</td>
          <td class="cell-right cell-mono">${this.formatCurrency(th.grossProceeds, thCurr)}</td>
          <td class="cell-right">
            <span class="badge-pnl ${isGain ? 'gain' : 'loss'}">
              ${isGain ? '+' : ''}${this.formatCurrency(th.realizedPnl, thCurr)}
            </span>
          </td>
          <td class="cell-right cell-mono ${isGain ? 'text-gain' : 'text-loss'}" style="font-weight: 600;">
            ${isGain ? '+' : ''}${th.roi.toFixed(2)}%
          </td>
          <td style="color: var(--text-secondary); font-size: 0.8rem;">${th.buyDate || '-'}</td>
          <td style="color: var(--text-secondary); font-size: 0.8rem;">${th.sellDate || '-'}</td>
          <td class="cell-right cell-mono" style="color: var(--text-muted);">${th.holdingDays}d</td>
        </tr>
      `;
    }).join('');
  }

  // ----------------------------------------------------
  // Sparkline Chart SVG Generator
  // ----------------------------------------------------
  generateSparklineSvg(points, isGain) {
    if (!points || points.length < 2) {
      return `<div style="color: var(--text-muted); font-size: 0.72rem;">No data</div>`;
    }

    const width = 130;
    const height = 26;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = (max - min) || 1;

    const coords = points.map((val, idx) => {
      const x = (idx / (points.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const pathD = `M ${coords.join(' L ')}`;
    const areaD = `${pathD} L ${width},${height} L 0,${height} Z`;
    const colorClass = isGain ? 'gain' : 'loss';

    return `
      <svg class="sparkline-svg" viewBox="0 0 ${width} ${height}">
        <path class="sparkline-area ${colorClass}" d="${areaD}" />
        <path class="sparkline-path ${colorClass}" d="${pathD}" />
      </svg>
    `;
  }

  // ----------------------------------------------------
  // Position & Trade Operations (Shared Purchasing Power)
  // ----------------------------------------------------
  openBuyModal(prefillSymbol = '', defaultExchange = null) {
    const symbolInput = document.getElementById('buySymbol');
    const priceInput = document.getElementById('buyPrice');
    const qtyInput = document.getElementById('buyQty');
    const dateInput = document.getElementById('buyDate');
    const exchSelect = document.getElementById('buyExchange');
    const currSpan = document.getElementById('modalBuyPriceCurrency');

    symbolInput.value = prefillSymbol;
    qtyInput.value = '100';
    dateInput.value = new Date().toISOString().split('T')[0];

    if (defaultExchange) {
      exchSelect.value = defaultExchange;
    } else if (prefillSymbol.endsWith('.NS')) {
      exchSelect.value = 'NSE';
    } else if (prefillSymbol.endsWith('.BO')) {
      exchSelect.value = 'BSE';
    } else if (prefillSymbol) {
      exchSelect.value = 'US';
    } else if (this.activeTab === 'active-global') {
      exchSelect.value = 'US';
    } else {
      exchSelect.value = 'NSE';
    }

    currSpan.textContent = exchSelect.value === 'US' ? '$' : '₹';

    if (prefillSymbol && this.quotes[prefillSymbol]) {
      priceInput.value = this.quotes[prefillSymbol].price;
    } else {
      priceInput.value = '';
    }

    const evt = new Event('input');
    priceInput.dispatchEvent(evt);

    document.getElementById('buyModal').classList.add('active');
    symbolInput.focus();
  }

  async fetchQuoteForBuyModal() {
    const rawSym = document.getElementById('buySymbol').value.trim().toUpperCase();
    const exch = document.getElementById('buyExchange').value;
    if (!rawSym) return;

    const sym = this.formatSymbolWithExchange(rawSym, exch);
    document.getElementById('buySymbol').value = sym;

    if (this.quotes[sym]) {
      document.getElementById('buyPrice').value = this.quotes[sym].price;
    } else {
      const p = this.getBasePriceForSymbol(sym);
      document.getElementById('buyPrice').value = p;
    }

    const evt = new Event('input');
    document.getElementById('buyPrice').dispatchEvent(evt);
    this.showToast(`Fetched quote for ${sym}`, 'success');
  }

  handleBuySubmit(e) {
    e.preventDefault();
    const rawSym = document.getElementById('buySymbol').value.trim().toUpperCase();
    const exch = document.getElementById('buyExchange').value;
    const symbol = this.formatSymbolWithExchange(rawSym, exch);
    const buyPrice = parseFloat(document.getElementById('buyPrice').value);
    const quantity = parseFloat(document.getElementById('buyQty').value);
    const buyDate = document.getElementById('buyDate').value || new Date().toISOString().split('T')[0];

    if (!symbol || isNaN(buyPrice) || isNaN(quantity) || buyPrice <= 0 || quantity <= 0) {
      this.showToast('Please enter valid positive numbers for price and shares', 'error');
      return;
    }

    const curr = this.getTickerCurrency(symbol);
    const totalCost = buyPrice * quantity;
    // Shared purchasing power in INR
    const costInINR = curr === 'INR' ? totalCost : (totalCost * this.usdInrRate);

    const performBuy = () => {
      this.cashBalance -= costInINR;

      const existing = this.holdings.find(h => h.symbol === symbol);
      if (existing) {
        const totalShares = existing.quantity + quantity;
        const avgPrice = ((existing.buyPrice * existing.quantity) + (buyPrice * quantity)) / totalShares;
        existing.quantity = totalShares;
        existing.buyPrice = +avgPrice.toFixed(2);
        this.showToast(`Added ${quantity} shares to existing ${symbol} (Avg Price: ${this.formatCurrency(avgPrice, curr)})`, 'success');
      } else {
        let resolvedExch = 'NSE';
        if (symbol.endsWith('.BO')) resolvedExch = 'BSE';
        else if (curr === 'USD' || !symbol.includes('.')) resolvedExch = 'US';

        this.holdings.unshift({
          id: `h_${Date.now()}`,
          symbol: symbol,
          name: this.getCompanyNameForSymbol(symbol),
          currency: curr,
          exchange: resolvedExch,
          buyPrice: buyPrice,
          quantity: quantity,
          buyDate: buyDate,
          isWatched: false,
          targetPrice: +(buyPrice * 1.15).toFixed(2)
        });
        this.showToast(`Bought ${quantity} shares of ${symbol} at ${this.formatCurrency(buyPrice, curr)}`, 'success');
      }

      this.closeModals();
      this.saveState();
      this.syncQuotes();
    };

    if (costInINR > this.cashBalance) {
      this.showWarningModal({
        title: '⚠️ Insufficient Cash Margin Warning',
        message: `Order total (${this.formatCurrency(totalCost, curr)} / ~${this.formatCurrency(costInINR, 'INR')}) exceeds your remaining buying power (${this.formatCurrency(this.cashBalance, 'INR')}).`,
        subtext: 'Do you wish to execute this order on margin paper trading mode?',
        confirmText: 'Execute on Margin',
        isDanger: false,
        onConfirm: performBuy
      });
    } else {
      performBuy();
    }
  }

  openSellModal(holdingId) {
    const holding = this.holdings.find(h => h.id === holdingId);
    if (!holding) return;

    const q = this.quotes[holding.symbol] || { price: holding.buyPrice };
    const curr = holding.currency || (this.isIndianHolding(holding) ? 'INR' : 'USD');

    document.getElementById('sellHoldingId').value = holding.id;
    document.getElementById('sellModalSymbol').textContent = `${holding.symbol} (${holding.exchange || 'NSE'})`;
    document.getElementById('sellModalOwnedQty').textContent = `${holding.quantity} shares`;
    document.getElementById('sellModalBuyPrice').textContent = this.formatCurrency(holding.buyPrice, curr);
    document.getElementById('modalSellPriceCurrency').textContent = curr === 'USD' ? '$' : '₹';

    document.getElementById('sellPrice').value = q.price;
    document.getElementById('sellQty').value = holding.quantity;
    document.getElementById('sellDate').value = new Date().toISOString().split('T')[0];

    const evt = new Event('input');
    document.getElementById('sellPrice').dispatchEvent(evt);

    document.getElementById('sellModal').classList.add('active');
  }

  handleSellSubmit(e) {
    e.preventDefault();
    const holdingId = document.getElementById('sellHoldingId').value;
    const holdingIndex = this.holdings.findIndex(h => h.id === holdingId);
    if (holdingIndex === -1) return;

    const holding = this.holdings[holdingIndex];
    const sellPrice = parseFloat(document.getElementById('sellPrice').value);
    const sellQty = parseFloat(document.getElementById('sellQty').value);
    const sellDate = document.getElementById('sellDate').value || new Date().toISOString().split('T')[0];
    const curr = holding.currency || (this.isIndianHolding(holding) ? 'INR' : 'USD');

    if (isNaN(sellPrice) || isNaN(sellQty) || sellPrice <= 0 || sellQty <= 0) {
      this.showToast('Please enter valid sell price and quantity', 'error');
      return;
    }

    if (sellQty > holding.quantity) {
      this.showToast(`Cannot sell more than owned shares (${holding.quantity})`, 'error');
      return;
    }

    const costBasis = holding.buyPrice * sellQty;
    const grossProceeds = sellPrice * sellQty;
    const realizedPnl = grossProceeds - costBasis;
    const roi = costBasis > 0 ? (realizedPnl / costBasis) * 100 : 0;

    const d1 = new Date(holding.buyDate || sellDate);
    const d2 = new Date(sellDate);
    const diffTime = Math.abs(d2 - d1);
    const holdingDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    // Return proceeds to unified shared buying power in INR
    const proceedsInINR = curr === 'INR' ? grossProceeds : (grossProceeds * this.usdInrRate);
    this.cashBalance += proceedsInINR;

    this.tradeHistory.unshift({
      id: `th_${Date.now()}`,
      symbol: holding.symbol,
      action: 'SELL_CLOSE',
      quantity: sellQty,
      currency: curr,
      exchange: holding.exchange || (curr === 'INR' ? 'NSE' : 'US'),
      buyPrice: holding.buyPrice,
      sellPrice: sellPrice,
      costBasis: costBasis,
      grossProceeds: grossProceeds,
      realizedPnl: realizedPnl,
      roi: roi,
      buyDate: holding.buyDate || sellDate,
      sellDate: sellDate,
      holdingDays: holdingDays
    });

    if (sellQty >= holding.quantity) {
      this.holdings.splice(holdingIndex, 1);
    } else {
      holding.quantity -= sellQty;
    }

    this.closeModals();
    this.saveState();
    this.showToast(`Executed sell for ${sellQty} ${holding.symbol} (P&L: ${realizedPnl >= 0 ? '+' : ''}${this.formatCurrency(realizedPnl, curr)})`, 'success');
  }

  updateHoldingCell(holdingId, field, value) {
    const holding = this.holdings.find(h => h.id === holdingId);
    if (!holding) return;

    const num = parseFloat(value);
    if (isNaN(num) || num <= 0) {
      this.showToast('Value must be a positive number', 'error');
      this.renderHoldingsTables();
      return;
    }

    holding[field] = num;
    this.saveState();
    this.showToast(`Updated ${holding.symbol} ${field} to ${num}`, 'success');
  }

  deleteHolding(holdingId) {
    const holding = this.holdings.find(h => h.id === holdingId);
    if (!holding) return;

    this.showWarningModal({
      title: `⚠️ Remove ${holding.symbol}?`,
      message: `Are you sure you want to remove ${holding.symbol} from your active holdings?`,
      subtext: 'This row will be deleted without logging a closed trade.',
      confirmText: 'Remove Position',
      isDanger: true,
      onConfirm: () => {
        this.holdings = this.holdings.filter(h => h.id !== holdingId);
        this.saveState();
        this.showToast(`Removed ${holding.symbol} from portfolio`, 'success');
      }
    });
  }

  // ----------------------------------------------------
  // Watchlist Operations
  // ----------------------------------------------------
  toggleWatchlistHolding(holdingId) {
    const holding = this.holdings.find(h => h.id === holdingId);
    if (!holding) return;

    holding.isWatched = !holding.isWatched;

    if (holding.isWatched) {
      if (!this.watchlist.some(w => w.symbol === holding.symbol)) {
        this.watchlist.push({
          id: `w_${Date.now()}`,
          symbol: holding.symbol,
          name: holding.name || holding.symbol,
          currency: holding.currency || (this.isIndianHolding(holding) ? 'INR' : 'USD'),
          exchange: holding.exchange || (this.isIndianHolding(holding) ? 'NSE' : 'US'),
          targetPrice: holding.targetPrice || +(holding.buyPrice * 0.95).toFixed(2),
          isWatched: true
        });
      }
      this.showToast(`Added ${holding.symbol} to Watchlist sheet`, 'success');
    } else {
      this.watchlist = this.watchlist.filter(w => w.symbol !== holding.symbol);
      this.showToast(`Removed ${holding.symbol} from Watchlist sheet`, 'success');
    }

    this.saveState();
  }

  promptAddWatchlist() {
    const sym = prompt('Enter Stock Ticker to Watch (e.g. RELIANCE, TCS.NS, ITC.BO, NVDA, AAPL):');
    if (!sym) return;

    const cleanSym = this.formatSymbolWithExchange(sym.trim().toUpperCase(), 'AUTO');
    if (this.watchlist.some(w => w.symbol === cleanSym)) {
      this.showToast(`${cleanSym} is already on your watchlist`, 'error');
      return;
    }

    const currentPrice = this.getBasePriceForSymbol(cleanSym);
    const curr = this.getTickerCurrency(cleanSym);

    this.watchlist.push({
      id: `w_${Date.now()}`,
      symbol: cleanSym,
      name: this.getCompanyNameForSymbol(cleanSym),
      currency: curr,
      exchange: cleanSym.endsWith('.BO') ? 'BSE' : (cleanSym.endsWith('.NS') ? 'NSE' : 'US'),
      targetPrice: +(currentPrice * 0.95).toFixed(2),
      isWatched: true
    });

    this.saveState();
    this.syncQuotes();
    this.showToast(`Added ${cleanSym} to Watchlist`, 'success');
  }

  updateWatchlistTarget(watchlistId, value) {
    const item = this.watchlist.find(w => w.id === watchlistId);
    if (!item) return;

    const target = parseFloat(value);
    if (isNaN(target) || target <= 0) return;

    item.targetPrice = target;
    this.saveState();
    this.showToast(`Updated target price for ${item.symbol} to ${this.formatCurrency(target, item.currency)}`, 'success');
  }

  removeWatchlist(watchlistId) {
    const item = this.watchlist.find(w => w.id === watchlistId);
    if (!item) return;

    this.watchlist = this.watchlist.filter(w => w.id !== watchlistId);
    const h = this.holdings.find(h => h.symbol === item.symbol);
    if (h) h.isWatched = false;

    this.saveState();
    this.showToast(`Removed ${item.symbol} from Watchlist`, 'success');
  }

  // ----------------------------------------------------
  // Utility & Helper Methods
  // ----------------------------------------------------
  closeModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    this.pendingConfirmCallback = null;
  }

  formatCurrency(num, currency = this.displayCurrency) {
    const locale = currency === 'INR' ? 'en-IN' : 'en-US';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency || 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(num || 0);
  }

  formatCompactCurrency(num, currency = this.displayCurrency) {
    const sym = currency === 'INR' ? '₹' : '$';
    return `${sym}${Math.round(num)}`;
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
      <span>${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      setTimeout(() => toast.remove(), 250);
    }, 3500);
  }

  exportCSV() {
    let csv = 'Sheet,Symbol,Exchange,Currency,Buy Price,Shares,Invested,Live Price,Current Value,Unrealized PnL,Return %,Target Price\n';
    
    this.holdings.forEach(h => {
      const q = this.quotes[h.symbol] || { price: h.buyPrice };
      const invested = h.buyPrice * h.quantity;
      const currVal = q.price * h.quantity;
      const pnl = currVal - invested;
      const roi = invested > 0 ? (pnl / invested) * 100 : 0;
      const sheetName = this.isIndianHolding(h) ? 'IndianHoldings' : 'GlobalHoldings';
      csv += `${sheetName},"${h.symbol}","${h.exchange || 'NSE'}","${h.currency || 'INR'}",${h.buyPrice},${h.quantity},${invested.toFixed(2)},${q.price.toFixed(2)},${currVal.toFixed(2)},${pnl.toFixed(2)},${roi.toFixed(2)}%,\n`;
    });

    this.tradeHistory.forEach(th => {
      csv += `TradeHistory,"${th.symbol}","${th.exchange || 'NSE'}","${th.currency || 'INR'}",${th.buyPrice},${th.quantity},${th.costBasis.toFixed(2)},${th.sellPrice.toFixed(2)},${th.grossProceeds.toFixed(2)},${th.realizedPnl.toFixed(2)},${th.roi.toFixed(2)}%,\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `SheetTrader_Portfolio_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    this.showToast('Portfolio exported to CSV', 'success');
  }
}

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  window.sheetApp = new SpreadsheetApp();
});
