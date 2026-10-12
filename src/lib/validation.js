/**
 * The single source of truth for the POST /api/roster request contract.
 *
 * The API route and the dashboard both call into this module, so the field
 * names, types and messages can never drift apart between the two sides.
 *
 * `validateRequest(body)` keeps the documented response shape
 * ({ valid, errors: string[] }) used by the route and the tests.
 * `inspectRequest(body)` returns the same verdict plus field-tagged issues
 * ({ field, message }) so the UI can show every message next to the field
 * that produced it BEFORE anything is submitted.
 */

const FIELDS = [
  'grid_available',
  'generator_capacity_kw',
  'fuel_budget_litres',
  'max_consecutive_dark',
  'fuel_table',
  'shops',
];

/** Every documented top-level field, in contract order. */
export const REQUEST_FIELDS = FIELDS;

function collectIssues(body) {
  const issues = [];
  const push = (field, message) => issues.push({ field, message });

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    push('_body', 'Request body must be a JSON object');
    return issues;
  }

  // grid_available
  if (!Array.isArray(body.grid_available) || body.grid_available.length !== 10) {
    push('grid_available', 'grid_available must be an array of exactly 10 booleans');
  } else if (!body.grid_available.every((x) => typeof x === 'boolean')) {
    push('grid_available', 'grid_available must contain only booleans (not 0/1)');
  }

  // generator_capacity_kw
  if (!Number.isInteger(body.generator_capacity_kw) || body.generator_capacity_kw <= 0) {
    push('generator_capacity_kw', 'generator_capacity_kw must be a positive integer');
  }

  // fuel_budget_litres
  if (typeof body.fuel_budget_litres !== 'number' || !Number.isFinite(body.fuel_budget_litres) || body.fuel_budget_litres < 0) {
    push('fuel_budget_litres', 'fuel_budget_litres must be a nonnegative number');
  } else {
    // Check for max 2 decimal places
    const str = body.fuel_budget_litres.toString();
    if (str.includes('.')) {
      const decimals = str.split('.')[1];
      if (decimals.length > 2) {
        push('fuel_budget_litres', 'fuel_budget_litres cannot have more than 2 decimal places');
      }
    }
  }

  // max_consecutive_dark
  if (!Number.isInteger(body.max_consecutive_dark) || body.max_consecutive_dark < 0) {
    push('max_consecutive_dark', 'max_consecutive_dark must be a nonnegative integer');
  }

  // fuel_table
  if (!Array.isArray(body.fuel_table) || body.fuel_table.length === 0) {
    push('fuel_table', 'fuel_table must be a non-empty array');
  } else {
    let prevLoad = -1;
    let reachedCapacity = false;
    for (let i = 0; i < body.fuel_table.length; i++) {
      const entry = body.fuel_table[i];
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        push('fuel_table', `fuel_table[${i}] must be an object with load_kw and litres_per_hour`);
        continue;
      }
      if (!Number.isInteger(entry.load_kw) || entry.load_kw <= 0) {
        push('fuel_table', `fuel_table[${i}].load_kw must be a positive integer`);
      } else if (entry.load_kw <= prevLoad) {
        push('fuel_table', `fuel_table[${i}].load_kw must be strictly increasing`);
      }
      if (Number.isInteger(entry.load_kw) && entry.load_kw > prevLoad) {
        prevLoad = entry.load_kw;
      }

      if (typeof entry.litres_per_hour !== 'number' || !Number.isFinite(entry.litres_per_hour) || entry.litres_per_hour < 0) {
        push('fuel_table', `fuel_table[${i}].litres_per_hour must be a nonnegative number`);
      } else {
        const str = entry.litres_per_hour.toString();
        if (str.includes('.') && str.split('.')[1].length > 2) {
          push('fuel_table', `fuel_table[${i}].litres_per_hour cannot have excessive decimal precision (max 2)`);
        }
      }

      if (Number.isInteger(entry.load_kw) && entry.load_kw >= body.generator_capacity_kw) {
        reachedCapacity = true;
      }
    }
    if (!reachedCapacity && prevLoad !== -1 && body.generator_capacity_kw) {
      push('fuel_table', 'fuel_table coverage must end at or above generator_capacity_kw');
    }
  }

  // shops
  if (!Array.isArray(body.shops)) {
    push('shops', 'shops must be an array');
  } else if (body.shops.length > 12) {
    push('shops', 'at most 12 shops are allowed');
  } else {
    const shopIds = new Set();
    for (let i = 0; i < body.shops.length; i++) {
      const shop = body.shops[i];
      if (!shop || typeof shop !== 'object' || Array.isArray(shop)) {
        push('shops', `shops[${i}] must be an object with id, kw, type and value_per_slot`);
        continue;
      }
      if (typeof shop.id !== 'string' || shop.id.trim() === '') {
        push('shops', `shops[${i}].id must be a nonblank string`);
      } else {
        if (shopIds.has(shop.id)) {
          push('shops', `duplicate shop id: ${shop.id}`);
        }
        shopIds.add(shop.id);
      }

      if (!Number.isInteger(shop.kw) || shop.kw <= 0) {
        push('shops', `shop ${shop.id} kw must be a positive integer`);
      }

      if (shop.type !== 'mandatory' && shop.type !== 'normal') {
        push('shops', `shop ${shop.id} type must be 'mandatory' or 'normal'`);
      }

      if (!Array.isArray(shop.value_per_slot) || shop.value_per_slot.length !== 10) {
        push('shops', `shop ${shop.id} value_per_slot must be an array of exactly 10 entries`);
      } else {
        for (let j = 0; j < shop.value_per_slot.length; j++) {
          if (!Number.isInteger(shop.value_per_slot[j]) || shop.value_per_slot[j] < 0) {
            push('shops', `shop ${shop.id} value_per_slot[${j}] must be a nonnegative integer`);
          }
        }
      }
    }
  }

  return issues;
}

/**
 * Strict validation used by the API route. The message strings are part of the
 * documented HTTP contract and must not change.
 */
export function validateRequest(body) {
  const issues = collectIssues(body);
  return {
    valid: issues.length === 0,
    errors: issues.map((issue) => issue.message),
  };
}

/**
 * The same verdict with every message tagged with the request field that
 * produced it, so the dashboard can render the errors next to the relevant
 * fields instead of dumping an unstructured wall of text.
 */
export function inspectRequest(body) {
  const issues = collectIssues(body);
  return {
    valid: issues.length === 0,
    errors: issues.map((issue) => issue.message),
    issues,
  };
}
