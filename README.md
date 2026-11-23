# HotelRate AI V3.1

HotelRate AI includes an educational dynamic pricing simulator for a fictional 100-room luxury resort in Costa Smeralda, Sardinia, and a separate daily hotel data import.

## Run locally

1. Keep the repository files together, including `hotel-import.js` and `sample-hotel-data.csv`.
2. Open `index.html` in a modern web browser by double-clicking it.
3. Open **Rate Simulator** and change the scenario inputs to recalculate automatically, or select **Calculate rate**. **Reset** restores the default scenario.

**Overview** summarizes the current simulated scenario. **Pricing Calendar** shows daily estimates and saved date overrides. Workspace links can be bookmarked and work with browser back and forward.

The app works offline and requires no installation, server, framework, external API or backend.

## Daily hotel data import

Open **Data Import**. Download [the sample CSV](sample-hotel-data.csv) or select your own file. The browser validates every record and previews up to the first 50 in file order. Select **Confirm Import** to replace the current import with all validated records. An invalid file is rejected in full, and the error identifies the first problem and its CSV line when applicable.

V3.1 accepts comma-delimited UTF-8 `.csv` files up to 1 MiB (1,048,576 bytes). A UTF-8 BOM, LF and CRLF line endings, quoted fields and doubled quotes inside quoted fields are supported. Use one header row with the exact column names below in any order. Additional columns are allowed and ignored after parsing. Each row must have the same field count as the header. Blank records are rejected.

| Required column | Meaning and validation |
| --- | --- |
| `date` | Stay date as a valid calendar date in strict `YYYY-MM-DD` format. |
| `available_rooms` | Positive whole number within JavaScript's safe integer range. |
| `rooms_sold` | Whole number from zero through `available_rooms`. |
| `room_revenue` | Finite, nonnegative EUR amount excluding VAT and ancillary services. Use a period for decimals and omit currency symbols, thousands separators and spaces. Must be zero if `rooms_sold` is zero. |
| `snapshot_date` | Date the figures were recorded, in the same strict calendar format. |

Each `date` and `snapshot_date` pair must be unique within the file. Separate snapshots for the same stay date are allowed. For stay dates after today in the browser's local time zone, `room_revenue` represents booked room value. For past stays, the source data should contain room revenue as recorded at the snapshot. The import does not verify accounting records.

Occupancy is rooms sold divided by available rooms. ADR is the EUR amount divided by rooms sold and displays as **N/A** with zero bookings. RevPAR is the EUR amount divided by available rooms. For future stays, ADR and RevPAR use booked room value.

### Privacy and retention

The browser reads files locally. The app sends no file or imported data to a server. Preview and confirmed data live only in page memory and are cleared on refresh or close. The import uses neither of the V2 `localStorage` keys and has no effect on simulated prices or calendar edits. The simulator's **Reset** applies to its own scenario.

### Test the import locally

1. Open `index.html` directly in a browser and go to **Data Import**. Select **Download sample CSV**, then choose that file.
2. Check for four preview rows. The first shows 72% occupancy, €150.00 ADR and €108.00 RevPAR. The second shows 0% occupancy, N/A ADR and €0.00 RevPAR. The last two share a stay date and have different snapshot dates. While that stay date is in the future, they show **Booked room value**.
3. Click **Confirm Import**. The table changes to **Imported data** and the button disables. Make a copy of the sample and change the first data row's `rooms_sold` to `101`. Select that copy and check that the error identifies CSV row 2, the button remains disabled and the confirmed import stays visible.
4. Set the simulator to 72 bookings, €500 base rate, High season and Normal demand. Check that it suggests €660.00. Save a simulated date edit, then refresh. Verify the import has cleared and the simulator inputs and calendar edit are restored. Click **Reset** and verify the main scenario returns to its defaults while the date edit remains.
5. With Node.js 18 or later, run `node --test tests/hotel-import.test.js` from the repository root. The suite requires no dependencies.

## Automated tests

With Node.js 24 and npm, run these commands from the repository root:

```sh
npm ci
npx playwright install --only-shell chromium
npm test
```

`npm run test:unit` runs the pricing and CSV unit tests using Node's built-in test runner. `npm run test:e2e` starts a local HTTP server and runs the browser tests in headless Chromium. Playwright is the only direct development dependency, and the application has no npm runtime dependencies.

If the default test port (4173) is already in use, set `HOTELRATE_TEST_PORT` to a free port when running the tests.

