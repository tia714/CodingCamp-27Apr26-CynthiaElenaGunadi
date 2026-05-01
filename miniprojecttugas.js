// Apply saved theme immediately to prevent flash of wrong theme on load
(function () {
      try {
        var t = localStorage.getItem('ebv_theme');
        if (t === 'dark' || t === 'light') {
          document.documentElement.setAttribute('data-theme', t);
        }
      } catch (e) { /* localStorage unavailable — keep default */ }
    })();

(function () {
      'use strict';

      /* ========================================
         Default Categories
         ======================================== */

      const DEFAULT_CATEGORIES = [
        'Food',
        'Transport',
        'Entertainment',
        'Health',
        'Shopping',
        'Other',
      ];

      /* ========================================
         AppState — in-memory singleton
         ======================================== */

      const AppState = {
        transactions: [],       // Transaction[]
        categories: [],         // string[]
        theme: 'light',         // 'light' | 'dark'
        sortKey: 'date',        // 'date' | 'amount-asc' | 'amount-desc' | 'category'
        storageUnavailable: false,
      };

      /* ========================================
         Storage module
         ======================================== */

      const Storage = {
        KEYS: {
          TRANSACTIONS: 'ebv_transactions',
          CATEGORIES:   'ebv_categories',
          THEME:        'ebv_theme',
        },

        /**
         * Reads all three localStorage keys and populates AppState.
         * Falls back to defaults on missing or malformed data.
         * Emits console.warn on JSON parse errors.
         * Sets AppState.storageUnavailable if localStorage is inaccessible.
         */
        load() {
          // Test localStorage availability first
          try {
            localStorage.setItem('__ebv_test__', '1');
            localStorage.removeItem('__ebv_test__');
          } catch (e) {
            AppState.storageUnavailable = true;
            AppState.categories = DEFAULT_CATEGORIES.slice();
            return;
          }

          // Load transactions
          try {
            const raw = localStorage.getItem(Storage.KEYS.TRANSACTIONS);
            if (raw !== null) {
              AppState.transactions = JSON.parse(raw);
            } else {
              AppState.transactions = [];
            }
          } catch (e) {
            console.warn('[Storage] Failed to parse transactions from localStorage:', e);
            AppState.transactions = [];
          }

          // Load categories
          try {
            const raw = localStorage.getItem(Storage.KEYS.CATEGORIES);
            if (raw !== null) {
              const parsed = JSON.parse(raw);
              AppState.categories = Array.isArray(parsed) && parsed.length > 0
                ? parsed
                : DEFAULT_CATEGORIES.slice();
            } else {
              AppState.categories = DEFAULT_CATEGORIES.slice();
            }
          } catch (e) {
            console.warn('[Storage] Failed to parse categories from localStorage:', e);
            AppState.categories = DEFAULT_CATEGORIES.slice();
          }

          // Load theme
          try {
            const raw = localStorage.getItem(Storage.KEYS.THEME);
            if (raw === 'light' || raw === 'dark') {
              AppState.theme = raw;
            } else {
              AppState.theme = 'light';
            }
          } catch (e) {
            console.warn('[Storage] Failed to read theme from localStorage:', e);
            AppState.theme = 'light';
          }
        },

        /**
         * Writes all three AppState keys to localStorage.
         */
        save() {
          Storage.saveTransactions();
          Storage.saveCategories();
          Storage.saveTheme();
        },

        /**
         * Persists only the transactions array.
         */
        saveTransactions() {
          if (AppState.storageUnavailable) return;
          try {
            localStorage.setItem(
              Storage.KEYS.TRANSACTIONS,
              JSON.stringify(AppState.transactions)
            );
          } catch (e) {
            console.warn('[Storage] Failed to save transactions:', e);
          }
        },

        /**
         * Persists only the categories array.
         */
        saveCategories() {
          if (AppState.storageUnavailable) return;
          try {
            localStorage.setItem(
              Storage.KEYS.CATEGORIES,
              JSON.stringify(AppState.categories)
            );
          } catch (e) {
            console.warn('[Storage] Failed to save categories:', e);
          }
        },

        /**
         * Persists only the theme value.
         */
        saveTheme() {
          if (AppState.storageUnavailable) return;
          try {
            localStorage.setItem(Storage.KEYS.THEME, AppState.theme);
          } catch (e) {
            console.warn('[Storage] Failed to save theme:', e);
          }
        },
      };

      /* ========================================
         generateId — unique ID for transactions
         ======================================== */

      /**
       * Returns a unique string ID.
       * Uses crypto.randomUUID() when available, falls back to Date.now().toString().
       * @returns {string}
       */
      /**
       * Formats a number as Indonesian Rupiah style:
       * no decimals, periods as thousand separators.
       * e.g. 1500000 → "Rp 1.500.000"
       * @param {number} amount
       * @returns {string}
       */
      function formatRupiah(amount) {
        const rounded = Math.round(amount);
        const formatted = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        return 'Rp ' + formatted;
      }

      function generateId() {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
          return crypto.randomUUID();
        }
        return Date.now().toString();
      }

      /* ========================================
         computeSummary — financial totals
         ======================================== */

      /**
       * Computes balance, total income, and total expense from a transaction array.
       * Pure function — no side effects.
       * @param {Array} transactions
       * @returns {{ balance: number, totalIncome: number, totalExpense: number }}
       */
      function computeSummary(transactions) {
        let totalIncome = 0;
        let totalExpense = 0;

        for (const tx of transactions) {
          if (tx.type === 'income') {
            totalIncome += tx.amount;
          } else if (tx.type === 'expense') {
            totalExpense += tx.amount;
          }
        }

        return {
          balance: totalIncome - totalExpense,
          totalIncome,
          totalExpense,
        };
      }

      /* ========================================
         validateTransaction — form field validation
         ======================================== */

      /**
       * Validates transaction form fields.
       * Pure function — no side effects, no DOM access.
       * @param {{ description: string, amount: string|number, type: string, category: string, date: string }} fields
       * @returns {{ valid: boolean, errors: { description?: string, amount?: string, type?: string, category?: string, date?: string } }}
       */
      function validateTransaction(fields) {
        const errors = {};

        // Description: must be non-empty and non-whitespace
        if (!fields.description || fields.description.trim() === '') {
          errors.description = 'Description is required.';
        }

        // Amount: must be a positive number
        const amount = parseFloat(fields.amount);
        if (fields.amount === '' || fields.amount === null || fields.amount === undefined ||
            isNaN(amount) || amount <= 0) {
          errors.amount = 'Amount must be a positive number.';
        }

        // Type: must be 'income' or 'expense'
        if (fields.type !== 'income' && fields.type !== 'expense') {
          errors.type = 'Please select a type (income or expense).';
        }

        // Category: must be non-empty and must exist in AppState.categories
        if (!fields.category || fields.category.trim() === '') {
          errors.category = 'Please select a category.';
        } else if (!AppState.categories.includes(fields.category)) {
          errors.category = 'Please select a category.';
        }

        // Date: must be non-empty
        if (!fields.date || fields.date.trim() === '') {
          errors.date = 'Please enter a date.';
        }

        return {
          valid: Object.keys(errors).length === 0,
          errors,
        };
      }

      /* ========================================
         validateCategory — category name validation
         ======================================== */

      /**
       * Validates a new category name against an existing list.
       * Pure function — no side effects.
       * @param {string} name - The proposed category name.
       * @param {string[]} existing - The current list of category names.
       * @returns {{ valid: boolean, error: string }}
       */
      function validateCategory(name, existing) {
        // Must be non-empty (after trimming)
        if (!name || name.trim() === '') {
          return { valid: false, error: 'Category name cannot be empty.' };
        }

        // Must not already exist (case-insensitive)
        const nameLower = name.trim().toLowerCase();
        const isDuplicate = existing.some(
          (cat) => cat.toLowerCase() === nameLower
        );
        if (isDuplicate) {
          return { valid: false, error: 'Category already exists.' };
        }

        return { valid: true, error: '' };
      }

      /* ========================================
         sortTransactions — sort a transaction list
         ======================================== */

      /**
       * Returns a new sorted copy of the transaction array.
       * Pure function — does not mutate the input array.
       * @param {Array} list - Array of transaction objects.
       * @param {'date'|'amount-asc'|'amount-desc'|'category'} key - Sort key.
       * @returns {Array}
       */
      function sortTransactions(list, key) {
        const sorted = list.slice(); // shallow copy to avoid mutation

        switch (key) {
          case 'date':
            // Descending by createdAt (most recent first)
            sorted.sort((a, b) => b.createdAt - a.createdAt);
            break;

          case 'amount-asc':
            sorted.sort((a, b) => a.amount - b.amount);
            break;

          case 'amount-desc':
            sorted.sort((a, b) => b.amount - a.amount);
            break;

          case 'category':
            // Alphabetical by category name
            sorted.sort((a, b) => a.category.localeCompare(b.category));
            break;

          default:
            // Unknown key: return copy unsorted
            break;
        }

        return sorted;
      }

      /* ========================================
         computeChartData — spending by category
         ======================================== */

      /**
       * Derives chart data from a transaction array.
       * Filters to expense transactions only, groups by category,
       * computes totals and percentages, and sorts descending by total.
       * Pure function — no side effects.
       * @param {Array} transactions
       * @returns {Array<{ category: string, total: number, percentage: number }>}
       */
      function computeChartData(transactions) {
        // Filter to expense transactions only
        const expenses = transactions.filter((tx) => tx.type === 'expense');

        if (expenses.length === 0) {
          return [];
        }

        // Group by category and sum amounts
        const totalsMap = {};
        for (const tx of expenses) {
          if (totalsMap[tx.category] === undefined) {
            totalsMap[tx.category] = 0;
          }
          totalsMap[tx.category] += tx.amount;
        }

        // Compute grand total for percentage calculation
        const grandTotal = Object.values(totalsMap).reduce((sum, v) => sum + v, 0);

        // Build result array with percentages
        const result = Object.entries(totalsMap).map(([category, total]) => ({
          category,
          total,
          percentage: grandTotal > 0 ? (total / grandTotal) * 100 : 0,
        }));

        // Sort descending by total
        result.sort((a, b) => b.total - a.total);

        return result;
      }

      /* ========================================
         renderSummary — update summary cards
         ======================================== */

      /**
       * Reads computeSummary(AppState.transactions) and updates the three
       * summary card DOM elements: #balance, #total-income, #total-expense.
       */
      function renderSummary() {
        const { balance, totalIncome, totalExpense } = computeSummary(AppState.transactions);

        const balanceEl     = document.getElementById('balance');
        const incomeEl      = document.getElementById('total-income');
        const expenseEl     = document.getElementById('total-expense');

        if (balanceEl)  balanceEl.textContent  = formatRupiah(balance);
        if (incomeEl)   incomeEl.textContent   = formatRupiah(totalIncome);
        if (expenseEl)  expenseEl.textContent  = formatRupiah(totalExpense);
      }

      /* ========================================
         renderCategoryOptions — populate category <select>
         ======================================== */

      /**
       * Clears and repopulates the category <select id="category"> from
       * AppState.categories.
       */
      function renderCategoryOptions() {
        const select = document.getElementById('category');
        if (!select) return;

        // Preserve current selection if possible
        const currentValue = select.value;

        // Clear all existing options
        select.innerHTML = '';

        // Add the default placeholder option
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = '-- Select a category --';
        select.appendChild(placeholder);

        // Add one option per category
        for (const cat of AppState.categories) {
          const option = document.createElement('option');
          option.value = cat;
          option.textContent = cat;
          select.appendChild(option);
        }

        // Restore previous selection if it still exists
        if (currentValue && AppState.categories.includes(currentValue)) {
          select.value = currentValue;
        }
      }

      /* ========================================
         renderEmptyState — show/hide empty-state message
         ======================================== */

      /**
       * Shows the empty-state paragraph (#empty-state) when there are no
       * transactions, and hides it otherwise.
       */
      function renderEmptyState() {
        const emptyState = document.getElementById('empty-state');
        if (!emptyState) return;

        if (AppState.transactions.length === 0) {
          emptyState.style.display = '';   // visible (default block/inline)
        } else {
          emptyState.style.display = 'none';
        }
      }

      /* ========================================
         renderTransactionList — build the transaction <ul>
         ======================================== */

      /**
       * Sorts AppState.transactions by AppState.sortKey, then builds <li>
       * elements for each transaction and appends them to #transaction-list.
       * Each item shows: description, signed amount, category badge, date,
       * and a delete button.  Also calls renderEmptyState().
       */
      function renderTransactionList() {
        const list = document.getElementById('transaction-list');
        if (!list) return;

        // Clear existing items
        list.innerHTML = '';

        const sorted = sortTransactions(AppState.transactions, AppState.sortKey);

        for (const tx of sorted) {
          const li = document.createElement('li');
          li.className = 'transaction-item ' + tx.type;
          li.setAttribute('data-id', tx.id);

          // Sign prefix: + for income, - for expense
          const sign = tx.type === 'income' ? '+' : '-';
          const formattedAmount = sign + formatRupiah(tx.amount);

          li.innerHTML =
            '<span class="tx-description">' + escapeHtml(tx.description) + '</span>' +
            '<span class="tx-amount ' + escapeHtml(tx.type) + '">' + formattedAmount + '</span>' +
            '<span class="tx-category">' + escapeHtml(tx.category) + '</span>' +
            '<span class="tx-date">' + escapeHtml(tx.date) + '</span>' +
            '<button class="btn-delete" type="button" aria-label="Delete transaction" data-id="' + escapeHtml(tx.id) + '"><i class="fa-solid fa-trash-can" style="color:#ffffff;"></i></button>';

          list.appendChild(li);
        }

        renderEmptyState();
      }

      /**
       * Minimal HTML escaping to prevent XSS when inserting user-provided
       * strings via innerHTML.
       * @param {string} str
       * @returns {string}
       */
      function escapeHtml(str) {
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      /* ========================================
         renderChart — draw pie chart on canvas
         ======================================== */

      /**
       * Color palette for pie chart slices (cycles by category index).
       */
      const CHART_COLORS = [
        '#0061d7ff', '#00c053ff', '#d77300ff', '#e00000ff',
        '#a347ffff', '#ff55b2ff', '#00dfebff', '#85de00ff',
        '#ffd415ff', '#03136eff', '#b8006bff',
      ];

      /**
       * Draws a pie chart on <canvas id="chart-canvas"> using the Canvas 2D API.
       * If there is no expense data, shows #chart-placeholder and hides the canvas.
       * Each slice is labeled with "CategoryName (XX.X%)".
       * Falls back to a text message if the canvas context is unavailable.
       */
      function renderChart() {
        const canvas      = document.getElementById('chart-canvas');
        const placeholder = document.getElementById('chart-placeholder');
        const chartData   = computeChartData(AppState.transactions);

        // No expense data — show placeholder, hide canvas
        if (chartData.length === 0) {
          if (canvas)      canvas.style.display      = 'none';
          if (placeholder) placeholder.style.display = '';
          return;
        }

        // We have data — hide placeholder, show canvas
        if (placeholder) placeholder.style.display = 'none';
        if (!canvas) return;
        canvas.style.display = '';

        // Attempt to get 2D context
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          // Fallback: replace canvas with a text message
          canvas.insertAdjacentText('afterend', 'Chart not supported in this browser.');
          canvas.style.display = 'none';
          return;
        }

        const width  = canvas.width;
        const height = canvas.height;

        // Clear previous drawing
        ctx.clearRect(0, 0, width, height);

        // Layout: pie on the left half, legend on the right half
        const cx = width * 0.35;          // pie centre x
        const cy = height / 2;            // pie centre y
        const radius = Math.min(cx, cy) * 0.85;

        let startAngle = -Math.PI / 2;    // start at 12 o'clock

        // Draw slices
        for (let i = 0; i < chartData.length; i++) {
          const slice      = chartData[i];
          const sliceAngle = (slice.percentage / 100) * 2 * Math.PI;
          const color      = CHART_COLORS[i % CHART_COLORS.length];

          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle);
          ctx.closePath();
          ctx.fillStyle = color;
          ctx.fill();

          // Thin white border between slices for clarity
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.stroke();

          startAngle += sliceAngle;
        }

        // Draw legend on the right side
        const legendX     = width * 0.7;
        const legendStartY = cy - (chartData.length * 22) / 2;
        const swatchSize  = 14;
        const lineHeight  = 22;

        ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.textBaseline = 'middle';

        for (let i = 0; i < chartData.length; i++) {
          const slice = chartData[i];
          const color = CHART_COLORS[i % CHART_COLORS.length];
          const y     = legendStartY + i * lineHeight;

          // Color swatch
          ctx.fillStyle = color;
          ctx.fillRect(legendX, y - swatchSize / 2, swatchSize, swatchSize);

          // Label: "CategoryName (XX.X%)"
          const pct   = slice.percentage.toFixed(1);
          const label = slice.category + ' (' + pct + '%)';
          ctx.fillStyle = getComputedStyle(document.documentElement)
            .getPropertyValue('#000000ff').trim() || '#1a1a1a';
          ctx.fillText(label, legendX + swatchSize + 6, y);
        }
      }

      /* ========================================
         Controller Functions
         ======================================== */

      /**
       * Handles the "Add Transaction" form submission.
       * Validates fields, creates a Transaction, updates state, persists, and re-renders.
       * @param {Event} event
       */
      function handleAddTransaction(event) {
        event.preventDefault();

        // Read form field values
        const descEl     = document.getElementById('desc');
        const amountEl   = document.getElementById('amount');
        const typeEl     = document.querySelector('input[name="type"]:checked');
        const categoryEl = document.getElementById('category');
        const dateEl     = document.getElementById('date');

        const fields = {
          description: descEl     ? descEl.value     : '',
          amount:      amountEl   ? amountEl.value   : '',
          type:        typeEl     ? typeEl.value      : '',
          category:    categoryEl ? categoryEl.value : '',
          date:        dateEl     ? dateEl.value      : '',
        };

        // Validate
        const { valid, errors } = validateTransaction(fields);

        // Display / clear error messages
        const errorFields = ['description', 'amount', 'type', 'category', 'date'];
        const errorIds    = {
          description: 'desc-error',
          amount:      'amount-error',
          type:        'type-error',
          category:    'category-error',
          date:        'date-error',
        };

        for (const field of errorFields) {
          const el = document.getElementById(errorIds[field]);
          if (el) {
            el.textContent = errors[field] || '';
          }
        }

        if (!valid) return;

        // Build Transaction object
        const transaction = {
          id:          generateId(),
          description: fields.description.trim(),
          amount:      parseFloat(fields.amount),
          type:        fields.type,
          category:    fields.category,
          date:        fields.date,
          createdAt:   Date.now(),
        };

        // Update state and persist
        AppState.transactions.push(transaction);
        Storage.saveTransactions();

        // Re-render
        renderSummary();
        renderTransactionList();
        renderChart();

        // Clear the form
        if (descEl)     descEl.value     = '';
        if (amountEl)   amountEl.value   = '';
        // Uncheck all type radio buttons
        document.querySelectorAll('input[name="type"]').forEach(function (radio) {
          radio.checked = false;
        });
        // Reset category select to first (placeholder) option
        if (categoryEl) categoryEl.selectedIndex = 0;
        if (dateEl)     dateEl.value     = '';
        // Clear all error messages
        for (const field of errorFields) {
          const el = document.getElementById(errorIds[field]);
          if (el) el.textContent = '';
        }
      }

      /**
       * Removes a transaction by id, persists, and re-renders.
       * @param {string} id
       */
      function handleDeleteTransaction(id) {
        const confirmdelete = confirm("Are you sure you want to delete this task?");
        if (!confirmdelete) return;
        AppState.transactions = AppState.transactions.filter(function (tx) {
          return tx.id !== id;
        });
        Storage.saveTransactions();

        renderSummary();
        renderTransactionList();
        renderChart();
      }

      /**
       * Updates the active sort key and re-renders the transaction list.
       * @param {string} value
       */
      function handleSortChange(value) {
        AppState.sortKey = value;
        renderTransactionList();
      }

      /**
       * Handles the "Add Category" form submission.
       * Validates the name, adds to state, persists, and re-renders category options.
       * @param {Event} event
       */
      function handleAddCategory(event) {
        event.preventDefault();

        const catInputEl = document.getElementById('cat-input');
        const catErrorEl = document.getElementById('cat-error');
        const name = catInputEl ? catInputEl.value : '';

        const { valid, error } = validateCategory(name, AppState.categories);

        if (catErrorEl) {
          catErrorEl.textContent = error || '';
        }

        if (!valid) return;

        // Add trimmed name to categories, persist, and re-render
        AppState.categories.push(name.trim());
        Storage.saveCategories();
        renderCategoryOptions();

        // Clear the input
        if (catInputEl) catInputEl.value = '';
        if (catErrorEl) catErrorEl.textContent = '';
      }

      /**
       * Toggles the app theme between 'light' and 'dark', persists, and
       * updates the theme toggle button label and icon.
       */
      function handleThemeToggle() {
        AppState.theme = AppState.theme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', AppState.theme);
        Storage.saveTheme();

        // Update button label and icon
        const iconEl  = document.querySelector('#theme-toggle .theme-toggle-icon');
        const labelEl = document.querySelector('#theme-toggle .theme-toggle-label');

        if (AppState.theme === 'dark') {
          if (iconEl)  iconEl.textContent  = '☀️';
          if (labelEl) labelEl.textContent = 'Light Mode';
        } else {
          if (iconEl)  iconEl.textContent  = '🌙';
          if (labelEl) labelEl.textContent = 'Dark Mode';
        }
      }

      /* ========================================
         Event Wiring
         ======================================== */

      // Transaction form submit
      var transactionForm = document.getElementById('transaction-form');
      if (transactionForm) {
        transactionForm.addEventListener('submit', handleAddTransaction);
      }

      // Category form submit
      var categoryForm = document.getElementById('category-form');
      if (categoryForm) {
        categoryForm.addEventListener('submit', handleAddCategory);
      }

      // Sort select change
      var sortSelect = document.getElementById('sort-select');
      if (sortSelect) {
        sortSelect.addEventListener('change', function (event) {
          handleSortChange(event.target.value);
        });
      }

      // Theme toggle click
      var themeToggleBtn = document.getElementById('theme-toggle');
      if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', handleThemeToggle);
      }

      // Event delegation on #transaction-list for delete button clicks
      var transactionList = document.getElementById('transaction-list');
      if (transactionList) {
        transactionList.addEventListener('click', function (event) {
          const btn = event.target.closest('.btn-delete');
          if (btn && btn.dataset.id) {
            handleDeleteTransaction(btn.dataset.id);
          }
        });
      }

      /* ========================================
         init — page initialization
         ======================================== */

      /**
       * Initialises the application on page load.
       * 1. Loads persisted state from localStorage into AppState.
       * 2. Applies the saved theme immediately (before any render) to avoid
       *    a flash of the wrong theme.
       * 3. Syncs the theme toggle button label/icon to the loaded theme.
       * 4. Calls all render functions to build the initial UI.
       * 5. Shows the storage-unavailable banner if localStorage is blocked.
       */
      function init() {
        // 1. Populate AppState from localStorage (or fall back to defaults)
        Storage.load();

        // 2. Apply theme attribute immediately — before any render calls —
        //    so CSS custom properties are correct on first paint.
        document.documentElement.setAttribute('data-theme', AppState.theme);

        // 3. Sync theme toggle button to the loaded theme (without toggling)
        var iconEl  = document.querySelector('#theme-toggle .theme-toggle-icon');
        var labelEl = document.querySelector('#theme-toggle .theme-toggle-label');
        if (AppState.theme === 'dark') {
          if (iconEl)  iconEl.textContent  = '☀️';
          if (labelEl) labelEl.textContent = 'Light Mode';
        } else {
          if (iconEl)  iconEl.textContent  = '🌙';
          if (labelEl) labelEl.textContent = 'Dark Mode';
        }

        // 4. Render all UI components
        renderSummary();
        renderCategoryOptions();
        renderTransactionList();
        renderChart();
        renderEmptyState();

        // 5. Show storage-unavailable banner if localStorage is inaccessible
        if (AppState.storageUnavailable) {
          var banner = document.getElementById('storage-banner');
          if (banner) {
            banner.removeAttribute('hidden');
          }
        }
      }

      // Kick off the application
      init();

    })();