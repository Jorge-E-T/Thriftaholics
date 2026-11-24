/* =========================================================
   Guide tab — a complete, searchable tutorial with a live
   setup checklist and "Show me" spotlights into the app.
   ========================================================= */
(function (global) {
  'use strict';
  const esc = (s) => U.esc(s);
  const Guide = {};

  /* ---------- tiny building blocks for illustrations ---------- */
  const k = (t) => `<kbd>${t}</kbd>`;
  const b = (t, cls = '') => `<span class="g-btn ${cls}">${t}</span>`;
  const chip = (t, c) => `<span class="g-chip" style="--c:${c}">${t}</span>`;
  const badge = (t, cls) => `<span class="badge ${cls}">${t}</span>`;
  const go = (view, spot, label = 'Show me') => `<button type="button" class="g-go" data-go="${view}"${spot ? ` data-spot="${spot}"` : ''}>${label} <span aria-hidden="true">→</span></button>`;

  /* ---------- content ---------- */
  const CH = [
    {
      id: 'start', icon: '🚀', color: '#2a7a70', title: 'Getting started',
      lead: 'Five minutes to a safe, ready-to-use shop. Your data lives encrypted in this browser — nothing is shared unless you turn on cloud sync.',
      blocks: [
        { t: 'steps', h: 'Your first visit', items: [
          ['Create your app password', 'The first screen asks for a password and to type it again. It locks <b>everything</b> — items, photos, sales and settings are encrypted with it. Pick something you will remember; nobody (not even the developer) can read your data without it.'],
          ['Add a password hint', `Settings → Security → <b>Password hint</b>. It shows on the lock screen after a wrong try. Write a reminder, never the password itself. ${go('settings', '#setHint')}`],
          ['Set up reset questions', `Settings → Security → <b>Set up reset questions</b>. If you ever forget the password, answering them lets you choose a new one without losing data. ${go('settings', '#btnRecNew')}`],
          ['Bring in your inventory', 'Import the spreadsheet, a backup or another program’s data — see <a href="#g-import">Bringing in your inventory</a>.'],
          ['Make a first backup', `Click ${b('⬇ Backup')} at the top. Keep the file somewhere safe (a USB stick, Google Drive, e-mail to yourself). ${go('dashboard', '#btnExportJson')}`]
        ] },
        { t: 'grid', h: 'Locking and unlocking', items: [
          ['🔒', 'Lock now', 'The padlock in the top bar locks the app instantly — handy on a shared computer.'],
          ['⏱️', 'Auto-lock', 'Settings → Security → <b>Auto-lock after inactivity</b>. 0 means never.'],
          ['💡', 'Forgot it?', 'On the lock screen, click <b>Forgot password?</b> and answer your reset questions. Your hint appears after a wrong try.'],
          ['🧭', 'Each browser is separate', 'Chrome, Safari and each phone keep their own copy. Use a backup or cloud sync to move data between them.']
        ] },
        { t: 'steps', h: 'Install it like a phone app', items: [
          ['iPhone / iPad', 'Open the site in <b>Safari</b> → tap the Share button → <b>Add to Home Screen</b>.'],
          ['Android', 'Open it in <b>Chrome</b> → ⋮ menu → <b>Install app</b> (or <b>Add to Home screen</b>).'],
          ['Computer', 'In Chrome or Edge, click the install icon at the right end of the address bar.'],
          ['Offline', 'Once installed, it opens without internet. Changes sync when you’re back online (if cloud sync is on).']
        ] },
        { t: 'note', kind: 'tip', html: 'The app saves every change instantly — there is no Save button for the tables. The top bar shows <b>All changes saved</b> when it’s done.' }
      ]
    },
    {
      id: 'tour', icon: '🧭', color: '#3f7fb5', title: 'A tour of the screen',
      lead: 'Everything starts from the top bar and the tabs under it.',
      blocks: [
        { t: 'mock' },
        { t: 'grid', h: 'The top bar', items: [
          ['🖼️', 'Logo slot', 'Click it to upload your logo (PNG works best). It appears on reports, labels, slips and cards.'],
          ['✍️', 'Name & tagline', 'Your business name and tagline. Change them in Settings → Business, or hide them if the logo already says it.'],
          ['💾', 'Save status', '<i>Saving…</i> then <i>All changes saved</i>.'],
          ['🌙', 'Light / dark', 'Switches the look. Settings → Business → Appearance has <b>Auto</b> (follow your device).'],
          ['⬇', 'Backup', 'Downloads a full JSON backup (optionally encrypted).'],
          ['⬆', 'Restore', 'Loads a backup — replace everything, or merge it in.'],
          ['📊', 'Excel Report', 'A formatted workbook with sales, costs, taxes and the whole inventory.'],
          ['☁', 'Sync pill', 'Shows cloud sync status: Off, Connecting…, Syncing…, Up to date, Offline. Click it to open sync settings.'],
          ['⌖', 'Scan', 'Opens the camera to read a QR label or barcode and jump to that item.'],
          ['🔒', 'Lock', 'Locks the app right away.'],
          ['↶', 'Undo / Redo', 'Always in the bottom-left corner, on every tab. It names the change it will undo; the little number shows how many steps you can go back.']
        ] },
        { t: 'grid', h: 'The tabs', items: [
          ['📈', 'Dashboard', 'How the business is doing at a glance.'],
          ['👗', 'Inventory', 'Every item you own or sold — the heart of the app.'],
          ['✅', 'Action Center', 'Today’s to-do list: delists, price drops, relists, decisions, taxes, backups.'],
          ['💰', 'Orders & Sales', 'Every sale with fees, profit and margin.'],
          ['🏪', 'Platforms', 'Fees for each site you sell on, plus a fee calculator.'],
          ['🧾', 'Expenses', 'Business costs and the mileage log.'],
          ['📑', 'Reports', 'Profit & loss, taxes, assets, Excel and PDF reports.'],
          ['⚙️', 'Settings', 'Your business, security, lists, taxes, plans, labels, sync and data tools.']
        ] }
      ]
    },
    {
      id: 'import', icon: '📥', color: '#6b6fa8', title: 'Bringing in your inventory',
      lead: 'Start from your spreadsheet, a backup, or another program — the app keeps a safety snapshot before every import.',
      blocks: [
        { t: 'cards', items: [
          ['📗', 'From the Excel spreadsheet', `Inventory → ${b('Import Excel')} → choose <b>Inventory.xlsx</b>. Rows are read straight from the original layout (Item Name, Category, SKU, prices, status, platform, dates, total after fees). Choose <b>Add new only</b> or <b>Replace inventory</b>.`, go('inventory', '#btnImportXlsx')],
          ['🗂️', 'From another program', `Inventory → ${b('Import JSON')}, or Settings → <b>Import from another program</b>. The app finds the records anywhere in the file, matches the old field names, reads money like “$1,234.50” and any date style, and imports photos. You review the mapping and a preview with totals <b>before</b> anything is saved. Re-importing updates matches instead of duplicating.`, go('inventory', '#btnImportOther')],
          ['💾', 'From a backup', `${b('⬆ Restore')} at the top. <b>Replace all</b> makes this browser an exact copy of the backup; <b>Merge</b> adds and updates records without removing any.`, go('dashboard', '#btnImportJson')],
          ['✍️', 'By hand', `Inventory → ${b('+ Add item', 'pri')}. Only the name is required — fill in the rest as you go.`, go('inventory', '#btnAddItem')]
        ] },
        { t: 'note', kind: 'good', html: 'Every import or restore saves a <b>safety snapshot</b> first (Settings → Safety snapshots). If something looks wrong, restore the snapshot and you’re back where you were.' }
      ]
    },
    {
      id: 'inventory', icon: '👗', color: '#c9952e', title: 'Working with inventory',
      lead: 'A spreadsheet-like grid that edits in place, with photos, colors, filters, three views and bulk actions.',
      blocks: [
        { t: 'steps', h: 'Editing like a spreadsheet', items: [
          ['Click any cell to edit it', `${k('Tab')} moves to the next cell, ${k('Enter')} saves, ${k('Esc')} cancels.`],
          ['Undo anything', `The <b>Undo</b> button in the bottom-left corner is always there — it shows what it will undo, like “edit price”. <b>Redo</b> next to it puts it back. Keyboard: ${k('Ctrl')} + ${k('Z')} to undo, ${k('Ctrl')} + ${k('Shift')} + ${k('Z')} (or ${k('Ctrl')} + ${k('Y')}) to redo — use ${k('⌘')} on a Mac.`],
          ['Edit every field at once', 'The ✎ button on a row opens the full editor: brand, size, color, condition, measurements, weight, location, source, purchase date, lowest acceptable price, listings and notes.'],
          ['Sort', 'Click a column header. <b>Shift</b> + click adds a second sort column.']
        ] },
        { t: 'colors' },
        { t: 'grid', h: 'Finding things', items: [
          ['🔎', 'Search', `Searches every text field — name, SKU, brand, notes, listings. ${go('inventory', '#invSearch', 'Try it')}`],
          ['🎚️', 'Filters', 'Status, category, platform and age (Fresh, Aging, Stale, Sold). <b>Clear</b> resets them.'],
          ['🧱', 'Columns', `Show or hide columns. Rarely used ones start hidden. ${go('inventory', '#btnColumns')}`],
          ['📷', 'Scan', 'Point the camera at a printed label to jump straight to that item.']
        ] },
        { t: 'views' },
        { t: 'grid', h: 'Photos', items: [
          ['🖱️', 'Add', 'Drag a picture onto any row, or click the photo placeholder. On a phone, “Take photo” opens the camera.'],
          ['🔍', 'View', 'Click a photo to see it full size, replace, download or remove it.'],
          ['🔐', 'Private', 'Photos are resized and encrypted like everything else, and included in backups.'],
          ['📊', 'In Excel', 'Settings → Data → <b>Include product photos in the Excel report</b>.']
        ] },
        { t: 'sheet' },
        { t: 'bulk' },
        { t: 'grid', h: 'Table window', items: [
          ['↕️', 'Height', 'Drag the bar under the table, or pick Fit screen, Small, Medium or Large.'],
          ['📏', 'Row size', 'Compact, Comfortable or Large.'],
          ['📌', 'Frozen columns', 'The checkbox, photo and name stay put while you scroll sideways.'],
          ['🧩', 'Item details', 'Brand, size, color, condition, measurements, weight, storage location, source, purchase date and lowest acceptable price.']
        ] }
      ]
    },
    {
      id: 'listings', icon: '🔗', color: '#8a5a9e', title: 'Cross-listing on several sites',
      lead: 'One item, many marketplaces. The Cross-list helper gets each listing ready to paste, tracks where everything is live, and reminds you to delist the moment it sells.',
      blocks: [
        { t: 'xlflow' },
        { t: 'note', kind: 'tip', html: 'Why cross-list? The same item is seen by different buyers on Poshmark, Depop, eBay and Mercari — more eyes usually means a faster sale. The catch is remembering to take it down everywhere else when it sells. The app handles that part for you.' },
        { t: 'steps', h: 'Before your first cross-list (once)', items: [
          ['Hide the sites you don’t use', `Platforms tab → <b>Hide</b> on each one you never sell on. The helper only shows the platforms you keep. ${go('platforms', '#platGrid')}`],
          ['Check each site’s details', 'Platforms → <b>Edit</b> → <i>Cross-listing helper</i>: the site’s “Sell an item” page, its title limit, description limit, how many hashtags to add, and whether it has a title field at all (Depop doesn’t). The common sites come filled in.'],
          ['Write your listing templates', `Settings → <b>Listing templates</b>. The title and description you write there, with placeholders like {brand} {size} {condition} {measurements}, become the starting text for every site. ${go('settings', '#tplTitle')}`],
          ['Fill in the item', 'Brand, size, color, condition and measurements make better listings — and each becomes a one-tap copy button in the helper.']
        ] },
        { t: 'steps', h: 'Cross-list an item', items: [
          ['Open the helper', `Any of these: the <b>share</b> icon on an inventory row, <b>Cross-list</b> in the item’s details, or tick several items and choose <b>Cross-list…</b> on the bottom bar to work through them one after another (<b>Next item →</b>). ${go('inventory', '#invWrap')}`],
          ['Pick a site', 'The chips across the top show every platform you use — ✓ means it’s already live there. The helper starts on the first site you haven’t listed on yet.'],
          ['Save the photo', '<b>Save photo</b> downloads it; on a phone, <b>Share / save to Photos</b> puts it in your camera roll so the marketplace app can pick it up.'],
          ['Open the site', '<b>Open … “sell” page</b> starts a new listing in another tab. Keep the Thriftaholics tab open to copy from.'],
          ['Copy, paste, repeat', 'Tap <b>Copy</b> next to the title, description and price, then paste each into the site. Brand, size, color, condition, measurements and SKU are copy buttons too, and <b>Copy everything at once</b> grabs it all. Edit any text first — changes apply to this listing only.'],
          ['Publish, then come back', 'Publish the listing on the site, copy its link, paste it into step 4 and tap <b>✓ Mark listed</b>. The item now shows that site’s chip, and the helper jumps to the next site you haven’t done.']
        ] },
        { t: 'grid', h: 'Made for each marketplace', items: [
          ['✂️', 'Title limits', 'Titles are trimmed at a word boundary to fit — for example 80 characters on eBay and 140 on Etsy. A counter turns red if you go over while editing.'],
          ['🏷️', 'Depop style', 'Depop has no title field, so the title goes at the top of the description, which is capped at 1,000 characters and ends with up to 5 hashtags built from the brand, category, color and name.'],
          ['💲', 'Fee-aware price', 'Each site shows what you’d keep after its fees. <b>Use $X to keep $Y</b> suggests the price that pays you your full list price there.'],
          ['🔗', 'Link check', 'Paste a Poshmark link while eBay is selected and the helper warns you, so a listing is never filed under the wrong site.'],
          ['📈', 'Progress bar', '“Listed on 3 of 5 sites” — see at a glance where each item still needs to go.'],
          ['✏️', 'Your rules', 'Every limit, hashtag count and sell-page link is editable per platform, so the helper keeps working when a site changes.']
        ] },
        { t: 'steps', h: 'When it sells — delisting', items: [
          ['Record the sale as usual', 'Mark it sold and choose the site it sold on. That site’s listing becomes <b>Sold</b>.'],
          ['The delist checklist opens', 'It lists every other site where the item is still active, each with a link straight to the listing.'],
          ['Take each one down', 'Open each link, end or delete the listing on that site, then tick it in the checklist.'],
          ['Nothing slips through', 'Until every listing is down, the item keeps a red <b>Delist</b> tag and stays in the Action Center under <b>Delist needed</b>.']
        ] },
        { t: 'grid', h: 'Listing statuses', items: [
          ['🟢', 'Active', 'Live on that site.'],
          ['⚪', 'Delisted', 'You took it down.'],
          ['🟡', 'Sold', 'It sold on that site.'],
          ['🔴', 'Expired', 'The site ended it (for example an eBay listing that ran out).']
        ] },
        { t: 'note', kind: 'warn', html: 'The helper prepares everything, but <b>you</b> press Publish on each site. Marketplaces like Poshmark, Depop, Mercari and Vinted don’t let outside apps post for you, and many forbid bots — copy-and-paste keeps your accounts safe. Always double-check the category, size and shipping options each site asks for.' }
      ]
    },
    {
      id: 'sales', icon: '💸', color: '#2f8a57', title: 'Recording a sale',
      lead: 'Two clicks, with fees estimated for you — and a little celebration.',
      blocks: [
        { t: 'steps', h: 'Mark an item sold', items: [
          ['Click the ✓ Mark sold button', 'On the item’s row, in its details, or select several and use <b>Mark sold…</b>. You can also record a sale from Orders & Sales → <b>+ Record sale</b>.'],
          ['Pick the platform and price', 'The app estimates the fees from that platform’s settings and fills in <b>Total after fees</b> (and your shipping, if you pay it).'],
          ['Check the payout', 'Edit the after-fees total to match what the site actually paid you — that’s what profit is based on.'],
          ['Enjoy the moment', 'Dollar bills burst across the screen with a SOLD! badge showing price and profit. Turn it off or preview it in Settings → Business.']
        ] },
        { t: 'grid', h: 'Orders & Sales tab', items: [
          ['📋', 'Every sale', 'Price, fees, profit, margin and days to sell, with totals.'],
          ['🔎', 'Filter', 'By platform and date range, plus search.'],
          ['↩️', 'Undo a sale', 'The ↩ button returns an item to inventory and reactivates its listings.'],
          ['📦', 'Ship it', 'ⓘ opens the item’s details with <b>Packing slip</b> and <b>Thank-you card</b> buttons.']
        ] },
        { t: 'note', kind: 'tip', html: 'Profit = <b>total after fees − item cost − your shipping</b>. Keep the purchase price filled in for accurate profit and taxes.' }
      ]
    },
    {
      id: 'actions', icon: '✅', color: '#c2413b', title: 'The Action Center',
      lead: 'One tab for everything that needs you today. The number on the tab counts what’s waiting.',
      blocks: [
        { t: 'cards', items: [
          ['🚩', 'Delist needed', 'Sold items still active on other sites, with a link to each listing. Tick each one off as you remove it.'],
          ['🏷️', 'Price drops due', 'Based on your <b>selling plan</b> (Settings → Selling plan). Example: −10% at 60 days, −15% at 120, −20% at 180. Never goes below an item’s lowest acceptable price. Apply one, all, or skip.'],
          ['🔁', 'Refresh / relist', 'Items not refreshed for a while (you set the days). Mark them refreshed once you’ve relisted or shared them.'],
          ['🤔', 'Decide', 'Items listed longer than a year: <b>bundle</b>, <b>deep-discount</b>, <b>donate</b> (written off at cost in the P&L) or <b>keep</b> for 90 more days.'],
          ['🧾', 'Estimated taxes', 'The next quarterly payment, its due date and the estimated amount.'],
          ['💾', 'Backups', 'How long since your last backup, with a button to make one.']
        ] },
        { t: 'go', html: go('settings', '#mdSteps', 'Set up my selling plan') + go('actions', '', 'Open the Action Center') }
      ]
    },
    {
      id: 'platforms', icon: '🏪', color: '#3f7fb5', title: 'Platforms & fees',
      lead: 'Accurate fees mean accurate profit. Seventeen marketplaces come preset with US fees as published in November 2026.',
      blocks: [
        { t: 'plats' },
        { t: 'grid', h: 'Each platform card', items: [
          ['💲', 'Selling fee', 'Percent, fixed fee, minimum, price tiers (like Amazon clothing 5% / 10% / 17%) and small-order rules (like Poshmark’s $2.95 under $15).'],
          ['💳', 'Processing', 'Percent, fixed and minimum; whether fees also apply to shipping.'],
          ['➕', 'Extra costs', 'Listing fees, and any number of extras as % of sale, $ per sale or $ per month.'],
          ['🚚', 'Shipping', 'Who usually pays, the typical charge and your own extra cost.'],
          ['📊', 'Results', 'What you keep on a $40 sale, plus real totals: items listed, sold, gross sales and average fee.'],
          ['✏️', 'Yours to change', 'Edit, hide, delete or add platforms. Renaming one updates every item that uses it.']
        ] },
        { t: 'steps', h: 'When a marketplace changes its fees', items: [
          ['Watch for the gold banner', 'Once a day, opening the Platforms tab quietly checks the shared fee list. If a site you use has new fees, a gold <b>Fee updates available</b> banner appears.'],
          ['Review the changes', `Click <b>Review &amp; update</b> — or <b>↻ Check for fee updates</b> any time. You see each change, old → new, with an explanation. ${go('platforms', '#btnFeeCheck')}`],
          ['Your edits are respected', 'Platforms you changed yourself are marked <b>you edited this one</b> and left unticked, so your own numbers are never overwritten by surprise.'],
          ['Update once, everyone gets it', 'Tick and update. With cloud sync on, the new fees reach every phone and computer within seconds, and the change appears in the activity history.'],
          ['Look it up yourself', 'Every platform card has <b>Look up current fees ↗</b> to check the marketplace’s published rates.']
        ] },
        { t: 'note', kind: 'good', html: 'Where do new fees come from? The app reads <b>platform-fees.json</b> from your own website (the same GitHub folder as the app). When a marketplace announces new fees, that one file is updated and uploaded — every device then offers the update. Marketplaces don’t publish their fees in a form apps can read automatically, so the file is the dependable way to keep everyone in step.' },
        { t: 'note', kind: 'tip', html: `The <b>fee calculator</b> at the top compares every platform for any price, cost and shipping — perfect for deciding where to list something. ${go('platforms', '#pcPrice', 'Try the calculator')}` }
      ]
    },
    {
      id: 'expenses', icon: '🧾', color: '#c2413b', title: 'Expenses & mileage',
      lead: 'Every deduction you track lowers your taxes. Item purchase prices are already counted — add everything else here.',
      blocks: [
        { t: 'grid', items: [
          ['🧾', 'Expenses', `Supplies, postage, subscriptions, storage — date, category, vendor, amount and payment. ${go('expenses', '#btnAddExpense', 'Add one')}`],
          ['📊', 'By category', 'A running breakdown so you see where money goes.'],
          ['🚗', 'Mileage log', `Log trips to thrift stores, the post office and sales. Round trips double the miles. ${go('expenses', '#btnAddTrip', 'Log a trip')}`],
          ['📐', 'IRS rate', 'Each trip uses the IRS standard rate for its date (2026: 72.5¢, then 76¢ from July 1). Edit rates in Settings.'],
          ['⧉', 'Repeat a trip', 'The duplicate button logs the same trip again today — great for regular routes.'],
          ['🗂️', 'Your categories', 'Settings → Lists → Expense categories.']
        ] },
        { t: 'note', kind: 'warn', html: 'Using the standard mileage rate means you can’t also deduct actual car costs like gas. Ask your tax professional which is better for you.' }
      ]
    },
    {
      id: 'dashboard', icon: '📈', color: '#2a7a70', title: 'The Dashboard',
      lead: 'Your business on one page — choose the period at the top right (all time, this year, last year, 90 or 30 days, this month).',
      blocks: [
        { t: 'kpi' },
        { t: 'grid', items: [
          ['🎯', 'Goal rings', 'Monthly goals for sales, profit and items sold. The ring fills as you go; a marker shows where you should be by today. Set them in Settings → Monthly goals.'],
          ['📊', 'Monthly chart', 'Sales and profit by month.'],
          ['🍩', 'Platform donut', 'Which sites bring in the money.'],
          ['🗓️', 'Sales calendar', 'Every day of the year shaded by sales — spot your best days and streaks.'],
          ['🏆', 'Best sellers', 'Your most profitable items with photos. Click one for details.'],
          ['⏳', 'Aging & stale', 'How old your inventory is, and the items that need attention most.'],
          ['🕘', 'Recent activity', 'Who changed what, most recent first. <b>View all</b> opens the full history.'],
          ['🗃️', 'By category', 'Stock, cost, list value, sold and profit for each category.']
        ] }
      ]
    },
    {
      id: 'reports', icon: '📑', color: '#6b6fa8', title: 'Reports & taxes',
      lead: 'Profit & loss, estimated taxes and assets for any dates — plus files you can hand to your accountant.',
      blocks: [
        { t: 'cards', items: [
          ['📑', 'Financial report', 'Reports tab: pick From/To or a preset (all time, year to date, last year, this quarter, this month). Shows revenue, fees, cost of goods, shipping, expenses, mileage, net profit, estimated taxes and inventory assets.', go('reports', '#repPreset')],
          ['📗', 'Excel workbook', 'Summary, Sales, Itemized Costs, Assets, Taxes by month, Expenses and Full Inventory — with live formulas and your logo.', go('reports', '#btnExportXlsx2')],
          ['📄', 'Monthly PDF', 'A branded one-page profit summary: KPIs, daily sales bars, P&L, platforms and every sale. Choose a month, then “Save as PDF”.', go('reports', '#btnPdfMonth')],
          ['🧮', 'Tax-year PDF', 'Gross receipts, deductions, expenses, mileage, estimated tax, quarterly payments and sales by platform to compare with any 1099-K.', go('reports', '#btnPdfTax')]
        ] },
        { t: 'grid', h: 'Tax helpers', items: [
          ['📅', 'Quarterly estimates', 'Due dates, estimated tax per quarter and what you paid. Reminders arrive N days before each due date.'],
          ['🧾', '1099-K check', 'Sales by platform per year. Federal threshold: over $20,000 <b>and</b> over 200 transactions.'],
          ['⚙️', 'Your rates', 'Settings → Taxes: income tax rate, self-employment rate and any sales tax you collect yourself.'],
          ['🔍', 'What sells', 'Performance by brand, size, category and source — sell-through, days to sell, profit and ROI.']
        ] },
        { t: 'note', kind: 'warn', html: 'Tax figures are estimates from the numbers you enter, for planning only — not tax advice.' }
      ]
    },
    {
      id: 'print', icon: '🖨️', color: '#c9952e', title: 'Labels, slips & thank-you cards',
      lead: 'Branded printables that make a small shop look big.',
      blocks: [
        { t: 'printables' },
        { t: 'steps', h: 'How to print', items: [
          ['Select items', 'Tick the checkboxes in Inventory (or use one item’s details).'],
          ['Choose what to print', `${b('Print labels')} ${b('Packing slips')} ${b('Thank-you cards')} on the bar that appears.`],
          ['In the print window', 'Choose your printer — or <b>Save as PDF</b>. For labels, set scale to <b>Actual size / 100%</b>.']
        ] },
        { t: 'grid', h: 'Set them up once', items: [
          ['🏷️', 'Label format', `Avery 5160 (30 per sheet), Avery 5163 (10 per sheet), 2×1 in or 4×6 in label printers. ${go('settings', '#setLabelFmt')}`],
          ['🔗', 'Shop link', `The QR code on slips and cards opens it — your Depop, Poshmark or eBay store. ${go('settings', '#setShopUrl')}`],
          ['💌', 'Message', 'Write your own thank-you message and social handle.'],
          ['📐', 'Slip size', 'Letter page or a 4×6 thermal label.']
        ] },
        { t: 'note', kind: 'tip', html: 'Every label’s QR code links to that item. Scan it with any phone camera — or the app’s scan button — to open the item instantly. Perfect for finding things in storage bins.' }
      ]
    },
    {
      id: 'sync', icon: '☁️', color: '#3f7fb5', title: 'Sharing between devices & people',
      lead: 'Cloud sync keeps every phone and computer in step within seconds, encrypted with your app password.',
      blocks: [
        { t: 'steps', h: 'Turning it on (each device, once)', items: [
          ['Open Settings → Cloud sync', `${go('settings', '#cloudCard')}`],
          ['Sign in with your cloud e-mail and cloud password', 'Each person uses their own e-mail. Only e-mails listed in the Firestore rules can get in.'],
          ['Answer the first-connect question', '<b>Use the cloud data</b> (recommended for a second device) or <b>Combine</b> both. A safety snapshot is saved first.'],
          ['Watch the pill', '<i>Connecting…</i> → <i>Syncing…</i> → <b>Up to date</b>.']
        ] },
        { t: 'grid', h: 'Good to know', items: [
          ['🔐', 'Scrambled in the cloud', 'Every record is encrypted with your app password before it leaves the device. Firebase only stores unreadable data.'],
          ['🔑', 'Same app password', 'Every device must use the same app password. If one differs, the app asks for the cloud one.'],
          ['⚖️', 'Newest edit wins', 'Changes merge record by record. Photos (as smaller copies), the logo, settings and reset questions sync too.'],
          ['🛡️', 'Mass-delete guard', 'If one change would delete lots of records everywhere, the app asks first.'],
          ['📴', 'Offline', 'Keep working — changes upload when you reconnect.'],
          ['🖥️', 'Per device', 'Theme, view, table sizes and your name stay on each device.']
        ] }
      ]
    },
    {
      id: 'activity', icon: '🕘', color: '#8a5a9e', title: 'Activity history',
      lead: 'Who changed what, and when — with one-click revert.',
      blocks: [
        { t: 'activity' },
        { t: 'steps', items: [
          ['Tell the app who you are', `Settings → Business → <b>Your name on this device</b>. ${go('settings', '#setYourName')}`],
          ['See what happened', 'Dashboard → <b>Recent activity</b>. Click an entry to open the item.'],
          ['Find anything', '<b>View all</b> filters by person (Everyone, Jorge, Andy…), by type (inventory, expenses, mileage) and by words.'],
          ['Revert a change', '<b>Revert</b> puts the record back the way it was before that change. If it changed again later, the app warns you. Reverts can be undone too.']
        ] },
        { t: 'note', kind: 'good', html: 'Adds, edits, sales, deletions, imports, restores and undos are all recorded. Each item’s details also show <b>Last edited by</b> and who changed its price. History is kept for one year and shared through cloud sync.' }
      ]
    },
    {
      id: 'safety', icon: '🛟', color: '#2f8a57', title: 'Keeping your data safe',
      lead: 'Several layers of protection — use them and you’ll never lose a sale.',
      blocks: [
        { t: 'layers' },
        { t: 'grid', items: [
          ['⬇', 'Backups', 'The Backup button downloads everything, including photos. Settings → Data → <b>Encrypt JSON backups</b> protects the file with your password.'],
          ['⏰', 'Reminders', 'Settings → Reminders → <b>Backup reminder</b> shows a banner every N days.'],
          ['📸', 'Safety snapshots', 'Saved automatically before every import, restore, sync takeover and new app version. The last 10 are kept; restore or download one any time.'],
          ['↩️', 'Undo & redo', `The Undo / Redo buttons in the bottom-left corner work on every tab and remember your last 50 changes since you unlocked the app. ${k('Ctrl')} + ${k('Z')} works too.`],
          ['🕘', 'Revert', 'Activity history can roll back any single change.'],
          ['🧨', 'Erase', 'Settings → Danger zone erases everything in this browser — and, if you choose, the cloud copy too. Back up first!']
        ] }
      ]
    },
    {
      id: 'personal', icon: '🎨', color: '#c9952e', title: 'Make it yours',
      lead: 'Settings that shape how the app looks and works.',
      blocks: [
        { t: 'grid', items: [
          ['🌗', 'Light, dark or auto', 'The ☀/🌙 button, or Settings → Business → Appearance.'],
          ['🖼️', 'Logo & name', 'Upload a logo, change the name and tagline, or hide them in the header.'],
          ['🎨', 'Color thresholds', 'When items turn amber (aging) and red (stale).'],
          ['🗂️', 'Lists', 'Categories, statuses and expense categories.'],
          ['💱', 'Currency', 'How money is shown.'],
          ['🎉', 'Celebration', 'Turn the sale celebration on or off; preview it.'],
          ['📉', 'Selling plan', 'Price-drop steps, days between drops, rounding (cents, whole dollars, .99), relist and decide timing, deep discount.'],
          ['🎯', 'Goals', 'Monthly sales, profit and items sold.']
        ] }
      ]
    },
    {
      id: 'faq', icon: '💬', color: '#6b7672', title: 'Shortcuts & questions',
      lead: 'Quick answers to the things people ask most.',
      blocks: [
        { t: 'keys' },
        { t: 'faq', items: [
          ['I forgot my app password.', 'On the lock screen click <b>Forgot password?</b> and answer your reset questions to set a new one. Your hint appears after a wrong try. Without the questions, the only way back in is erasing and restoring a backup — so set them up now.'],
          ['My data isn’t on my other device.', 'Each browser keeps its own copy. Turn on cloud sync on both devices with the same app password, or make a Backup here and Restore it there.'],
          ['The sync pill says something other than “Up to date”.', '<i>Offline</i>: no internet — changes wait. <i>Different app password in the cloud</i>: click Sync now and enter the password the cloud uses. Errors: sign out and back in, and check the e-mail is listed in the Firestore rules.'],
          ['Profit looks wrong on a sale.', 'Open the item and check <b>purchase price</b>, <b>total after fees</b> (what the site actually paid you) and <b>shipping cost</b> (only what you paid).'],
          ['Fee estimates are off.', 'Platforms tab → <b>↻ Check for fee updates</b>. If the shared list hasn’t caught up yet, click <b>Look up current fees ↗</b> on that platform and edit its numbers.'],
          ['Can the app post listings to Poshmark, Depop or Mercari by itself?', 'No — those marketplaces don’t allow outside apps to post for you. The Cross-list helper gets everything ready so each site takes about a minute: open, paste, publish, paste the link back.'],
          ['The “sell” page link opens the wrong page.', 'Sites move pages around. Open the site, go to its “sell an item” page yourself, copy that address, and paste it into Platforms → Edit → Cross-listing helper → “Sell an item” page.'],
          ['A title is cut off.', 'It was trimmed to that site’s title limit. Edit it in the helper, or change the limit in Platforms → Edit if the site allows more.'],
          ['Can two items have the same SKU?', 'Yes. Every item has its own hidden ID, so sales, profit, photos and sync keep them apart. The app just helps you notice: the SKU shows a small <b>×2</b> badge, the editor says which other item uses it, and Inventory → <b>⚠ Duplicate SKUs</b> (in the age filter) lists them all. QR labels open the exact item, and typing or scanning a shared SKU asks which one you mean.'],
          ['I made a mistake. How do I take it back?', 'Click <b>Undo</b> in the bottom-left corner (or press Ctrl/⌘ + Z) — as many times as you need, up to 50 steps. Went one too far? <b>Redo</b>. Undo remembers what <b>you</b> did on <b>this device</b> since you unlocked the app; for older changes, or something someone else did, use <b>Revert</b> in the activity history (Dashboard → Recent activity → View all).'],
          ['I imported the wrong file.', 'Settings → Safety snapshots → restore the snapshot from just before the import.'],
          ['Labels print the wrong size.', 'In the print window set scale to <b>Actual size / 100%</b>, margins to <b>Default</b>, and check the label format in Settings.'],
          ['Where are the PDFs saved?', 'Wherever you choose in the print window after picking <b>Save as PDF</b> (usually Downloads).'],
          ['The app looks old after an update.', 'Close all its tabs and open it again; on a phone, close and reopen the app. It always checks for the newest version.'],
          ['Is my information private?', 'Yes. Everything is encrypted with your app password in the browser, and the cloud only stores scrambled data. Never put backup files or Firebase rules in a public place.']
        ] }
      ]
    }
  ];

  /* ---------- illustrated blocks ---------- */
  const ILLUS = {
    mock: () => `<div class="g-mock" aria-hidden="true">
        <div class="gm-top"><span class="gm-logo"></span><span class="gm-name">Thriftaholics</span><span class="gm-sp"></span>
          <span class="gm-pill ok">☁ Up to date</span><span class="gm-b">⬇ Backup</span><span class="gm-b">⬆ Restore</span><span class="gm-b gold">Excel Report</span><span class="gm-ic">⌖</span><span class="gm-ic">🔒</span></div>
        <div class="gm-tabs"><span class="on">Dashboard</span><span>Inventory <i>144</i></span><span>Action Center <i>12</i></span><span>Orders &amp; Sales</span><span>Platforms</span><span>Expenses</span><span>Reports</span><span>Settings</span><span>Guide</span></div>
        <div class="gm-body"><span></span><span></span><span></span><span></span></div>
        <span class="gm-n" style="left:3%;top:6%">1</span><span class="gm-n" style="left:52%;top:6%">2</span><span class="gm-n" style="right:6%;top:6%">3</span><span class="gm-n" style="left:3%;top:36%">4</span>
      </div>
      <ol class="g-legend"><li><b>1</b> Logo &amp; name</li><li><b>2</b> Sync status</li><li><b>3</b> Backup, reports, scan &amp; lock</li><li><b>4</b> Tabs</li></ol>`,
    colors: () => `<div class="g-sub">Color coding</div><div class="g-colors">
        <div style="--c:#2f8a57"><b>Sold</b><span>Done and counted</span></div>
        <div style="--c:#3f7fb5"><b>Fresh</b><span>Recently listed</span></div>
        <div style="--c:#c9952e"><b>Aging</b><span>Getting older (you set the days)</span></div>
        <div style="--c:#c2413b"><b>Stale</b><span>Needs action</span></div>
        <div style="--c:#8b9490"><b>Pending / other</b><span>Custom statuses</span></div></div>`,
    views: () => `<div class="g-sub">Three ways to look at it</div><div class="g-views">
        <figure><div class="gv gv-table"><i></i><i></i><i></i><i></i><i></i></div><figcaption><b>Table</b>Every column, spreadsheet-style. Best on a computer.</figcaption></figure>
        <figure><div class="gv gv-cards"><i></i><i></i><i></i><i></i></div><figcaption><b>Cards</b>Tap a card to open it; collapsed cards keep the name, photo, price and SKU.</figcaption></figure>
        <figure><div class="gv gv-gallery"><i></i><i></i><i></i><i></i><i></i><i></i></div><figcaption><b>Gallery</b>Big photos — tap one for its details. Inventory only.</figcaption></figure></div>
        <p class="g-small">Switch with the <b>View</b> buttons under the table. <b>Auto</b> uses cards on a phone and the table on a computer. ${go('inventory', '#invWrap + .resize-bar', 'Show me the switch')}</p>`,
    sheet: () => `<div class="g-split"><div class="g-sheet" aria-hidden="true"><div class="gs-ph"></div><div class="gs-r"><span class="gs-l w60"></span><span class="gs-l w40"></span><div class="gs-wf"><i style="width:90%"></i><i style="width:30%;background:#c2413b"></i><i style="width:60%;background:#2f8a57"></i></div><div class="gs-tl"><i></i><i></i><i></i></div></div></div>
        <div><div class="g-sub">The item details sheet</div><p>Click a gallery tile, a best seller, or the <b>ⓘ</b> button on any row. You get a big photo, all the facts, <b>where the money goes</b> (price → fees → cost → profit), a <b>price history</b> chart and a <b>timeline</b> of when it was bought, listed, repriced, relisted and sold — and by whom.</p>
        <p>From there: edit, mark sold, duplicate, print its QR label, packing slip or thank-you card, or add a photo.</p></div></div>`,
    bulk: () => `<div class="g-sub">Bulk actions</div><p>Tick the checkboxes on several rows and a bar appears at the bottom:</p>
        <div class="g-bulk"><span class="gb-n">3 selected</span>${['Mark sold…', 'Mark available', 'Change price…', 'Set category…', 'Set location…', 'Print labels', 'Packing slips', 'Thank-you cards', 'Refreshed', 'Duplicate', 'Delete'].map((x) => `<span>${x}</span>`).join('')}</div>
        <p class="g-small"><b>Change price…</b> does % off, $ off, a set price or % increase, with rounding — and every change goes into the item’s price history.</p>`,
    plats: () => `<div class="g-plats">${[['Poshmark', '#c2413b'], ['Depop', '#e0483e'], ['eBay', '#3f7fb5'], ['Mercari', '#6b6fa8'], ['Facebook', '#2f6fd1'], ['Vinted', '#1a9e95'], ['Amazon', '#e7a03c'], ['Etsy', '#e06a2c'], ['Grailed', '#333'], ['Whatnot', '#c9952e'], ['TikTok Shop', '#111'], ['Vestiaire', '#8a5a9e'], ['The RealReal', '#555'], ['StockX', '#2f8a57'], ['OfferUp', '#14a085'], ['Shopify', '#5e8e3e'], ['In person', '#6b7672']].map(([n, c]) => chip(n, c)).join('')}</div>`,
    kpi: () => `<div class="g-kpis" aria-hidden="true">${[['Gross sales', '$362', '#2f8a57', '▲ 12%'], ['Net profit', '$231', '#c9952e', '▲ 8%'], ['Items sold', '12', '#2a7a70', '▼ 2']].map(([l, v, c, d]) => `<div style="--c:${c}"><span>${l}</span><b>${v}</b><em class="${d[0] === '▲' ? 'up' : 'dn'}">${d}</em><svg viewBox="0 0 60 18"><polyline fill="none" stroke="${c}" stroke-width="2" points="0,14 10,12 20,13 30,8 40,9 50,4 60,5"/></svg></div>`).join('')}</div>
        <p class="g-small">Each tile shows the change against the previous period (▲ better, ▼ worse) and a 12-month sparkline.</p>`,
    printables: () => `<div class="g-prints" aria-hidden="true">
        <figure><div class="gp gp-label"><span class="qr"></span><span><b>SKU 159</b><i></i><i></i><em>$28.00</em></span></div><figcaption>QR label</figcaption></figure>
        <figure><div class="gp gp-slip"><span class="hd"></span><i></i><i></i><i></i><span class="ty">Thank you!</span></div><figcaption>Packing slip</figcaption></figure>
        <figure><div class="gp gp-card"><span class="l"></span><span class="r"><b>Thank you!</b><i></i><i></i><span class="qr"></span></span></div><figcaption>Thank-you card</figcaption></figure>
        <figure><div class="gp gp-rep"><span class="hd"></span><span class="k"><i></i><i></i><i></i><i></i></span><span class="bars"><i style="height:30%"></i><i style="height:70%"></i><i style="height:45%"></i><i style="height:90%"></i><i style="height:55%"></i></span></div><figcaption>PDF report</figcaption></figure></div>`,
    activity: () => `<ul class="acts g-acts" aria-hidden="true">
        <li class="act"><span class="av" style="--av:#c9952e">A</span><div class="act-t"><b>Andy</b> marked “Pleated Mini Skirt” sold for $28.00<span class="act-when">2 minutes ago</span></div><span class="g-btn sm">Revert</span></li>
        <li class="act"><span class="av" style="--av:#2a7a70">J</span><div class="act-t"><b>Jorge</b> changed the price of “Blue Tank Top” $18.00 → $14.00<span class="act-when">1 hour ago</span></div><span class="g-btn sm">Revert</span></li>
        <li class="act"><span class="av" style="--av:#c9952e">A</span><div class="act-t"><b>Andy</b> added “Y2K Denim Jacket”<span class="act-when">yesterday</span></div><span class="g-btn sm">Revert</span></li></ul>`,
    xlflow: () => `<div class="g-xl" aria-hidden="true">
        <div class="gx-item"><span class="gx-ph"></span><b>Y2K Denim Jacket</b><em>$42</em></div>
        <div class="gx-arrows"><i></i><i></i><i></i><i></i></div>
        <div class="gx-sites">${[['Poshmark', '#8c2f39', 1], ['Depop', '#d1492e', 1], ['eBay', '#3a6ea5', 1], ['Mercari', '#7b4fa0', 0]].map(([n, c, ok]) => `<span style="--c:${c}">${n}${ok ? ' ✓' : ''}</span>`).join('')}</div>
        <div class="gx-cap">1 item · copy-ready for each site · <b>3 of 4 live</b></div></div>`,
    layers: () => `<div class="g-layers" aria-hidden="true">${[['🔐', 'Encryption', 'locks everything'], ['☁️', 'Cloud sync', 'a live copy'], ['⬇', 'Backups', 'files you keep'], ['📸', 'Snapshots', 'automatic restore points'], ['↩️', 'Undo & revert', 'oops-proof']].map(([i, t, s], n) => `<div style="--n:${n}"><span>${i}</span><b>${t}</b><em>${s}</em></div>`).join('')}</div>`,
    keys: () => `<div class="g-keys">${[[k('Ctrl') + '/' + k('⌘') + ' + ' + k('Z'), 'Undo'], [k('Ctrl') + '/' + k('⌘') + ' + ' + k('Shift') + ' + ' + k('Z'), 'Redo (or ' + k('Ctrl') + ' + ' + k('Y') + ')'], [k('Tab'), 'Next cell'], [k('Enter'), 'Save the cell'], [k('Esc'), 'Cancel editing / close a window'], ['<b>Shift</b> + click header', 'Sort by a second column'], ['Drag a photo onto a row', 'Add a photo']].map(([a, d]) => `<div><span>${a}</span><em>${d}</em></div>`).join('')}</div>`
  };

  /* ---------- render ---------- */
  function block(x) {
    if (ILLUS[x.t]) return `<div class="g-block g-ill">${ILLUS[x.t]()}</div>`;
    const h = x.h ? `<div class="g-sub">${esc(x.h)}</div>` : '';
    if (x.t === 'steps') return `<div class="g-block">${h}<ol class="g-steps">${x.items.map(([t, d]) => `<li data-s><b>${t}</b><p>${d}</p></li>`).join('')}</ol></div>`;
    if (x.t === 'grid') return `<div class="g-block">${h}<div class="g-grid">${x.items.map(([i, t, d]) => `<div class="g-feat" data-s><span class="g-ico">${i}</span><div><b>${t}</b><p>${d}</p></div></div>`).join('')}</div></div>`;
    if (x.t === 'cards') return `<div class="g-block">${h}<div class="g-cards">${x.items.map(([i, t, d, g]) => `<div class="g-card2" data-s><span class="g-ico lg">${i}</span><b>${t}</b><p>${d}</p>${g || ''}</div>`).join('')}</div></div>`;
    if (x.t === 'note') return `<div class="g-note ${x.kind}" data-s><span>${x.kind === 'warn' ? '⚠️' : x.kind === 'good' ? '🛡️' : '💡'}</span><p>${x.html}</p></div>`;
    if (x.t === 'go') return `<div class="g-block g-gorow">${x.html}</div>`;
    if (x.t === 'faq') return `<div class="g-block g-faq">${x.items.map(([q, a]) => `<details data-s><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>`;
    return '';
  }

  const READ_KEY = 'thrift-guide-read';
  const readSet = () => { try { return new Set(JSON.parse(localStorage.getItem(READ_KEY) || '[]')); } catch (_) { return new Set(); } };
  const saveRead = (s) => { try { localStorage.setItem(READ_KEY, JSON.stringify([...s])); } catch (_) { /* ignore */ } };

  function shell() {
    const read = readSet();
    return `<div class="guide">
      <header class="g-hero">
        <div class="g-hero-art"><img src="icons/brand-mark.png" alt=""><span class="g-spark s1">✦</span><span class="g-spark s2">✦</span><span class="g-spark s3">✧</span></div>
        <div class="g-hero-tx">
          <div class="g-kicker">The complete guide</div>
          <h2><span class="script">Welcome to Thriftaholics</span></h2>
          <p>Everything this app can do — from your first item to tax time — in ${CH.length} short chapters. Read it top to bottom, jump to what you need, or search.</p>
          <div class="g-search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg><input type="search" id="gSearch" placeholder="Search the guide — try “label”, “fees” or “backup”" autocomplete="off"><span id="gCount" class="g-count"></span></div>
        </div>
      </header>
      <section class="g-check" id="gCheck"></section>
      <div class="g-layout">
        <nav class="g-toc" id="gToc" aria-label="Chapters">
          <div class="g-toc-h">Chapters <span id="gReadCt"></span></div>
          ${CH.map((c, i) => `<a href="#g-${c.id}" data-toc="${c.id}" class="${read.has(c.id) ? 'read' : ''}"><span class="n" style="--c:${c.color}">${read.has(c.id) ? '✓' : i + 1}</span>${esc(c.title)}</a>`).join('')}
        </nav>
        <div class="g-main" id="gMain">
          ${CH.map((c, i) => `<article class="g-ch" id="g-${c.id}" data-ch="${c.id}" style="--c:${c.color}">
            <div class="g-ch-head"><span class="g-num">${String(i + 1).padStart(2, '0')}</span><span class="g-ch-ico">${c.icon}</span><div><h3>${esc(c.title)}</h3><p>${c.lead}</p></div></div>
            ${c.blocks.map(block).join('')}
            <div class="g-ch-foot"><button type="button" class="g-done ${read.has(c.id) ? 'on' : ''}" data-done="${c.id}">${read.has(c.id) ? '✓ Read' : 'Mark as read'}</button>${i < CH.length - 1 ? `<a class="g-next" href="#g-${CH[i + 1].id}">Next: ${esc(CH[i + 1].title)} →</a>` : '<a class="g-next" href="#g-start">Back to the top ↑</a>'}</div>
          </article>`).join('')}
          <div class="g-empty hidden" id="gNone">${Dash.empty('Nothing found', 'Try another word — or browse the chapters.', '🔎')}</div>
          <footer class="g-end"><img src="icons/brand-mark.png" alt=""><div><span class="script">Happy thrifting!</span><p>You can come back to this guide any time from the <b>Guide</b> tab.</p></div></footer>
        </div>
      </div>
    </div>`;
  }

  /* ---------- live setup checklist ---------- */
  async function checklist(root, ctx) {
    const c = await ctx();
    const items = [
      ['Protect your password', 'Add a hint or reset questions', c.recovery, 'settings', '#btnRecNew'],
      ['Add your logo', 'It goes on every printout', c.logo, 'dashboard', '#logoSlot'],
      ['Bring in your inventory', 'Import or add your first item', c.items > 0, 'inventory', '#btnImportXlsx'],
      ['Check your platforms', 'Hide the sites you don’t use', c.platformsTouched, 'platforms', '#platGrid'],
      ['Cross-list an item', 'Live on two or more sites', c.crossListed, 'inventory', '#invWrap'],
      ['Record a sale', 'Watch the celebration', c.sold > 0, 'inventory', ''],
      ['Make a backup', 'Keep a copy somewhere safe', c.backup, 'dashboard', '#btnExportJson'],
      ['Tell the app your name', 'For the activity history', c.name, 'settings', '#setYourName'],
      ['Add your shop link', 'For QR codes on slips & cards', c.shop, 'settings', '#setShopUrl'],
      ['Turn on cloud sync', 'Optional — share between devices', c.sync, 'settings', '#cloudCard']
    ];
    const done = items.filter((x) => x[2]).length, frac = done / items.length;
    const R = 34, C = 2 * Math.PI * R;
    const box = root.querySelector('#gCheck');
    const collapsed = localStorage.getItem('thrift-guide-check') === 'min';
    box.classList.toggle('min', collapsed);
    box.innerHTML = `<div class="g-check-head">
        <svg class="g-ring" viewBox="0 0 80 80"><circle cx="40" cy="40" r="${R}" class="bg"/><circle cx="40" cy="40" r="${R}" class="fg" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac)}" transform="rotate(-90 40 40)"/><text x="40" y="45">${done}/${items.length}</text></svg>
        <div><h3>${done === items.length ? 'All set — you’re a pro! 🎉' : 'Your setup checklist'}</h3><p>${done === items.length ? 'Every step is done. The rest of this guide is here whenever you need it.' : 'These tick themselves off as you go. Click one to jump straight there.'}</p></div>
        <button type="button" class="g-min" data-min>${collapsed ? 'Show' : 'Hide'}</button></div>
      <div class="g-check-list">${items.map(([t, s, ok, v, sp]) => `<button type="button" class="g-ci ${ok ? 'ok' : ''}" data-go="${v}" data-spot="${sp}"><span class="tick">${ok ? '✓' : ''}</span><span><b>${t}</b><em>${s}</em></span></button>`).join('')}</div>`;
  }

  /* ---------- spotlight: jump into the app and point at something ---------- */
  function spotlight(sel) {
    if (!sel) return;
    setTimeout(() => {
      const el = document.querySelector(sel);
      if (!el || !el.getClientRects().length) return;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const ring = document.createElement('div');
      ring.className = 'g-spot';
      document.body.appendChild(ring);
      const t0 = performance.now();
      const place = () => {
        if (!ring.isConnected) return;
        const r = el.getBoundingClientRect();
        ring.style.cssText = `left:${r.left - 8}px;top:${r.top - 8}px;width:${r.width + 16}px;height:${r.height + 16}px`;
        if (performance.now() - t0 < 3300) requestAnimationFrame(place);
      };
      place();
      setTimeout(() => ring.classList.add('out'), 2800);
      setTimeout(() => ring.remove(), 3400);
      // a click anywhere dismisses it early
      setTimeout(() => document.addEventListener('pointerdown', () => ring.remove(), { once: true }), 50);
    }, 160);
  }
  function goTo(view, spot) {
    const tab = document.querySelector(`.tab[data-view="${view}"]`);
    if (tab) tab.click();
    if (view === 'settings' && spot && /cloudCard/.test(spot) === false) { /* settings fields live in cards — scroll works the same */ }
    spotlight(spot);
  }

  /* ---------- search ---------- */
  function search(root, q) {
    q = q.trim().toLowerCase();
    let hits = 0;
    root.querySelectorAll('.g-ch').forEach((ch) => {
      const parts = ch.querySelectorAll('[data-s]');
      let any = !q || ch.querySelector('.g-ch-head').textContent.toLowerCase().includes(q);
      parts.forEach((p) => {
        const m = !q || p.textContent.toLowerCase().includes(q);
        p.classList.toggle('g-hit', !!q && m);
        p.classList.toggle('g-dim', !!q && !m);
        if (m && q) { any = true; hits++; if (p.tagName === 'DETAILS') p.open = true; }
      });
      ch.classList.toggle('hidden', !any);
      ch.querySelectorAll('.g-ill').forEach((x) => x.classList.toggle('hidden', !!q));
      const t = root.querySelector(`[data-toc="${ch.dataset.ch}"]`); if (t) t.classList.toggle('g-off', !any);
    });
    root.querySelector('#gNone').classList.toggle('hidden', !q || root.querySelectorAll('.g-ch:not(.hidden)').length > 0);
    root.querySelector('#gCount').textContent = q ? `${hits} match${hits === 1 ? '' : 'es'}` : '';
    root.querySelector('#gCheck').classList.toggle('hidden', !!q);
  }

  function updateReadCount(root) {
    const n = readSet().size;
    root.querySelector('#gReadCt').textContent = `${n}/${CH.length} read`;
  }

  /* ---------- public ---------- */
  let built = false, ctxFn = null, observer = null;
  Guide.render = (root, ctx) => {
    ctxFn = ctx;
    if (!built) {
      built = true;
      root.innerHTML = shell();
      updateReadCount(root);
      root.addEventListener('click', (e) => {
        const g = e.target.closest('[data-go]');
        if (g) { e.preventDefault(); goTo(g.dataset.go, g.dataset.spot); return; }
        const d = e.target.closest('[data-done]');
        if (d) {
          const s = readSet(), id = d.dataset.done;
          if (s.has(id)) s.delete(id); else s.add(id);
          saveRead(s);
          const on = s.has(id);
          d.classList.toggle('on', on); d.textContent = on ? '✓ Read' : 'Mark as read';
          const t = root.querySelector(`[data-toc="${id}"]`); t.classList.toggle('read', on);
          t.querySelector('.n').textContent = on ? '✓' : CH.findIndex((c) => c.id === id) + 1;
          updateReadCount(root);
          return;
        }
        if (e.target.closest('[data-min]')) {
          const box = root.querySelector('#gCheck'); const min = !box.classList.contains('min');
          try { localStorage.setItem('thrift-guide-check', min ? 'min' : ''); } catch (_) { /* ignore */ }
          box.classList.toggle('min', min); e.target.textContent = min ? 'Show' : 'Hide';
          return;
        }
        const a = e.target.closest('a[href^="#g-"]');
        if (a) {
          e.preventDefault();
          const el = root.querySelector(a.getAttribute('href'));
          if (el) { const s = root.querySelector('#gSearch'); if (s.value) { s.value = ''; search(root, ''); } el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        }
      });
      root.querySelector('#gSearch').addEventListener('input', U.debounce((e) => search(root, e.target.value), 120));
      // highlight the chapter in view
      if ('IntersectionObserver' in global) {
        observer = new IntersectionObserver((ents) => {
          ents.forEach((en) => {
            if (!en.isIntersecting) return;
            root.querySelectorAll('[data-toc]').forEach((t) => t.classList.toggle('cur', t.dataset.toc === en.target.dataset.ch));
            const cur = root.querySelector('[data-toc].cur'); const toc = root.querySelector('#gToc');
            if (cur && toc.scrollWidth > toc.clientWidth + 4) toc.scrollTo({ left: cur.offsetLeft - 16, behavior: 'smooth' });
          });
        }, { rootMargin: '-30% 0px -60% 0px' });
        root.querySelectorAll('.g-ch').forEach((c) => observer.observe(c));
      }
    }
    checklist(root, ctxFn).catch((e) => console.error('guide checklist', e));
  };
  Guide.chapters = CH;
  global.Guide = Guide;
})(window);
