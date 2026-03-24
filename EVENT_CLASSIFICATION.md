# Event Classification System

## Overview

The `classifyEvent()` function provides a centralized, reliable way to classify user actions from API logs with strict priority rules to prevent misclassifications.

## Function Signature

```javascript
classifyEvent(log) → { action, product_id?, product_name?, search_term?, filter_price?, filter_city? }
```

## Classification Rules (STRICT PRIORITY ORDER)

### STEP 1: Ignore Internal APIs ⚠️ HIGHEST PRIORITY
**Condition:** `fk_activity_id === 4597`
```javascript
returns: { action: "ignore" }
```
These logs are completely filtered out before analysis.

---

### STEP 2: Image View 📷 HIGH PRIORITY
**Prevents misclassification as enquiry**

**Conditions (ALL must match):**
- `fk_activity_id === 4257`
- `flag === 16`
- `ctaType === "Image"`

```javascript
returns: {
  action: "view_image",
  product_id: string | null,
  product_name: string | null
}
```

> **Why HIGH PRIORITY?** Image clicks must never become enquiry clicks. This check runs BEFORE enquiry classification.

---

### STEP 3: Enquiry Intent 💬
**Conditions (ALL must match):**
- `fk_activity_id === 4243`
- `flag === 12`
- `ctaType === "Product Enquiry"`

```javascript
returns: {
  action: "enquiry",
  product_id: string | null,
  product_name: string | null
}
```

> **Note:** Only triggered if NOT already classified as image view.

---

### STEP 4: Search & Filters 🔍
**Condition:** `fk_activity_id === 677`

Automatically classifies as either "search" or "filter_applied" based on URL parameters:

#### Sub-cases:
1. **Filter Applied** - if URL contains ANY of: `minprice`, `maxprice`, `cq`, or `ct=pf`
   ```javascript
   returns: {
     action: "filter_applied",
     search_term: string | null,
     filter_price: "min - max" | undefined,
     filter_city: string | undefined
   }
   ```

2. **Search** - no filter parameters found
   ```javascript
   returns: {
     action: "search",
     search_term: string | null
   }
   ```

---

### STEP 5: Default Fallback 🤷
**Condition:** None of the above conditions match

```javascript
returns: { action: "unknown" }
```

---

## Usage Examples

### Example 1: Classify Image View
```javascript
const log = {
  fk_activity_id: 4257,
  flag: 16,
  ctaType: "Image",
  modref_id: "12345",
  s_prod_name: "Cotton T-Shirt"
};

const result = classifyEvent(log);
// result: {
//   action: "view_image",
//   product_id: "12345",
//   product_name: "Cotton T-Shirt"
// }
```

### Example 2: Classify Enquiry
```javascript
const log = {
  fk_activity_id: 4243,
  flag: 12,
  ctaType: "Product Enquiry",
  modref_id: "67890",
  s_prod_name: "Steel Pipe"
};

const result = classifyEvent(log);
// result: {
//   action: "enquiry",
//   product_id: "67890",
//   product_name: "Steel Pipe"
// }
```

### Example 3: Classify Search with Filters
```javascript
const log = {
  fk_activity_id: 677,
  request_url: "https://www.indiamart.com/search?ss=cotton&minprice=100&maxprice=500&cq=mumbai"
};

const result = classifyEvent(log);
// result: {
//   action: "filter_applied",
//   search_term: "cotton",
//   filter_price: "100 - 500",
//   filter_city: "mumbai"
// }
```

### Example 4: Classify Plain Search (No Filters)
```javascript
const log = {
  fk_activity_id: 677,
  request_url: "https://www.indiamart.com/search?ss=plastic+bags"
};

const result = classifyEvent(log);
// result: {
//   action: "search",
//   search_term: "plastic bags"
// }
```

### Example 5: Ignore Internal API
```javascript
const log = {
  fk_activity_id: 4597,
  request_url: "https://www.indiamart.com/api/internal/cache"
};

const result = classifyEvent(log);
// result: { action: "ignore" }
```

---

## Integration in Log Processing

The function is already integrated into the main log enrichment pipeline:

```javascript
const enrichedSteps = dedupedLogs.map((log, index) => {
  // ... timestamp calculations ...
  
  // Classify event using centralized classification function
  const eventClassification = classifyEvent(log);
  
  // Use the classification in your business logic:
  if (eventClassification.action === 'view_image') {
    // Handle image view
  } else if (eventClassification.action === 'enquiry') {
    // Handle enquiry
  } else if (eventClassification.action === 'filter_applied') {
    // Handle filtered search
  } else if (eventClassification.action === 'search') {
    // Handle plain search
  } else if (eventClassification.action === 'ignore') {
    // Skip processing
  }
  
  const step = {
    step: index + 1,
    session: sessionId,
    time: formatDisplayTime(log.datevalue),
    classified_action: eventClassification.action,
    // ... other properties ...
  };
});
```

---

## Key Principles

### 1. **Do NOT rely only on `request_url`**
Always check `fk_activity_id`, `flag`, and `ctaType` first.

### 2. **Strict Priority Order**
Each rule is evaluated in order. Once a condition matches, no further rules are evaluated.

### 3. **Flexible Parameter Extraction**
The function safely handles:
- Missing or malformed URLs
- Missing parameters in request_url
- Null/undefined values
- Case variations in parameter names

### 4. **Prevent Misclassification**
Image clicks (`ctaType === "Image"`) are checked BEFORE enquiry to prevent false positives.

---

## Log Object Properties

The function expects a log object with these optional properties:

| Property | Type | Description |
|----------|------|-------------|
| `fk_activity_id` | number | Activity ID from the API (critical) |
| `flag` | number | Flag value from the API (required for 4257, 4243) |
| `ctaType` | string | CTA type: "Image", "Product Enquiry", etc. |
| `request_url` | string | Full URL from the API request |
| `modref_id` | string | Product module reference ID |
| `product_disp_id` | string | Alternative product display ID |
| `s_prod_name` | string | Product name/title |
| `fk_display_title` | string | Display title from the API |

---

## Testing Checklist

- [ ] Image clicks are never classified as enquiry
- [ ] Filters are correctly detected in search URLs
- [ ] Search terms are properly extracted from URL parameters
- [ ] Internal APIs (4597) are ignored
- [ ] All URL parameters are properly decoded
- [ ] Missing parameters default to null, not undefined

---

## Future Enhancements

- Add custom rule registration
- Support for more activity types
- Batch classification performance
- Classification confidence scoring

