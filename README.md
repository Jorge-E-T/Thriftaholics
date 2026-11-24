# Thriftaholics — Inventory & Sales

A private, password-protected inventory, ordering and sales tracker that runs entirely in the browser. It's plain HTML, CSS and JavaScript with no build step and no server. You can host it on GitHub Pages or open it locally.

## Features

- **Guide tab:** a complete illustrated tutorial in 17 chapters, with a setup checklist that ticks itself off, search, “Mark as read” progress and **Show me** buttons that jump to the right screen and highlight the button to press.
- **Inventory grid** with every column from the original spreadsheet: Item Name, Category, SKU, Purchase Price, Selling Price, Status, Platform it sold, Date Posted, Days Active (calculated), Date Sold and Total After Fees. It also adds Fees, Shipping Cost, Profit and Notes.
- **Inline editing:** click any cell to edit it. Tab moves to the next cell, Enter saves, Esc cancels and Ctrl/⌘+Z undoes.
- **Sorting:** click a header to sort by that column. Shift+click adds more columns to the sort.
- **Product photos:** a Photo column sits next to the checkbox. Drag an image onto any row, or click the placeholder to upload. Click a photo to view it full size, replace it, download it or remove it. Photos are resized, encrypted and saved in IndexedDB, and they're included in JSON backups and the Excel report.
- **Resizable table window:** drag the bar under any table to make it shorter or taller, or pick Fit screen, Small, Medium or Large. The horizontal scrollbar stays in view, and the checkbox, photo and Item Name columns stay frozen while you scroll sideways. Row size can be Compact, Comfortable or Large.
- **Platforms tab:** add, edit, hide or delete the platforms you sell on. For each one you can record the selling fee (percent, fixed fee, minimum, price tiers such as Amazon clothing's 5% / 10% / 17%, and a small-order rule such as Poshmark's $2.95 under $15), whether the selling fee and the processing fee also apply to shipping, payment processing (percent, fixed, minimum), listing fees, any number of additional costs (% of sale, $ per sale or $ per month), who usually pays shipping, the typical shipping charge, your own extra shipping cost, a shop link and notes. Each card shows what you'd keep on a $40 sale and the platform's actual results (items listed, sold, gross sales, average fee). A fee calculator compares every platform for any price. Renaming a platform updates every item that uses it.
- **Built-in platforms (US fees as published Nov 2026):** Poshmark, Depop, eBay, Mercari, Facebook Marketplace, Vinted, Amazon, Etsy, Grailed, Whatnot, TikTok Shop, Vestiaire Collective, The RealReal, StockX, OfferUp, Shopify and In person. Each card's notes explain the fee rules and what isn't modeled (boosts, ads, store plans). Fees change, so check them now and then. When you update, new platforms are added automatically and the original presets you never edited get the corrected fees; platforms you edited or added yourself are left alone. Hide the ones you don't use.
- **Cross-list helper:** the share icon on an inventory row, **Cross-list** in an item's details, or **Cross-list…** on the bulk bar. For each site you use it shows the photo to save, a button to open that site's "sell an item" page, the title (trimmed to the site's limit), description (Depop style with hashtags where needed) and price with one-tap Copy buttons, what you'd keep after that site's fees, and a box to paste the new listing link so the item is marked live there. Each platform's sell page, title/description limits and hashtag count are editable under Platforms → Edit.
- **Fee updates:** Platforms → **↻ Check for fee updates** compares your platforms with `platform-fees.json` (in the app's folder) and shows every change old → new. Platforms you edited yourself are left unticked. Updates reach every device through cloud sync. To publish new fees, edit `platform-fees.json` and upload it to the repo.
- **Listed On column:** an item can be listed on several platforms at the same price, each with a link to its listing. Links appear as colored chips with an open (↗) button. Click the cell (or use the item editor) and add sites with **+ Add another site** or the **Quick add** buttons; paste a listing link and the site name is detected from it. The platform filter and search include these listings.
- **Fee estimates on sales:** recording a sale fills in Total After Fees (and your shipping cost, when the platform says you pay it) from the platform's fee settings, and shows the estimate so you can correct it to the actual payout. Bulk "mark sold" can fill in estimates too.
- **Sale celebration:** recording a sale (or switching an item's status to sold) bursts dollar bills across the screen with a SOLD! badge showing the price and profit. It never blocks clicks, plays only the badge if your system asks for reduced motion, and can be turned off or previewed under Settings → Business.
- **Action Center:** one tab for everything that needs you:
  - **Delist needed:** sold items still active on other sites, with links to each listing.
  - **Price drops due:** based on your selling plan (for example −10% at 60 days, −15% at 120, −20% at 180), never below an item's lowest acceptable price.
  - **Refresh / relist reminders.**
  - **Decide:** items older than a year. Bundle, deep-discount, donate (written off at cost in the P&L) or keep for 90 days.
  - **Taxes and backups:** the next estimated-tax payment and your backup status.
- **Bulk repricing and price history:** select items and choose "Change price…" (% off, $ off, set price, % increase, with rounding). Every price change is kept in the item's price history.
- **Cross-listing safety:** each listing has a status (Active, Delisted, Sold or Expired). When an item sells, the listing on that platform becomes Sold, and a delist checklist opens with links to every other site. A red "Delist" tag stays on the item until all are done.
- **Item details:** brand, size, color, condition, measurements, weight, storage location, source, purchase date and lowest acceptable price. Rarely used columns start hidden (see Columns).
- **Listing templates:** copy-ready title and description built from your templates (Settings → Listing templates).
- **What sells / Profit by source:** performance by brand, size, category and source (sell-through, days to sell, profit, ROI). These are in Reports and the Excel report.
- **Labels and scanning:** select items and choose "Print labels" (Avery 5160 or 5163 sheets, or 2×1 in and 4×6 in label printers). Each QR code links to the item, so any phone camera opens it. The scan button in the top bar reads labels in supported browsers.
- **Phone app:** install it from the browser menu ("Add to Home Screen" or "Install app"). It works offline, and "Take photo" opens the camera.
- **Cloud sync (optional, Firebase):** every phone and computer stays in step within seconds. Each person signs in once per device with their own cloud e-mail; only e-mails listed in `firestore.rules` get in. Every record is encrypted with your app password before upload, so Firebase only stores scrambled data. Changes merge record by record (newest edit wins); deletions, photos (as smaller copies), the logo, settings and reset questions sync too. A pill in the top bar shows the status. Setup: fill in `firebase-config.js` and follow the *Cloud Sync Setup Guide*. Don't commit `firestore.rules` to a public repo (it lists your e-mails); paste it into Firebase instead.
- **Backup reminders:** a banner appears when your last backup is older than N days.
- **Taxes and money:**
  - Mileage log, using the IRS rate in effect on each trip's date (2026: 72.5¢, then 76¢ from July 1).
  - Quarterly estimated-tax table with due dates and payments, plus reminders.
  - Sales by platform and year to compare with Form 1099-K (federal threshold: over $20,000 and over 200 transactions).
  - Monthly goals on the Dashboard.
- **Color coding:** sold items are green, fresh items are blue, aging items are amber and stale items are red. You set the aging and stale thresholds in Settings.
- **Filters and search:** search across all text, and filter by status, category, platform or age. You can also show or hide columns.
- **Bulk actions:** mark items sold or available, set the category, duplicate or delete.
- **Orders & Sales:** see every sale with its fees, profit, margin and days to sell. "Record sale" logs a new order from your inventory.
- **Expenses:** track itemized business costs (supplies, postage, subscriptions, mileage and so on).
- **Dashboard:** KPI tiles with change versus the previous period and 12-month sparklines, goal rings, monthly sales and profit, a platform donut, a sales calendar, best sellers with photos, inventory aging, stale items, recent sales, recent activity and a category breakdown.
- **Look and feel:** Thriftaholics brand colors, logo and script wordmark; Light, Dark or Auto (follows the device) from the ☀/🌙 button or Settings → Business; smooth transitions that switch off when the device asks for reduced motion.
- **Views:** Table, Cards or (Inventory only) Gallery, on any screen size. Click a gallery tile, or the ⓘ row button, for the **item details** sheet: large photo, facts, where the money goes, price history chart and a timeline of everything that happened to the item.
- **Branded PDFs:** Reports → **Monthly PDF** (profit summary with daily sales, P&L, platforms and every sale) and **Tax-year PDF** (gross receipts, deductions, expenses, mileage, estimated tax, quarterly payments and 1099-K comparison). Both open the print window; choose “Save as PDF”.
- **Packing slips and thank-you cards:** select items → **Packing slips** (letter page or 4×6 label) or **Thank-you cards** (4×6), or use the buttons in an item's details. They carry your logo and a QR code to your shop link (Settings → Labels → Packing slips & thank-you cards). QR labels carry the brand too.
- **Activity history:** every add, edit, sale, delete, import and undo is recorded with who did it (Settings → Business → *Your name on this device*). Recent activity is on the Dashboard; **View all** filters by person or type and can **Revert** a change. Items show “Last edited by”. With cloud sync on, history is shared between users (encrypted like everything else) and kept for one year. It needs the `activity` line in `firestore.rules`; republish the rules after updating.
- **Reports:** profit and loss, estimated taxes (income, self-employment and optional sales tax) and assets (inventory at cost and at list value), for any date range.
- **Excel export:** a formatted workbook with these sheets: Summary, Sales, Itemized Costs, Assets, Taxes (monthly), Expenses and Full Inventory. It includes live formulas and your logo.
- **Import from other programs:** Restore and Import JSON also accept JSON backups made by other inventory programs. The app finds the records anywhere in the file, even when they're nested or keyed by ID. It matches the old field names to its own columns and reads US, ISO and timestamp dates, values like "$1,234.50" and sold flags written as yes/no or true/false. Fees or profit are turned into Total After Fees, and embedded photos are imported. You review the mapping and a preview with totals before anything is saved. The mapping is remembered for that file format, and re-importing updates matching records instead of duplicating them.
- **Safety snapshots:** a restore point (items, expenses, settings) is saved automatically before every import or restore and the first time you open a new version of the app. The last 10 are kept, encrypted, under Settings → Safety snapshots, where you can restore or download one. Photos stay attached.
- **Excel import:** loads rows straight from the original `Inventory.xlsx` layout.
- **JSON backup and restore:** the backup can be plain or password-encrypted. Restore can replace your data or merge with it.
- **Company logo:** upload a PNG into the header slot. It's stored in the database and used in the Excel report.

## Security model

- When you open the app for the first time, you create a password.
- That password is turned into an AES-256-GCM key using PBKDF2-SHA256 with 310,000 iterations.
- **Every record in IndexedDB is encrypted.** Nothing readable is stored: no items, expenses, settings or logo.
- The key exists only in memory while the app is unlocked. The app locks itself after a period of inactivity, which you can set in Settings, and the 🔒 button locks it right away.
- **No data is ever in the repository.** The repo contains only code. Your data lives in the browser of each device you use.
- **Forgot password:** when you create your password you can add a **hint** (shown on the lock screen after a wrong try) and choose **three reset questions**. On the lock screen, click "Forgot password?", answer **any two** of the questions (capitals, spaces and punctuation don't matter) and choose a new password. Nothing is lost.
  - The questions keep working after a password change. Change them, or the hint, under Settings → Security.
  - With sync on, all your devices share the same questions. After a password change, your other devices ask once for the new password.
  - Without questions set up there's no way back in: the data is encrypted and can't be recovered. Pick answers others can't look up online.

> ⚠️ Do **not** commit your JSON backups or spreadsheets to a public repo. The included `.gitignore` excludes `*.json` backups and `*.xlsx` files.

> Note: anyone can open the app's page on a public repo or Pages site. The password protects the **data**, not the page, and it's the data that's sensitive.

## Updating the app safely

1. Click **Backup** before uploading new files to GitHub (the app also takes an automatic snapshot the first time a new version opens).
2. Upload the new files. If the page looks odd afterwards, do a hard refresh (Ctrl+Shift+R, or ⌘+Shift+R on a Mac), since browsers can cache old files for a few minutes.
3. To bring spreadsheet changes in, use **Import Excel → Update**. It updates matching items in place and never erases platforms, listing links, notes or photos with empty cells. You can import your original sheet or the app's own Excel report (the Full Inventory sheet, including Listed On and Listing Links).

## Getting started

1. Upload the files to a GitHub repo, keeping the folder structure.
2. Enable **Settings → Pages → Deploy from branch (main / root)**.
3. Open the Pages URL. It must be `https://`, or `http://localhost` if you're testing locally. Browsers only allow the encryption API in secure contexts.
4. Create your password.
5. Click **Restore** and choose `inventory-backup-from-spreadsheet.json`, or use **Import Excel** with your `Inventory.xlsx`.

To run it locally, open a terminal in this folder, run `python3 -m http.server 8000`, then open http://localhost:8000.

## Files

```
index.html          App layout
css/styles.css      Styles
js/utils.js         Formatting, dates, modal and toast helpers
js/store.js         Encrypted IndexedDB storage and backup encryption
js/charts.js        Lightweight canvas charts
js/reports.js       Calculations, Excel export and import
js/celebrate.js     Sale celebration animation (canvas)
js/labels.js        QR labels and camera scanning
platform-fees.json  Shared list of published marketplace fees (safe to keep public)
js/guide.js         The Guide tab (tutorial, checklist, search)
js/print.js         Branded PDF reports, packing slips and thank-you cards
js/dash.js          Dashboard drawings (sparklines, rings, calendar, donut)
fonts/pacifico.woff2  Script font for the wordmark (SIL Open Font License)
js/cloud-sync.js    Encrypted Firebase cloud sync (live, per record)
firebase-config.js  Your Firebase project's web settings (fill in once)
firestore.rules     Security rules to paste into Firebase (not needed in the repo)
lib/firebase/       Firebase JavaScript SDK 13.4 (compat build), vendored
sw.js, manifest.webmanifest, icons/   Installable phone app and offline support
lib/qrcode.js       qrcode-generator 1.4.4 (MIT)
js/app.js           Application logic and UI
lib/exceljs.min.js  ExcelJS 4.4.0 (MIT), bundled so the app works offline
```

## Calculations

- **Days Active** = Date Sold (or today, if unsold) − Date Posted
- **Fees** = Selling Price − Total After Fees
- **Profit** = Total After Fees − Purchase Price − Shipping Cost
- **Gross sales** = the sum of Selling Price for sold items in the period
- **Net profit** = Net sales − COGS − Shipping − Operating expenses
- **Self-employment tax estimate** = Net profit × 92.35% × the SE rate
- **Income tax estimate** = Net profit × the income tax rate
- **Assets** = unsold items (not sold or donated), valued at purchase cost and at list price

Tax figures are planning estimates only.
