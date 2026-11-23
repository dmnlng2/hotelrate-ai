# HotelRate AI

HotelRate AI is an educational dynamic pricing simulator for a fictional 100-room luxury resort in Costa Smeralda, Sardinia. It shows how a simple pricing policy changes a room rate as occupancy, season and demand vary.

## Run locally

1. Place `index.html`, `style.css`, `script.js` and `README.md` in the same folder.
2. Open `index.html` in a modern web browser by double-clicking it.
3. Change the scenario inputs to recalculate automatically, or select **Calculate rate**. **Reset** restores the default scenario.

The app works offline and requires no installation, server, framework, external API or backend.

## Features and technologies

- Enter room inventory, booked rooms, base rate in EUR, season and demand. Validation checks whole-number room counts, booked rooms within inventory and a positive rate in euros and cents.
- See occupancy, the suggested nightly rate, the percentage change from the base rate and the three factors used in the calculation.
- Explore illustrative average daily rate (ADR), revenue per available room (RevPAR) and room revenue.
- `index.html` defines the dashboard, `style.css` controls the responsive layout and `script.js` implements the pricing logic, validation and display updates.

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

The default example uses 72 bookings out of 100 rooms, a €500 base rate, high season and normal demand. It produces 72% occupancy and a €660.00 suggestion, 32% above the base rate.

## Metric assumptions and limitations

The scenario covers one night. Each booked room is hypothetically sold at the rounded suggested rate. Unsold rooms earn zero, and room revenue excludes taxes, fees and extras.

| Metric | Calculation |
| --- | --- |
| Scenario room revenue | Booked rooms × suggested nightly rate |
| Scenario ADR | Scenario room revenue ÷ booked rooms. Undefined with zero bookings. |
| Scenario RevPAR | Scenario room revenue ÷ total rooms |

Scenario ADR equals the suggested nightly rate when at least one room is booked because the scenario assumes a uniform price. Historical ADR requires actual room revenue and rooms sold. With zero bookings, room revenue and RevPAR are zero.

Inputs and multipliers are hypothetical. Season and demand are selected manually. The tool provides a fixed-rule illustration and offers no AI predictions or market-validated optimal prices. The model omits competitor rates, booking pace, lead time and the effect of a price change on the number of bookings. A sold-out scenario shows the rule's implied price with no rooms available to sell.
