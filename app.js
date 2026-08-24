/**
 * SheetTrader Pro - Interactive Spreadsheet Engine & Multi-Exchange Client
 * Supports NSE (.NS), BSE (.BO), and US/Global Markets
 * Features: Automatic Cloud Sync across PC & Mobile Devices
 */

class SpreadsheetApp {
  constructor() {
    this.storageKey = 'sheet_trader_portfolio_v3';
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
    this.activeTab = 'active-holdings';
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
  // State Persistence & Cloud Synchronization
  // ----------------------------------------------------
  loadLocalState() {
    const saved = localStorage.getItem(this.storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        this.displayCurrency = parsed.displayCurrency || 'INR';
        this.cashBalance = parsed.cashBalance ?? (this.displayCurrency === 'INR' ? this.defaultCashINR : this.defaultCashUSD);
        this.holdings = parsed.holdings || [];
        this.watchlist = parsed.watchlist || [];
        this.tradeHistory = parsed.tradeHistory || [];
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
        if (serverData && (serverData.holdings?.length > 0 || serverData.watchlist?.length > 0 || serverData.tradeHistory?.length > 0 || serverData.cashBalance !== undefined)) {
          this.displayCurrency = serverData.displayCurrency || this.displayCurrency;
          this.cashBalance = serverData.cashBalance ?? this.cashBalance;
          this.holdings = serverData.holdings || [];
          this.watchlist = serverData.watchlist || [];
          this.tradeHistory = serverData.tradeHistory || [];
          
          localStorage.setItem(this.storageKey, JSON.stringify(serverData));
          this.updateCurrencyUI();
          this.renderAll();
          console.log('[Sync] Synced latest portfolio state from server');
        } else if (this.holdings.length > 0) {
          // If server is empty but client has data, upload client data to server
          this.pushStateToServer();
        }
      }
    } catch (e) {
      console.warn('[Sync] Could not fetch server portfolio:', e);
    }
  }