GitHub Actions runs both suites on every push and pull request and installs Chromium's Linux system dependencies.

## Features and technologies

- Enter room inventory, booked rooms, base rate in EUR, season and demand. Validation checks whole-number room counts, booked rooms within inventory and a non-negative base rate in euros and cents.
- See occupancy, the suggested nightly rate, the percentage change from the base rate and the three factors used in the calculation.
- Explore illustrative average daily rate (ADR), revenue per available room (RevPAR) and room revenue.
- Browse a simulated monthly pricing calendar, starting in August 2027. Choose a month and year to see each day's suggested nightly rate and occupancy.
- `index.html` defines the dashboard, `style.css` controls the responsive layout and `pricing.js` contains the pricing rules and calculations, and `script.js` handles validation and display updates.

## Main scenario defaults and local storage

The initial scenario has 100 total rooms, 0 booked rooms, a €0.00 base rate, Shoulder season (×1.00) and Normal demand (×1.00). At €0.00, the simulator prompts for a positive base rate and hides the nightly pricing results. The calendar still shows simulated occupancy and allows date edits, with a dash in place of each nightly price.

The browser automatically saves the last valid main scenario to `localStorage`, including a base rate of zero. The app validates the saved scenario on load and uses the defaults when saved data is missing or invalid. **Reset** restores and saves the defaults while retaining the separately stored calendar edits.

## Simulated monthly calendar

Each date starts with the current scenario's room inventory, booked rooms, base rate, season and demand. Select a date, edit its booked rooms and demand, then choose **Save date**. Saved values override those two scenario inputs for that date. Inventory, base rate and season still follow the main scenario.

Date edits are stored in this browser using `localStorage` and restored when you reopen the page from the same location, subject to browser storage settings. If storage is unavailable, edits remain available until you reload or close the page. **Reset** restores the main scenario defaults and retains saved date edits. If inventory falls below a date's saved bookings, the simulation caps that date's bookings at the current inventory while retaining the saved count for when capacity increases again.

The calendar uses the same pricing rules as the single-night simulator and applies a **1.10 multiplier on Friday and Saturday**, before rounding the rate to cents. All other dates use 1.00. The single-night simulator keeps its original formula. With the example scenario below, Friday 6 August 2027 shows €726.00 and Sunday 8 August shows €660.00, both at 72% simulated occupancy.

## Pricing rules

Occupancy is booked rooms divided by total rooms. The model uses the unrounded occupancy ratio to choose the band.

| Factor | Scenario | Multiplier |
| --- | --- | ---: |
| Occupancy | Under 40% | 0.90 |
| Occupancy | 40% to under 70% | 1.00 |
| Occupancy | 70% to under 90% | 1.10 |
| Occupancy | 90% and above | 1.25 |
| Season | Low | 0.85 |
| Season | Shoulder | 1.00 |
| Season | High | 1.20 |
| Season | Peak | 1.40 |
| Demand | Low | 0.90 |
| Demand | Normal | 1.00 |
| Demand | High | 1.15 |

The suggested nightly rate is the base rate multiplied by the three factors and rounded to cents. The percentage difference is the suggested rate minus the base rate, divided by the base rate. Edit `PRICING_RULES` in `pricing.js` to experiment. If you change the occupancy thresholds, keep the bands in ascending order and update their labels.

A scenario with 72 bookings out of 100 rooms, a €500 base rate, high season and normal demand produces 72% occupancy and a €660.00 suggestion, 32% above the base rate.

## Metric assumptions and limitations

The scenario covers one night. Each booked room is hypothetically sold at the rounded suggested rate. Unsold rooms earn zero, and room revenue excludes taxes, fees and extras.

| Metric | Calculation |
| --- | --- |
| Scenario room revenue | Booked rooms × suggested nightly rate |
| Scenario ADR | Scenario room revenue ÷ booked rooms. Undefined with zero bookings. |
| Scenario RevPAR | Scenario room revenue ÷ total rooms |

Scenario ADR equals the suggested nightly rate when at least one room is booked because the scenario assumes a uniform price. Historical ADR requires actual room revenue and rooms sold. With zero bookings and a positive base rate, occupancy, room revenue and RevPAR are zero, and ADR displays as N/A.

Inputs and multipliers are hypothetical. Season and demand are selected manually. The tool provides a fixed-rule illustration and offers no AI predictions or market-validated optimal prices. The model omits competitor rates, booking pace, lead time and the effect of a price change on the number of bookings. A sold-out scenario shows the rule's implied price with no rooms available to sell.
