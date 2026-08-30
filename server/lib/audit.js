// Self-audit — runs on every calculation. Returns a list of checks the baker
// can see, and an overall accuracy downgrade when something is off.

import { ACC } from './accuracy.js';
import { money } from './labels.js';

// calc  = output of calcEngine.calculate()
// price = output of cost.priceBake()  (optional)
export function auditCalculation(calc, price) {
  const checks = [];
  const add = (level, title, detail) => checks.push({ level, title, detail });
  const cur = price?.currency || 'GBP';
  const m = (n) => (n == null ? '—' : money(n, cur));

  // 1. implied batter density realistic for the fill % used?
  const dens = calc.impliedDensity;
  const calibrated = calc.densitySource === 'calibration';
  const fillPct = calc.fill?.pct;
  const fillLabel = Array.isArray(fillPct) ? `${fillPct[0]}–${fillPct[1]}%` : 'generic';
  if (dens == null) {
    add('warn', 'Batter density', 'Could not compute an implied batter density.');
  } else if (calibrated) {
    // A real measured yield is ground truth. Only flag if the measurement itself
    // is physically implausible (would need density > 1.05 even at 100% fill).
    const k = calc.calibrationKPerMl;
    if (k > 1.05 || k < 0.45) {
      add('warn', 'Measured yield looks unusual',
        `Calibrated yield is ${k} g batter per mL of pan volume. That is outside the usual 0.45–1.0 range — double-check the pan volumes and batter weight you logged.`);
    } else if (dens > 1.05 || dens < 0.85) {
      add('warn', 'Measured yield vs generic fill',
        `Your calibrated yield (${k} g/mL) implies a batter density of ${dens} g/mL if the fill matched this cake type's generic ${fillLabel} table. The real bake likely just fills fuller/less than the table — the measurement is used, this is only a heads-up.`);
    } else {
      add('ok', 'Batter density', `Calibrated yield ${k} g/mL — consistent with a ~${dens} g/mL batter at this cake type's fill level.`);
    }
  } else if (dens < 0.85 || dens > 1.05) {
    add('fail', 'Batter density out of range',
      `Implied batter density is ${dens} g/mL, outside the realistic 0.85–1.05 g/mL band for the fill % used. ` +
      `Either the pan dimensions/fill are off, or this recipe genuinely bakes denser/lighter — calibrate against a real bake.`);
  } else {
    add('ok', 'Batter density', `Implied ${dens} g/mL — within the realistic 0.85–1.05 g/mL band.`);
  }

  // 2. scaling factor inside the safe linear range 0.25x - 4x?
  const sf = calc.scalingFactor?.mid;
  if (sf == null) {
    add('warn', 'Scaling factor', 'No scaling factor computed.');
  } else if (sf < 0.25 || sf > 4) {
    add('fail', 'Scaling beyond the safe linear range',
      `This target is ${sf}x the master recipe — outside 0.25x–4x. Leavening, bake time and structure do not scale linearly this far. ` +
      `Treat every downstream number as REQUIRES TESTING and bake a trial before quoting commercially.`);
  } else {
    add('ok', 'Scaling factor', `${sf}x the master recipe — inside the safe 0.25x–4x linear range.`);
  }

  // 3. egg practicality
  if (calc.eggAdvice?.fractional) {
    const e = calc.eggAdvice;
    add(e.warnRounding ? 'fail' : 'warn', 'Fractional eggs',
      `Scaled egg = ${e.exactGrams} g (${e.exactCount} eggs). ${e.guidance}` +
      (e.warnRounding ? ` Rounding to ${e.roundedCount} shifts egg:base by ${e.ratioShiftPct}% (> 5%).` : ''));
  } else if (calc.eggAdvice) {
    add('ok', 'Eggs', calc.eggAdvice.guidance);
  }

  // 4. pan assumptions surfaced
  if (calc.pan?.assumptions?.length) {
    add('warn', 'Assumed pan dimensions',
      `The following were not given and were assumed: ${calc.pan.assumptions.join('; ')}.`);
  }

  // 5. price monotonic with tier, and rising with cost
  if (price) {
    const { minimum, standard, premium } = price.prices;
    if ([minimum, standard, premium].every((v) => v != null)) {
      if (minimum <= standard && standard <= premium) {
        add('ok', 'Price tiers ordered', `Minimum ${minimum} <= Standard ${standard} <= Premium ${premium}.`);
      } else {
        add('fail', 'Price tiers not ordered',
          `Minimum ${minimum}, Standard ${standard}, Premium ${premium} — a higher margin produced a lower price. Check the margin percentages.`);
      }
    } else {
      add('warn', 'Prices incomplete', 'One or more tiers could not be priced (missing margin or hourly rate).');
    }
    if (!price.complete) {
      const e = price.estimate || {};
      const pricedPct = e.unpricedWeightPct != null ? Math.round(100 - e.unpricedWeightPct) : null;
      let range;
      if (price.pricesEstimated) {
        const floor = price.pricesFloor?.standard;
        const est = price.pricesEstimated?.standard;
        const uplift = (floor != null && est != null && floor > 0)
          ? Math.round(((est - floor) / floor) * 100)
          : null;
        range = `Standard tier: firm floor ${m(floor)}, likely ${m(est)}`
          + (uplift != null ? ` — the estimate is about +${uplift}% (${m(est - floor)}) above the floor.` : '.');
      } else {
        range = 'Ingredient cost cannot be estimated — no priced ingredients to base it on.';
      }
      const level = (e.accuracy === ACC.REQUIRES_TESTING) ? 'fail' : 'warn';
      add(level, 'Price is an ESTIMATE, not firm',
        (e.missingIngredientPrices?.length
          ? `${pricedPct != null ? `${pricedPct}% of` : 'Some of'} the ingredient weight is priced; no saved price for: ${e.missingIngredientPrices.join(', ')}. `
          : '') +
        (e.missingLabour ? 'Hourly rate or labour minutes not set (labour counted as £0). ' : '') +
        range + ' Add the missing prices for a firm quote.');
    }
  }

  const worst = checks.reduce((acc, c) => (c.level === 'fail' ? 'fail' : (c.level === 'warn' && acc !== 'fail' ? 'warn' : acc)), 'ok');
  const overallAccuracy =
    worst === 'fail' ? ACC.REQUIRES_TESTING
    : worst === 'warn' ? ACC.ESTIMATED
    : (calc.batter?.accuracy || ACC.ESTIMATED);

  return { checks, worst, overallAccuracy };
}
