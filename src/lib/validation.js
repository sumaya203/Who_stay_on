export function validateRequest(body) {
  const errors = [];
  
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, errors: ["Request body must be a JSON object"] };
  }

  // grid_available
  if (!Array.isArray(body.grid_available) || body.grid_available.length !== 10) {
    errors.push("grid_available must be an array of exactly 10 booleans");
  } else if (!body.grid_available.every(x => typeof x === 'boolean')) {
    errors.push("grid_available must contain only booleans (not 0/1)");
  }

  // generator_capacity_kw
  if (!Number.isInteger(body.generator_capacity_kw) || body.generator_capacity_kw <= 0) {
    errors.push("generator_capacity_kw must be a positive integer");
  }

  // fuel_budget_litres
  if (typeof body.fuel_budget_litres !== 'number' || body.fuel_budget_litres < 0) {
    errors.push("fuel_budget_litres must be a nonnegative number");
  } else {
    // Check for max 2 decimal places
    const str = body.fuel_budget_litres.toString();
    if (str.includes('.')) {
      const decimals = str.split('.')[1];
      if (decimals.length > 2) {
        errors.push("fuel_budget_litres cannot have more than 2 decimal places");
      }
    }
  }

  // max_consecutive_dark
  if (!Number.isInteger(body.max_consecutive_dark) || body.max_consecutive_dark < 0) {
    errors.push("max_consecutive_dark must be a nonnegative integer");
  }

  // fuel_table
  if (!Array.isArray(body.fuel_table) || body.fuel_table.length === 0) {
    errors.push("fuel_table must be a non-empty array");
  } else {
    let prevLoad = -1;
    let reachedCapacity = false;
    for (let i = 0; i < body.fuel_table.length; i++) {
      const entry = body.fuel_table[i];
      if (!Number.isInteger(entry.load_kw) || entry.load_kw <= 0) {
        errors.push(`fuel_table[${i}].load_kw must be a positive integer`);
      }
      if (entry.load_kw <= prevLoad) {
        errors.push(`fuel_table[${i}].load_kw must be strictly increasing`);
      }
      prevLoad = entry.load_kw;

      if (typeof entry.litres_per_hour !== 'number' || entry.litres_per_hour < 0) {
        errors.push(`fuel_table[${i}].litres_per_hour must be a nonnegative number`);
      } else {
        const str = entry.litres_per_hour.toString();
        if (str.includes('.') && str.split('.')[1].length > 2) {
           // problem says "exact decimal arithmetic", let's assume max 2 decimals per problem standard or just validate it's valid numeric. The instructions say "excessive decimal precision" shouldn't be allowed. Let's limit to 2 or check if JS float representation is exact. We will limit to 2.
           if (str.split('.')[1].length > 2) {
             errors.push(`fuel_table[${i}].litres_per_hour cannot have excessive decimal precision (max 2)`);
           }
        }
      }
      
      if (entry.load_kw >= body.generator_capacity_kw) {
        reachedCapacity = true;
      }
    }
    if (!reachedCapacity && prevLoad !== -1 && body.generator_capacity_kw) {
      errors.push("fuel_table coverage must end at or above generator_capacity_kw");
    }
  }

  // shops
  if (!Array.isArray(body.shops)) {
    errors.push("shops must be an array");
  } else if (body.shops.length > 12) {
    errors.push("at most 12 shops are allowed");
  } else {
    const shopIds = new Set();
    for (let i = 0; i < body.shops.length; i++) {
      const shop = body.shops[i];
      if (typeof shop.id !== 'string' || shop.id.trim() === '') {
        errors.push(`shops[${i}].id must be a nonblank string`);
      } else {
        if (shopIds.has(shop.id)) {
          errors.push(`duplicate shop id: ${shop.id}`);
        }
        shopIds.add(shop.id);
      }

      if (!Number.isInteger(shop.kw) || shop.kw <= 0) {
        errors.push(`shop ${shop.id} kw must be a positive integer`);
      }

      if (shop.type !== "mandatory" && shop.type !== "normal") {
        errors.push(`shop ${shop.id} type must be 'mandatory' or 'normal'`);
      }

      if (!Array.isArray(shop.value_per_slot) || shop.value_per_slot.length !== 10) {
        errors.push(`shop ${shop.id} value_per_slot must be an array of exactly 10 entries`);
      } else {
        for (let j = 0; j < shop.value_per_slot.length; j++) {
          if (!Number.isInteger(shop.value_per_slot[j]) || shop.value_per_slot[j] < 0) {
            errors.push(`shop ${shop.id} value_per_slot[${j}] must be a nonnegative integer`);
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}