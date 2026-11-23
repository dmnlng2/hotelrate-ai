# HotelRate AI V2

HotelRate AI is an educational dynamic pricing simulator for a fictional 100-room luxury resort in Costa Smeralda, Sardinia. It shows how a simple pricing policy changes a room rate as occupancy, season and demand vary.

## Run locally

1. Place `index.html`, `style.css`, `script.js` and `README.md` in the same folder.
2. Open `index.html` in a modern web browser by double-clicking it.
3. Change the scenario inputs to recalculate automatically, or select **Calculate rate**. **Reset** restores the default scenario.

The app works offline and requires no installation, server, framework, external API or backend.

## Features and technologies

- Enter room inventory, booked rooms, base rate in EUR, season and demand. Validation checks whole-number room counts, booked rooms within inventory and a non-negative base rate in euros and cents.
- See occupancy, the suggested nightly rate, the percentage change from the base rate and the three factors used in the calculation.
- Explore illustrative average daily rate (ADR), revenue per available room (RevPAR) and room revenue.
- Browse a simulated monthly pricing calendar, starting in August 2027. Choose a month and year to see each day's suggested nightly rate and occupancy.
- `index.html` defines the dashboard, `style.css` controls the responsive layout and `script.js` implements the pricing logic, validation and display updates.

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

The suggested nightly rate is the base rate multiplied by the three factors and rounded to cents. The percentage difference is the suggested rate minus the base rate, divided by the base rate. Edit `PRICING_RULES` in `script.js` to experiment. If you change the occupancy thresholds, keep the bands in ascending order and update their labels.

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