  saveState() {
    const data = {
      displayCurrency: this.displayCurrency,
      cashBalance: this.cashBalance,
      holdings: this.holdings,
      watchlist: this.watchlist,
      tradeHistory: this.tradeHistory,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(this.storageKey, JSON.stringify(data));
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
      updatedAt: new Date().toISOString()
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
    this.saveState();
  }

  loadDemoData() {
    this.displayCurrency = 'INR';
    this.cashBalance = 85000000.00;
    
    this.holdings = [
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
      }
    ];

    this.watchlist = [
      { id: 'w_1', symbol: 'INFY.NS', name: 'Infosys Limited', currency: 'INR', exchange: 'NSE', targetPrice: 1100.00, isWatched: true },
      { id: 'w_2', symbol: 'SBIN.BO', name: 'State Bank of India (BSE)', currency: 'INR', exchange: 'BSE', targetPrice: 980.00, isWatched: true },
      { id: 'w_3', symbol: 'AAPL', name: 'Apple Inc.', currency: 'USD', exchange: 'NASDAQ', targetPrice: 215.00, isWatched: true }
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
    this.showToast('Demo portfolio loaded with NSE/BSE stocks', 'success');
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
      this.cashBalance = +(this.cashBalance / this.usdInrRate).toFixed(2);
    } else {
      this.displayCurrency = 'INR';
      this.cashBalance = +(this.cashBalance * this.usdInrRate).toFixed(2);
    }
    this.updateCurrencyUI();
    this.saveState();
    this.showToast(`Switched display currency to ${this.displayCurrency === 'INR' ? '₹ INR' : '$ USD'}`, 'success');
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
      this.openBuyModal();
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
        message: 'Are you sure you want to load Demo Data? This will overwrite your current active holdings and trade ledger with sample NSE/BSE stock positions.',
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
          this.openBuyModal(resolved);
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
        this.openBuyModal(resolved);
        input.value = '';
      }
    });

    document.getElementById('buyExchange').addEventListener('change', (e) => {
      const symInput = document.getElementById('buySymbol');
      const val = symInput.value.trim().toUpperCase();
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
      const curr = this.getTickerCurrency(document.getElementById('buySymbol').value.trim().toUpperCase());
      document.getElementById('modalTotalInvested').textContent = this.formatCurrency(total, curr);
      
      const totalInDisplayCurr = curr === this.displayCurrency ? total : 
        (curr === 'USD' ? total * this.usdInrRate : total / this.usdInrRate);
      const remaining = this.cashBalance - totalInDisplayCurr;
      const remainingEl = document.getElementById('modalCashRemaining');
      remainingEl.textContent = this.formatCurrency(remaining, this.displayCurrency);
      remainingEl.style.color = remaining < 0 ? 'var(--loss-red)' : 'var(--text-primary)';
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
        // Sync portfolio data from server
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
  // Rendering & Dynamic Formula Calculations
  // ----------------------------------------------------
  renderAll() {
    this.renderKPIs();
    this.renderTabs();
    this.renderHoldingsTable();
    this.renderWatchlistTable();
    this.renderHistoryTable();
  }

  renderTabs() {
    document.getElementById('tabBadgeHoldings').textContent = this.holdings.length;
    document.getElementById('tabBadgeWatchlist').textContent = this.watchlist.length;
    document.getElementById('tabBadgeHistory').textContent = this.tradeHistory.length;
  }

  renderKPIs() {
    let totalInvestedInDisplayCurr = 0;
    let totalCurrentValueInDisplayCurr = 0;

    this.holdings.forEach(h => {
      const q = this.quotes[h.symbol] || { price: h.buyPrice, currency: h.currency || 'INR' };
      const holdingCurr = h.currency || q.currency || 'INR';
      
      const invested = h.buyPrice * h.quantity;
      const currVal = q.price * h.quantity;

      let investedNormalized = invested;
      let currValNormalized = currVal;

      if (this.displayCurrency === 'INR' && holdingCurr === 'USD') {
        investedNormalized *= this.usdInrRate;
        currValNormalized *= this.usdInrRate;
      } else if (this.displayCurrency === 'USD' && holdingCurr === 'INR') {
        investedNormalized /= this.usdInrRate;
        currValNormalized /= this.usdInrRate;
      }

      totalInvestedInDisplayCurr += investedNormalized;
      totalCurrentValueInDisplayCurr += currValNormalized;
    });

    const unrealizedPnl = totalCurrentValueInDisplayCurr - totalInvestedInDisplayCurr;
    const unrealizedPct = totalInvestedInDisplayCurr > 0 ? (unrealizedPnl / totalInvestedInDisplayCurr) * 100 : 0;

    const netWorth = this.cashBalance + totalCurrentValueInDisplayCurr;
    const baseDefaultCash = this.displayCurrency === 'INR' ? this.defaultCashINR : this.defaultCashUSD;
    const allTimePnl = (netWorth - baseDefaultCash);
    const allTimePct = (allTimePnl / baseDefaultCash) * 100;

    let totalRealizedPnlInDisplayCurr = 0;
    let winCount = 0;
    this.tradeHistory.forEach(th => {
      const thCurr = th.currency || 'INR';
      let pnlNorm = th.realizedPnl;
      if (this.displayCurrency === 'INR' && thCurr === 'USD') pnlNorm *= this.usdInrRate;
      else if (this.displayCurrency === 'USD' && thCurr === 'INR') pnlNorm /= this.usdInrRate;

      totalRealizedPnlInDisplayCurr += pnlNorm;
      if (th.realizedPnl > 0) winCount++;
    });
    const winRate = this.tradeHistory.length > 0 ? ((winCount / this.tradeHistory.length) * 100).toFixed(0) : 0;

    // Update DOM
    document.getElementById('kpiNetWorth').textContent = this.formatCurrency(netWorth, this.displayCurrency);
    const netSub = document.getElementById('kpiNetWorthSub');
    netSub.textContent = `${allTimePnl >= 0 ? '+' : ''}${this.formatCurrency(allTimePnl, this.displayCurrency)} (${allTimePct.toFixed(2)}%) all-time`;
    netSub.className = `kpi-subtext ${allTimePnl >= 0 ? 'text-gain' : 'text-loss'}`;

    document.getElementById('kpiInvested').textContent = this.formatCurrency(totalInvestedInDisplayCurr, this.displayCurrency);
    document.getElementById('kpiHoldingsCount').textContent = `${this.holdings.length} open position${this.holdings.length === 1 ? '' : 's'}`;

    const unPnlEl = document.getElementById('kpiUnrealizedPnl');
    unPnlEl.textContent = `${unrealizedPnl >= 0 ? '+' : ''}${this.formatCurrency(unrealizedPnl, this.displayCurrency)}`;
    unPnlEl.className = `kpi-value ${unrealizedPnl >= 0 ? 'text-gain' : 'text-loss'}`;

    const unPctEl = document.getElementById('kpiUnrealizedPct');
    unPctEl.textContent = `${unrealizedPct >= 0 ? '+' : ''}${unrealizedPct.toFixed(2)}% return`;
    unPctEl.className = `kpi-subtext ${unrealizedPct >= 0 ? 'text-gain' : 'text-loss'}`;

    const realEl = document.getElementById('kpiRealizedPnl');
    realEl.textContent = `${totalRealizedPnlInDisplayCurr >= 0 ? '+' : ''}${this.formatCurrency(totalRealizedPnlInDisplayCurr, this.displayCurrency)}`;
    realEl.className = `kpi-value ${totalRealizedPnlInDisplayCurr >= 0 ? 'text-gain' : 'text-loss'}`;

    document.getElementById('kpiWinRate').textContent = `${this.tradeHistory.length} closed trades (${winRate}% win rate)`;
    document.getElementById('kpiCashBalance').textContent = this.formatCurrency(this.cashBalance, this.displayCurrency);
  }

  renderHoldingsTable() {
    const tbody = document.getElementById('holdingsTableBody');
    const emptyState = document.getElementById('holdingsEmptyState');

    if (this.holdings.length === 0) {
      tbody.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }
    emptyState.style.display = 'none';

    tbody.innerHTML = this.holdings.map(h => {
      const q = this.quotes[h.symbol] || {
        price: h.buyPrice,
        prevPrice: h.buyPrice,
        change: 0,
        changePct: 0,
        name: h.name || h.symbol,
        currency: h.currency || 'INR',
        exchange: h.exchange || 'NSE',
        history30d: []
      };

      const holdingCurr = h.currency || q.currency || 'INR';
      const invested = h.buyPrice * h.quantity;
      const currVal = q.price * h.quantity;
      const pnl = currVal - invested;
      const returnPct = invested > 0 ? (pnl / invested) * 100 : 0;
      const isGain = pnl >= 0;
      const isDayGain = (q.changePct || 0) >= 0;

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
          <td style="color: var(--text-secondary); max-width: 170px; overflow: hidden; text-overflow: ellipsis;">
            ${q.name || h.name || h.symbol}
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
          <td class="cell-right cell-mono">${this.formatCurrency(currVal, holdingCurr)}</td>
          <td class="cell-right cell-mono ${isDayGain ? 'text-gain' : 'text-loss'}">
            ${isDayGain ? '▲' : '▼'} ${Math.abs(q.changePct || 0).toFixed(2)}%
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
    }).join('');
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
      const q = this.quotes[w.symbol] || {
        price: 1000,
        changePct: 0,
        high52: 1200,
        low52: 800,
        name: w.name || w.symbol,
        currency: w.currency || 'INR',
        exchange: w.exchange || 'NSE',
        history30d: []
      };

      const wCurr = w.currency || q.currency || 'INR';
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
      const thCurr = th.currency || 'INR';
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
  // Position & Trade Operations
  // ----------------------------------------------------
  openBuyModal(prefillSymbol = '') {
    const symbolInput = document.getElementById('buySymbol');
    const priceInput = document.getElementById('buyPrice');
    const qtyInput = document.getElementById('buyQty');
    const dateInput = document.getElementById('buyDate');
    const exchSelect = document.getElementById('buyExchange');

    symbolInput.value = prefillSymbol;
    qtyInput.value = '100';
    dateInput.value = new Date().toISOString().split('T')[0];

    if (prefillSymbol.endsWith('.NS')) exchSelect.value = 'NSE';
    else if (prefillSymbol.endsWith('.BO')) exchSelect.value = 'BSE';
    else if (prefillSymbol) exchSelect.value = 'US';
    else exchSelect.value = 'NSE';

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
    const totalInDisplayCurr = curr === this.displayCurrency ? totalCost : 
      (curr === 'USD' ? totalCost * this.usdInrRate : totalCost / this.usdInrRate);

    const performBuy = () => {
      this.cashBalance -= totalInDisplayCurr;

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
        else if (!symbol.includes('.')) resolvedExch = 'US';

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

    if (totalInDisplayCurr > this.cashBalance) {
      this.showWarningModal({
        title: '⚠️ Insufficient Cash Margin Warning',
        message: `Order total (${this.formatCurrency(totalCost, curr)}) exceeds your remaining buying power (${this.formatCurrency(this.cashBalance, this.displayCurrency)}).`,
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
    const curr = holding.currency || 'INR';

    document.getElementById('sellHoldingId').value = holding.id;
    document.getElementById('sellModalSymbol').textContent = `${holding.symbol} (${holding.exchange || 'NSE'})`;
    document.getElementById('sellModalOwnedQty').textContent = `${holding.quantity} shares`;
    document.getElementById('sellModalBuyPrice').textContent = this.formatCurrency(holding.buyPrice, curr);

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
    const curr = holding.currency || 'INR';

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

    const proceedsInDisplayCurr = curr === this.displayCurrency ? grossProceeds : 
      (curr === 'USD' ? grossProceeds * this.usdInrRate : grossProceeds / this.usdInrRate);
    this.cashBalance += proceedsInDisplayCurr;

    this.tradeHistory.unshift({
      id: `th_${Date.now()}`,
      symbol: holding.symbol,
      action: 'SELL_CLOSE',
      quantity: sellQty,
      currency: curr,
      exchange: holding.exchange || 'NSE',
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
      this.renderHoldingsTable();
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
          currency: holding.currency || 'INR',
          exchange: holding.exchange || 'NSE',
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
    const sym = prompt('Enter Stock Ticker to Watch (e.g. RELIANCE.NS, TCS.NS, ITC.BO, NVDA):');
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
    let csv = 'Sheet,Symbol,Exchange,Company,Buy Price,Shares,Invested,Live Price,Current Value,Unrealized PnL,Return %,Target Price\n';
    
    this.holdings.forEach(h => {
      const q = this.quotes[h.symbol] || { price: h.buyPrice };
      const invested = h.buyPrice * h.quantity;
      const currVal = q.price * h.quantity;
      const pnl = currVal - invested;
      const roi = invested > 0 ? (pnl / invested) * 100 : 0;
      csv += `Holdings,"${h.symbol}","${h.exchange || 'NSE'}","${h.name || h.symbol}",${h.buyPrice},${h.quantity},${invested.toFixed(2)},${q.price.toFixed(2)},${currVal.toFixed(2)},${pnl.toFixed(2)},${roi.toFixed(2)}%,\n`;
    });

    this.tradeHistory.forEach(th => {
      csv += `TradeHistory,"${th.symbol}","${th.exchange || 'NSE'}",Closed Trade,${th.buyPrice},${th.quantity},${th.costBasis.toFixed(2)},${th.sellPrice.toFixed(2)},${th.grossProceeds.toFixed(2)},${th.realizedPnl.toFixed(2)},${th.roi.toFixed(2)}%,\n`;
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
