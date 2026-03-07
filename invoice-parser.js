/**
 * Invoice Parser for Highland Media Services Inventory
 * 
 * Supports:
 *   - eBay order confirmations (PDF)
 *   - Amazon order details (PDF)
 *   - B&H Photo invoices (PDF)
 * 
 * Each parser extracts items and maps them to the inventory taxonomy.
 */

// ── Category keyword mapping ────────────────────────────────────────────────
// Maps product keywords to { category, subcategory } in the inventory taxonomy.
// Order matters: more specific matches should come first.

const CATEGORY_RULES = [
  // Audio
  { pattern: /press\s*box|mult\s*box|splitter.*audio/i, cat: 'audio', sub: 'signal_processors' },
  { pattern: /microphone|mic\b|sm58|sm57|sm7b|e835|beta\s*58|shotgun\s*mic|lavalier|lav\b|wireless.*mic/i, cat: 'audio', sub: 'microphones' },
  { pattern: /speaker|loudspeaker|qsc|jbl.*prx|jbl.*eon|powered.*speaker|pa\s*speaker|monitor.*speaker/i, cat: 'audio', sub: 'speakers' },
  { pattern: /mixer|console|soundcraft|behringer.*x|allen.*heath|yamaha.*mg|mackie/i, cat: 'audio', sub: 'mixers' },
  { pattern: /di\s*box|direct.*box|compressor|equalizer|crossover|dbx|signal.*process/i, cat: 'audio', sub: 'signal_processors' },
  { pattern: /audio.*recorder|zoom.*h[0-9]|tascam|field.*recorder/i, cat: 'audio', sub: 'recorders' },
  { pattern: /whirlwind|press.*box|pb[0-9]/i, cat: 'audio', sub: 'signal_processors' },

  // Video Display
  { pattern: /projector|epson.*pro|christie|barco|optoma/i, cat: 'video_display', sub: 'projectors' },
  { pattern: /projection.*screen|screen.*tripod|screen.*frame|da-lite/i, cat: 'video_display', sub: 'screens' },
  { pattern: /display|tv\b|monitor.*display|flat.*panel|led.*wall/i, cat: 'video_display', sub: 'displays' },
  { pattern: /video.*switcher|atem|roland.*v-|switcher/i, cat: 'video_display', sub: 'switchers' },
  { pattern: /converter.*hdmi|converter.*sdi|hdmi.*sdi|sdi.*hdmi|micro.*converter|decimator/i, cat: 'video_display', sub: 'converters' },

  // Video Production
  { pattern: /ptz.*camera|video.*camera|camcorder|sony.*pxw|sony.*fx|canon.*c[0-9]|blackmagic.*camera/i, cat: 'video_production', sub: 'video_cameras' },
  { pattern: /tripod|fluid.*head|manfrotto.*tripod|sachtler|benro.*tripod/i, cat: 'video_production', sub: 'tripods' },
  { pattern: /video.*lens|cinema.*lens|zoom.*lens/i, cat: 'video_production', sub: 'lenses' },
  { pattern: /video.*recorder|hyperdeck|atomos|ninja|shogun/i, cat: 'video_production', sub: 'video_recorders' },
  { pattern: /field.*monitor|video.*monitor|small.*hd|lilliput|atomos.*monitor/i, cat: 'video_production', sub: 'monitors' },
  { pattern: /ssd|solid.*state.*drive|samsung.*t[0-9]|cfexpress|cfast/i, cat: 'video_production', sub: 'ssd_storage' },
  { pattern: /v-mount|battery.*plate|np-f|battery.*charger.*video|idx|anton.*bauer/i, cat: 'video_production', sub: 'batteries_power' },
  { pattern: /super.*clamp|magic.*arm|articulating.*arm|c-stand|grip.*head|manfrotto.*035|manfrotto.*037|cheese.*plate|ball.*head.*mount/i, cat: 'video_production', sub: 'rigging' },
  { pattern: /cage|rail|follow.*focus|matte.*box|rig\b/i, cat: 'video_production', sub: 'rigging' },

  // Lighting
  { pattern: /light.*fixture|led.*panel|aputure|litepanel|fresnel|ellipsoidal|par.*can|leko/i, cat: 'lighting', sub: 'fixtures' },
  { pattern: /dmx|lighting.*console|lighting.*control|dimmer/i, cat: 'lighting', sub: 'control' },
  { pattern: /softbox|diffusion|gel|barn.*door|snoot|modifier|scrim/i, cat: 'lighting', sub: 'modifiers' },

  // Livestreaming
  { pattern: /web.*presenter|encoder|livestream|stream.*deck|teradek|pearl/i, cat: 'livestreaming', sub: 'encoders' },
  { pattern: /capture.*card|elgato|magewell|decklink/i, cat: 'livestreaming', sub: 'capture' },

  // Photo
  { pattern: /photo.*camera|dslr|mirrorless|canon.*r[0-9]|nikon.*z[0-9]|sony.*a[0-9]|canon.*eos/i, cat: 'photo', sub: 'cameras' },
  { pattern: /photo.*lens|ef\s*\d|rf\s*\d|prime.*lens|50mm|85mm|24-70|70-200/i, cat: 'photo', sub: 'lenses' },

  // Computing
  { pattern: /computer|laptop|macbook|playback.*system|imac|mac.*mini/i, cat: 'computing', sub: 'playback' },
  { pattern: /network.*switch|router|ethernet|wireless.*access|ubiquiti/i, cat: 'computing', sub: 'networking' },

  // Cables
  { pattern: /hdmi.*cable|sdi.*cable|displayport.*cable/i, cat: 'cables', sub: 'video' },
  { pattern: /xlr.*cable|1\/4.*cable|trs.*cable|audio.*cable|snake/i, cat: 'cables', sub: 'audio' },
  { pattern: /dmx.*cable|powercon.*cable/i, cat: 'cables', sub: 'lighting' },
  { pattern: /usb.*cable|cat[56].*cable|ethernet.*cable|thunderbolt/i, cat: 'cables', sub: 'computer' },
  { pattern: /power.*cable|extension.*cord|ac.*cable|power.*strip|surge/i, cat: 'cables', sub: 'ac_power' },
  { pattern: /adapter|converter.*cable|coupler|barrel/i, cat: 'cables', sub: 'adapters' },

  // Accessories
  { pattern: /charger|charging/i, cat: 'accessories', sub: 'chargers' },

  // Consumables
  { pattern: /gaffer.*tape|electrical.*tape|console.*tape/i, cat: 'consumables', sub: 'tape' },
  { pattern: /battery|batteries|aa\b|aaa\b/i, cat: 'consumables', sub: 'batteries' },

  // Transport
  { pattern: /road.*case|flight.*case|pelican|skb.*case/i, cat: 'transport', sub: 'cases' },
  { pattern: /bag|backpack|carrying/i, cat: 'transport', sub: 'bags' },
  { pattern: /cart|dolly/i, cat: 'transport', sub: 'carts' },

  // Staging
  { pattern: /stage|riser|platform|deck/i, cat: 'staging', sub: 'staging' },
  { pattern: /truss|rigging.*hardware/i, cat: 'staging', sub: 'trussing' },
  { pattern: /pipe.*drape|drape|backdrop/i, cat: 'staging', sub: 'pipe_drape' },

  // Misc accessories catch-all for video production
  { pattern: /manfrotto|kupo|smallrig|tilta/i, cat: 'video_production', sub: 'misc_acc' },
  { pattern: /stud|spigot|plate|mount|bracket|clamp/i, cat: 'video_production', sub: 'misc_acc' },
];

function categorizeItem(name) {
  const normalized = name.replace(/[^a-zA-Z0-9\s\-\/]/g, ' ');
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(normalized) || rule.pattern.test(name)) {
      return { category: rule.cat, subcategory: rule.sub };
    }
  }
  // Default: accessories
  return { category: 'accessories', subcategory: '' };
}


// ── Source Detection ────────────────────────────────────────────────────────

function detectSource(text) {
  if (/ebay/i.test(text) && /items\s*bought\s*from/i.test(text)) return 'ebay';
  if (/amazon\.com/i.test(text) && /order\s*#?\s*\d{3}-\d{7}-\d{7}/i.test(text)) return 'amazon';
  if (/b\s*&\s*h|bhphoto|B&H|BNH_invoice/i.test(text) && /order\s*(?:no|#)/i.test(text)) return 'bh';
  // PayPal receipts (Reverb, KEH, etc.)
  if (/paypal/i.test(text) && /purchase\s*details/i.test(text)) return 'paypal';
  // Best Buy receipts
  if (/best\s*buy/i.test(text)) return 'bestbuy';
  // MPB
  if (/mpb\s*us\s*inc|bought\s*from\s*mpb/i.test(text)) return 'mpb';
  // Georgia Expo / vendor invoices with ITEM NUMBER / ORDERED / SHIPPED columns
  if (/georgiaexpo/i.test(text)) return 'vendor';
  if (/ITEM\s*NUMBER.*UNIT.*(?:ORDERED|PRICE).*(?:SHIPPED|AMOUNT)/i.test(text)) return 'vendor';
  // Smushed GE header: "ITEM NUMBERUNITPRICEAMOUNTORDEREDSHIPPEDBACK ORDERED"
  if (/ITEM\s*NUMBERUNIT/i.test(text)) return 'vendor';
  // AGI-style: ITEM# DESCRIPTION QTY UNIT EACH AMOUNT (spaced or smushed)
  if (/ITEM#\s*DESCRIPTION\s*(?:QTY|UNIT)/i.test(text)) return 'vendor';
  // Generic vendor with BILL TO + item table
  if (/BILL\s*TO:[\s\S]*SHIP\s*TO:/i.test(text) && /ITEM#/i.test(text)) return 'vendor';
  // Fallback heuristics
  if (/seller.*vicati|buyer.*mdbeme|ebay.*order/i.test(text)) return 'ebay';
  if (/amazon\.com.*order|shipped\s*on.*items\s*ordered/i.test(text)) return 'amazon';
  if (/420\s*ninth\s*avenue|bhphoto|BLCVCMIC|payboo|BNH_invoice/i.test(text)) return 'bh';
  if (/reverb\.com/i.test(text)) return 'paypal';
  if (/keh\.com|keh,?\s*inc/i.test(text)) return 'paypal';
  return null;
}


// ── eBay Parser ─────────────────────────────────────────────────────────────
// pdf-parse often smushes eBay columns together with no spaces, e.g.:
// "1Whirlwind PB6- 1 Line In to 12 Mic Out Passive Press Box (316395756714)UPS Ground Saver$112.50"

function parseEbay(text) {
  const items = [];
  const orderMatch = text.match(/order\s*number:\s*([\d\-]+)/i);
  const orderNumber = orderMatch ? orderMatch[1] : '';
  // Date may be smushed: "Placed onMar 5, 2025"
  const dateMatch = text.match(/(?:placed\s*on|paid\s*on)\s*(\w+\s+\d{1,2},?\s+\d{4})/i);
  const purchaseDate = dateMatch ? normalizeDate(dateMatch[1]) : '';

  const fullText = text.replace(/\n/g, ' ');

  // Strategy 1: Smushed format — qty glued to name, ebay ID in parens, shipping glued, then $price
  const smushRegex = /(\d+)([A-Z][\w\s\-\.\/\(\)#,&+]*?)\s*\((\d{9,})\)([A-Za-z\s]+?)\$(\d+[\d,.]*)/g;
  let match;
  while ((match = smushRegex.exec(fullText)) !== null) {
    const qty = parseInt(match[1]) || 1;
    let name = match[2].trim().replace(/\s+/g, ' ');
    const price = parseFloat(match[5].replace(/,/g, ''));
    if (/^Item\s*name|^Quantity/i.test(name)) continue;
    if (name.length < 3) continue;
    const cat = categorizeItem(name);
    items.push({
      name, quantity: qty, purchase_cost: price,
      replacement_value: 0, purchase_date: purchaseDate,
      condition: 'excellent', notes: `eBay Order: ${orderNumber}`,
      ...cat
    });
  }

  // Strategy 2: Spaced format (some PDFs may extract with proper spacing)
  if (items.length === 0) {
    const spacedRegex = /(\d+)\s+([\w][\w\s\-\.\/\(\)#,&+]+?)\s*\(\d{9,}\)\s+[\w\s]+?\$(\d+[\d,.]*)/g;
    while ((match = spacedRegex.exec(fullText)) !== null) {
      const qty = parseInt(match[1]) || 1;
      let name = match[2].trim().replace(/\s+/g, ' ');
      const price = parseFloat(match[3].replace(/,/g, ''));
      if (name.length < 3) continue;
      const cat = categorizeItem(name);
      items.push({
        name, quantity: qty, purchase_cost: price,
        replacement_value: 0, purchase_date: purchaseDate,
        condition: 'excellent', notes: `eBay Order: ${orderNumber}`,
        ...cat
      });
    }
  }

  // Strategy 3: Line-by-line fallback — look for lines with item pattern
  if (items.length === 0) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const itemPattern = /^(\d+)\s+(.+?)\s*\((\d+)\)\s+.+?\$(\d+[\d,.]*)/;
    for (const line of lines) {
      const m = line.match(itemPattern);
      if (m) {
        const qty = parseInt(m[1]) || 1;
        const name = m[2].trim();
        const price = parseFloat(m[4].replace(/,/g, ''));
        if (name.length < 3) continue;
        const cat = categorizeItem(name);
        items.push({
          name, quantity: qty, purchase_cost: price,
          replacement_value: 0, purchase_date: purchaseDate,
          condition: 'excellent', notes: `eBay Order: ${orderNumber}`,
          ...cat
        });
      }
    }
  }

  return { source: 'ebay', orderNumber, purchaseDate, items };
}


// ── Amazon Parser ───────────────────────────────────────────────────────────

function parseAmazon(text) {
  const items = [];
  const orderMatch = text.match(/order\s*(?:number|#)[:\s]*([\d\-]+)/i);
  const orderNumber = orderMatch ? orderMatch[1] : '';
  const dateMatch = text.match(/order\s*placed:\s*(\w+\s+\d{1,2},?\s+\d{4})/i);
  const purchaseDate = dateMatch ? normalizeDate(dateMatch[1]) : '';

  // Amazon format: "1 of: Item Name (Model)\nSold by: ...\nCondition: New\n$XX.XX"
  // or "Items Ordered Price" followed by item blocks
  
  // Pattern 1: "N of: <item name>\n...\n$price"
  const blocks = text.split(/(?=\d+\s+of:)/i);
  
  for (const block of blocks) {
    const itemMatch = block.match(/(\d+)\s+of:\s*(.+?)(?:\s*\(#?[\w\-]+\))?\s*$/m);
    if (!itemMatch) continue;
    
    const qty = parseInt(itemMatch[1]) || 1;
    let name = itemMatch[2].trim();
    // Clean up the name
    name = name.replace(/\s+/g, ' ').trim();
    
    // Find price for this block
    const priceMatch = block.match(/\$(\d+[\d,.]*)\s*$/m);
    const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : 0;
    
    if (name && name.length > 2) {
      const cat = categorizeItem(name);
      items.push({
        name,
        quantity: qty,
        purchase_cost: price,
        replacement_value: 0,
        purchase_date: purchaseDate,
        condition: 'excellent',
        notes: `Amazon Order: ${orderNumber}`,
        ...cat
      });
    }
  }

  return { source: 'amazon', orderNumber, purchaseDate, items };
}


// ── B&H Photo Parser ────────────────────────────────────────────────────────
// pdf-parse extracts B&H invoices with quantities, descriptions, and prices
// on separate lines. This parser collects them independently then correlates.

function parseBH(text) {
  const items = [];
  // Order number: "Order No.:894307079" or "Order #1080440263"
  const orderMatch = text.match(/order\s*(?:no\.?:|#)\s*(\d+)/i);
  const orderNumber = orderMatch ? orderMatch[1] : '';
  // Date: "Invoice Date 07/06/22" or "March 1, 2022" (web format)
  const dateMatch = text.match(/(?:invoice|order)\s*date\s*(\d{2}\/\d{2}\/\d{2,4})/i);
  let purchaseDate = dateMatch ? normalizeDateSlash(dateMatch[1]) : '';
  if (!purchaseDate) {
    const longDate = text.match(/((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})/i);
    if (longDate) purchaseDate = normalizeDate(longDate[1]);
  }

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Find the header line that starts the item table
  const headerIdx = lines.findIndex(l => /Qty\s*Ord.*Item\s*Description/i.test(l));
  if (headerIdx > -1) {

  const afterHeader = lines.slice(headerIdx + 1);

  // Find where items end (payment/subtotal section)
  const endIdx = afterHeader.findIndex(l => /^(?:Payment\s*Type|Sub-Total|Total\s*Order)/i.test(l));
  const itemSection = endIdx > -1 ? afterHeader.slice(0, endIdx) : afterHeader;

  // Collect quantities, descriptions, prices, and metadata separately
  const quantities = [];
  const descriptions = [];
  const prices = [];
  const serials = {};
  const usedItems = new Set();

  for (const line of itemSection) {
    // Standalone quantity (just a number, 1-3 digits)
    if (/^\d{1,3}$/.test(line)) {
      quantities.push(parseInt(line));
      continue;
    }
    // Price line ($XX.XX)
    if (/^\$[\d,.]+$/.test(line)) {
      prices.push(parseFloat(line.replace(/[$,]/g, '')));
      continue;
    }
    // Serial number
    const serialMatch = line.match(/^SERIAL\s*#?:?\s*([\w\-]+)/i);
    if (serialMatch) {
      if (descriptions.length > 0) serials[descriptions.length - 1] = serialMatch[1];
      continue;
    }
    // USED marker
    if (/^USED:/i.test(line)) {
      if (descriptions.length > 0) usedItems.add(descriptions.length - 1);
      continue;
    }
    // Skip known non-item lines (salesperson codes, short SKUs, MFR codes)
    if (/^(?:Salesperson|WB$|\()/i.test(line)) continue;
    if (/^[A-Z]{2,}[\w]*$/.test(line) && line.length < 15) continue;
    // Skip noise: separator lines, notices, closure messages
    if (/^-{3,}$/.test(line)) continue;
    if (/^\*{3,}$/.test(line)) continue;
    if (/^PLEASE\s*NOTE/i.test(line)) continue;
    if (/^We\s*will\s/i.test(line)) continue;

    // Product description: uppercase text with spaces, 10+ chars
    if (/^[A-Z][A-Z0-9\s\-\/\.\,\&\#\(\)]+$/.test(line) && line.length >= 10) {
      descriptions.push(line.replace(/\s{2,}/g, ' ').trim());
    }
  }

  // B&H prices come grouped: all unit prices first, then all line totals
  const numItems = descriptions.length;
  const unitPrices = prices.slice(0, numItems);

  for (let i = 0; i < numItems; i++) {
    // Quantities come in pairs: qty_ord, qty_ship per item
    const qty = quantities[i * 2 + 1] || quantities[i * 2] || 1;
    const unitPrice = unitPrices[i] || 0;

    let name = descriptions[i];
    let notes = `B&H Order: ${orderNumber}`;
    if (serials[i]) notes += ` | S/N: ${serials[i]}`;
    const condition = usedItems.has(i) ? 'good' : 'excellent';

    // Clean name
    name = name.replace(/\s+USED:\s*\d+/i, '').trim();

    const cat = categorizeItem(name);
    items.push({
      name,
      quantity: qty,
      purchase_cost: unitPrice,
      replacement_value: 0,
      purchase_date: purchaseDate,
      condition,
      notes,
      ...cat
    });
  }
  } // end traditional B&H format

  // ─── Format 2: B&H Web Order History ───
  // "STATUSQTYUNIT PRICE" header, then "Item Name BH# SKU Status Qty$Price"
  if (items.length === 0 && /STATUSQTYUNIT\s*PRICE/i.test(text)) {
    const afterHeader = text.split(/STATUSQTYUNIT\s*PRICE/i)[1] || '';
    const itemRegex = /\s*(.+?)\s+BH#\s*([\w]+)\s+[\w\s\-]+?(\d+)\$([\d,.]+)/g;
    let m;
    while ((m = itemRegex.exec(afterHeader)) !== null) {
      const name = m[1].trim();
      const sku = m[2];
      const qty = parseInt(m[3]) || 1;
      const price = parseFloat(m[4].replace(/,/g, ''));
      const cat = categorizeItem(name);
      items.push({
        name, quantity: qty, purchase_cost: price,
        replacement_value: 0, purchase_date: purchaseDate,
        condition: 'excellent',
        notes: `B&H Order: ${orderNumber} | BH#: ${sku}`,
        ...cat
      });
    }
  }

  return { source: 'bh', orderNumber, purchaseDate, items };
}


// ── PayPal Receipt Parser ──────────────────────────────────────────────────
// Handles PayPal transaction receipts from Reverb.com, KEH, and other sellers.
// These have a "Purchase details" section with item name and price.

function parsePaypal(text) {
  const items = [];

  // Get seller name from "Seller info" section
  const sellerMatch = text.match(/Seller\s*info\s*\n(.+?)$/m);
  const seller = sellerMatch ? sellerMatch[1].trim() : '';

  // Transaction ID
  const txMatch = text.match(/Transaction\s*ID\s*\n([\w]+)/i);
  const txId = txMatch ? txMatch[1] : '';

  // Invoice ID
  const invMatch = text.match(/Invoice\s*ID\s*\n([\w\-]+)/i);
  const invoiceId = invMatch ? invMatch[1] : '';

  // Date: "May 26, 2022 · Payment"
  const dateMatch = text.match(/(\w+\s+\d{1,2},?\s+\d{4})\s*[·:]\s*Payment/i);
  const purchaseDate = dateMatch ? normalizeDate(dateMatch[1]) : '';

  // Extract "Purchase details" section
  const detailsMatch = text.match(/Purchase\s*details\s*\n([\s\S]*?)(?:Shipping|Tax|Total|\n\n)/i);

  if (detailsMatch) {
    const detailLines = detailsMatch[1].trim().split('\n').map(l => l.trim()).filter(Boolean);

    const nameParts = [];
    let itemPrice = 0;

    for (const line of detailLines) {
      if (/^purchase\s*amount$/i.test(line)) continue;
      if (/^\$[\d,.]+$/.test(line)) {
        itemPrice = parseFloat(line.replace(/[$,]/g, ''));
        continue;
      }
      nameParts.push(line);
    }

    // Fallback price: try multiple strategies
    if (itemPrice === 0) {
      // Strategy 1: price right after Transaction ID line
      const nearTx = text.match(/Transaction\s*ID\s*\n[\w]+\s*\n\$?([\d,.]+)/i);
      if (nearTx) itemPrice = parseFloat(nearTx[1].replace(/,/g, ''));
    }
    if (itemPrice === 0) {
      // Strategy 2: "- $XX.XX" at top (PayPal total)
      const topAmount = text.match(/-\s*\$([\d,.]+)/);
      if (topAmount) itemPrice = parseFloat(topAmount[1].replace(/,/g, ''));
    }
    if (itemPrice === 0) {
      // Strategy 3: first $ amount in the whole doc
      const anyPrice = text.match(/\$([\d,.]+)/);
      if (anyPrice) itemPrice = parseFloat(anyPrice[1].replace(/,/g, ''));
    }

    const itemName = nameParts.join(' ').trim();

    if (itemName) {
      const cat = categorizeItem(itemName);
      items.push({
        name: itemName,
        quantity: 1,
        purchase_cost: itemPrice,
        replacement_value: 0,
        purchase_date: purchaseDate,
        condition: 'good',
        notes: `${seller} | PayPal TX: ${txId}`,
        ...cat
      });
    } else if (itemPrice > 0) {
      // No item name (KEH style) — use seller name as placeholder
      items.push({
        name: `${seller} Purchase`,
        quantity: 1,
        purchase_cost: itemPrice,
        replacement_value: 0,
        purchase_date: purchaseDate,
        condition: 'good',
        notes: `${seller} Invoice: ${invoiceId} | PayPal TX: ${txId}`,
        category: '',
        subcategory: ''
      });
    }
  }

  return { source: 'paypal', orderNumber: txId || invoiceId, purchaseDate, items };
}


// ── Best Buy Receipt Parser ────────────────────────────────────────────────
// Handles Best Buy register receipts. Items appear as:
// "SKU#  MODEL#  PRICE" followed by a description line.

function parseBestBuy(text) {
  const items = [];

  // Date: "05/18/22 15:53"
  const dateMatch = text.match(/(\d{2}\/\d{2}\/\d{2})\s+\d{2}:\d{2}/);
  const purchaseDate = dateMatch ? normalizeDateSlash(dateMatch[1]) : '';

  // Store number
  const storeMatch = text.match(/Best\s*Buy\s*#(\d+)/i);
  const storeNum = storeMatch ? storeMatch[1] : '';

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match SKU line: "6392464 NS-PG08591 29.99"
    const skuLine = line.match(/^(\d{5,})\s+([\w\-]+)\s+(\d+\.\d{2})$/);
    if (skuLine) {
      const sku = skuLine[1];
      const model = skuLine[2];
      const price = parseFloat(skuLine[3]);

      // Next line is the item description
      let name = '';
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        if (!/^(Sales\s*Tax|Subtotal|Total|\*)/i.test(nextLine)) {
          name = nextLine;
        }
      }

      if (!name) name = model;
      if (/^sales\s*tax|^subtotal|^total/i.test(name)) continue;

      const cat = categorizeItem(name);
      items.push({
        name,
        quantity: 1,
        purchase_cost: price,
        replacement_value: 0,
        purchase_date: purchaseDate,
        condition: 'excellent',
        notes: `Best Buy #${storeNum} | SKU: ${sku} | Model: ${model}`,
        ...cat
      });
    }
  }

  return { source: 'bestbuy', orderNumber: storeNum, purchaseDate, items };
}


// ── MPB Parser ─────────────────────────────────────────────────────────────
// Handles MPB.com sale invoices. Items in "BOUGHT FROM MPB" table with
// MODEL, SKU, CONDITION, TAX RATE, GROSS AMOUNT columns.

function parseMPB(text) {
  const items = [];

  // MPB PDFs are sometimes image-based and pdf-parse extracts no text
  if (text.trim().length < 50) {
    return {
      source: 'mpb',
      orderNumber: '',
      purchaseDate: '',
      items: [],
      warning: 'MPB invoice appears to be image-based. pdf-parse could not extract text. Please enter items manually.'
    };
  }

  const dateMatch = text.match(/Invoice\s*date:\s*(\d{2}\/\d{2}\/\d{4})/i);
  const purchaseDate = dateMatch ? normalizeDateISO(dateMatch[1]) : '';

  const invMatch = text.match(/Invoice\s*number:\s*([\w\-]+)/i);
  const invoiceNumber = invMatch ? invMatch[1] : '';

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Find "BOUGHT FROM MPB" section
  const startIdx = lines.findIndex(l => /BOUGHT\s*FROM\s*MPB/i.test(l));
  if (startIdx === -1) return { source: 'mpb', orderNumber: invoiceNumber, purchaseDate, items };

  const endIdx = lines.findIndex((l, i) => i > startIdx && /^SHIPPING$/i.test(l));
  const itemLines = lines.slice(startIdx + 1, endIdx > -1 ? endIdx : undefined);

  for (const line of itemLines) {
    if (/^MODEL\s/i.test(line)) continue;
    // Pattern: name ... sku(digits) ... condition ... percentage ... price
    const m = line.match(/^(.+?)\s+(\d{4,})\s+([\w\s]+?)\s+\d+%\s+([\d,.]+)$/);
    if (m) {
      const name = m[1].trim();
      const sku = m[2];
      const condText = m[3].trim();
      const price = parseFloat(m[4].replace(/,/g, ''));

      let cond = 'good';
      if (/excellent|like\s*new/i.test(condText)) cond = 'excellent';
      else if (/well\s*used|heavily/i.test(condText)) cond = 'fair';

      const cat = categorizeItem(name);
      items.push({
        name,
        quantity: 1,
        purchase_cost: price,
        replacement_value: 0,
        purchase_date: purchaseDate,
        condition: cond,
        notes: `MPB Invoice: ${invoiceNumber} | SKU: ${sku} | Condition: ${condText}`,
        ...cat
      });
    }
  }

  return { source: 'mpb', orderNumber: invoiceNumber, purchaseDate, items };
}


// ── Vendor Invoice Parser ──────────────────────────────────────────────────
// Handles structured vendor invoices. pdf-parse smushes columns together, so
// we use validation (qty * unitPrice ≈ amount) to find correct splits.
// Supports: Georgia Expo (ITEM NUMBER/UNIT/PRICE/AMOUNT/ORDERED/SHIPPED/BACK ORDERED)
//           Audio General (ITEM#/DESCRIPTION/UNIT/QTY/EACH/AMOUNT)

function parseVendor(text) {
  const items = [];

  // ── Invoice number ──
  const invMatch = text.match(/([\d]{5,}-IN)\b/) || text.match(/NUMBER\s*\n(\d+)/i);
  let invoiceNumber = invMatch ? invMatch[1] : '';
  if (!invoiceNumber) {
    const alt = text.match(/Invoice\s*Number:\s*\n?([\w\-]+)/i);
    if (alt && alt[1] !== 'Invoice') invoiceNumber = alt[1];
  }

  // ── Date ──
  let purchaseDate = '';
  const dateMatchTop = text.match(/DATE\s*\n(\d{1,2}\/\d{1,2}\/\d{4})/i);
  if (dateMatchTop) purchaseDate = normalizeDateISO(dateMatchTop[1]);
  if (!purchaseDate) {
    const geDateMatch = text.match(/HIGH\d+(\d{1,2}\/\d{1,2}\/\d{4})/);
    if (geDateMatch) purchaseDate = normalizeDateISO(geDateMatch[1]);
  }
  if (!purchaseDate) {
    const lines2 = text.split('\n');
    for (let j = 0; j < lines2.length; j++) {
      if (/Invoice\s*Date:/i.test(lines2[j])) {
        for (let k = 0; k <= 3 && j + k < lines2.length; k++) {
          const nearby = lines2[j + k].match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
          if (nearby) {
            purchaseDate = nearby[1].split('/')[2].length === 4
              ? normalizeDateISO(nearby[1])
              : normalizeDateSlash(nearby[1]);
            break;
          }
        }
        if (purchaseDate) break;
      }
    }
  }
  if (!purchaseDate) {
    const shipDate = text.match(/SHIP\s*DATE\s*\n?(\d{1,2}\/\d{1,2}\/\d{4})/i);
    if (shipDate) purchaseDate = normalizeDateISO(shipDate[1]);
  }

  // ── Vendor name ──
  const vendorDomain = text.match(/www\.([\w]+)\.com/i);
  const vendorHeader = text.match(/^([A-Z][\w\s]+(?:INCORPORATED|INC\.?|LLC|CORP\.?))/m);
  const vendor = vendorHeader ? vendorHeader[1].trim() : (vendorDomain ? vendorDomain[1] : '');
  const vendorLabel = vendor || 'Vendor';

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // ─── Format 1: Georgia Expo smushed ───
  // "D90079.980.002.002.00EACH39.99" = ITEM+AMOUNT+BACKORD+QTY_ORD+QTY_SHIP+EACH|EA+UNIT_PRICE
  const hasGEHeader = lines.some(l => /ITEM\s*NUMBER.*UNIT/i.test(l));
  if (hasGEHeader) {
    const headerIdx = lines.findIndex(l => /ITEM\s*NUMBER/i.test(l));
    for (let i = (headerIdx > -1 ? headerIdx + 1 : 0); i < lines.length; i++) {
      const line = lines[i];
      const m = line.match(/^(.+?)(EACH|EA)([\d,.]+)$/);
      if (!m) {
        if (/^Net\s*Invoice|^Shipping|^\$/i.test(line)) break;
        continue;
      }
      const leftPart = m[1];
      const unitPrice = parseFloat(m[3].replace(/,/g, ''));
      let bestResult = null;
      for (let splitAt = 1; splitAt <= Math.min(15, leftPart.length - 10); splitAt++) {
        const tryItemNum = leftPart.substring(0, splitAt);
        if (/[,.]$/.test(tryItemNum)) continue;
        const remainder = leftPart.substring(splitAt);
        const nums = [...remainder.matchAll(/(\d{1,3}(?:,\d{3})*\.\d{2})/g)]
          .map(x => parseFloat(x[1].replace(/,/g, '')));
        if (nums.length < 3) continue;
        const qtyShip = Math.round(nums[nums.length - 1]);
        const amount = nums[0];
        if (qtyShip > 0 && Math.abs(qtyShip * unitPrice - amount) < 0.02) {
          bestResult = { itemNum: tryItemNum, qtyShip }; break;
        }
      }
      if (!bestResult) continue;
      let name = '';
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        if (!/^[\w\-]+.*(?:EACH|EA)[\d,.]+$/.test(nextLine) && !/^Net\s*Invoice|^\$/i.test(nextLine)) {
          name = nextLine; i++;
        }
      }
      if (!name) name = bestResult.itemNum;
      const cat = categorizeItem(name);
      items.push({
        name, quantity: bestResult.qtyShip, purchase_cost: unitPrice,
        replacement_value: 0, purchase_date: purchaseDate, condition: 'excellent',
        notes: `${vendorLabel} Invoice: ${invoiceNumber} | Item#: ${bestResult.itemNum}`,
        ...cat
      });
    }
  }

  // ─── Format 2: AGI smushed ───
  // "ITEM#DESCRIPTIONUNITQTYEACHAMOUNT" then "0600-7230Panasonic..." then "E23,518.007,036.00"
  if (items.length === 0) {
    const agiHeaderIdx = lines.findIndex(l => /^ITEM#\s*DESCRIPTION/i.test(l));
    if (agiHeaderIdx > -1) {
      let i = agiHeaderIdx + 1;
      while (i < lines.length) {
        const line = lines[i];
        const itemStart = line.match(/^([\d][\d\-]+)\s*([A-Za-z].+)/);
        if (!itemStart) {
          if (/^\$|^SUBTOTAL|^SALES\s*TAX|^TOTAL|^PAYMENT|^AMOUNT\s*DUE/i.test(line)) break;
          i++; continue;
        }
        const itemNum = itemStart[1];
        let descParts = [itemStart[2]];
        let j = i + 1;
        let parsedQty = null;
        while (j < lines.length) {
          const nextLine = lines[j];
          const smushed = nextLine.match(/^([A-Z]{0,2})(\d+)([\d,]+\.\d{2})([\d,]+\.\d{2})$/);
          if (smushed) {
            const rawQty = smushed[2], rawUnit = smushed[3], rawAmount = smushed[4];
            for (let qLen = 1; qLen <= rawQty.length; qLen++) {
              const tryQty = parseInt(rawQty.substring(0, qLen));
              const tryUp = parseFloat((rawQty.substring(qLen) + rawUnit).replace(/,/g, ''));
              const tryAmt = parseFloat(rawAmount.replace(/,/g, ''));
              if (Math.abs(tryQty * tryUp - tryAmt) < 0.02) {
                parsedQty = { qty: tryQty, unitPrice: tryUp }; break;
              }
            }
            if (!parsedQty) {
              parsedQty = { qty: parseInt(rawQty[0]), unitPrice: parseFloat((rawQty.substring(1) + rawUnit).replace(/,/g, '')) };
            }
            break;
          }
          const spaced = nextLine.match(/^(\d+)\s+([\d,.]+)\s+([\d,.]+)/);
          if (spaced) { parsedQty = { qty: parseInt(spaced[1]) || 1, unitPrice: parseFloat(spaced[2].replace(/,/g, '')) }; break; }
          if (/^[\d][\d\-]+\s*[A-Za-z]/.test(nextLine)) break;
          if (/^\$|^SUBTOTAL|^SALES\s*TAX|^TOTAL/i.test(nextLine)) break;
          descParts.push(nextLine);
          j++;
        }
        if (parsedQty) {
          const fullDesc = descParts.join(' ').trim();
          let notes = `${vendorLabel} Invoice: ${invoiceNumber} | Item#: ${itemNum}`;
          const snMatch = fullDesc.match(/S\/N:\s*([\w,\s]+?)$/i);
          if (snMatch) notes += ` | S/N: ${snMatch[1].trim()}`;
          let name = fullDesc.replace(/,?\s*S\/N:\s*[\w,\s]+$/i, '').replace(/,\s*$/, '').trim();
          const cat = categorizeItem(name);
          items.push({
            name, quantity: parsedQty.qty, purchase_cost: parsedQty.unitPrice,
            replacement_value: 0, purchase_date: purchaseDate, condition: 'excellent',
            notes, ...cat
          });
          i = j + 1;
        } else { i = j || i + 1; }
      }
    }
  }

  return { source: 'vendor', orderNumber: invoiceNumber, purchaseDate, items };
}



// ── Date Helpers ────────────────────────────────────────────────────────────

function normalizeDate(str) {
  // "March 5, 2025" or "November 7, 2025" → "2025-03-05"
  try {
    const d = new Date(str);
    if (isNaN(d)) return '';
    return d.toISOString().slice(0, 10);
  } catch { return ''; }
}

function normalizeDateSlash(str) {
  // "01/27/26" → "2026-01-27" or "12/16/2025" → "2025-12-16"
  try {
    const parts = str.split('/');
    if (parts.length !== 3) return '';
    let [mm, dd, yy] = parts;
    if (yy.length === 2) yy = (parseInt(yy) > 50 ? '19' : '20') + yy;
    return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  } catch { return ''; }
}

function normalizeDateISO(str) {
  // "01/21/2025" (MM/DD/YYYY with 4-digit year) → "2025-01-21"
  try {
    const parts = str.split('/');
    if (parts.length !== 3) return '';
    return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  } catch { return ''; }
}


// ── B&H Name Cleanup ────────────────────────────────────────────────────────
// B&H uses abbreviated all-caps names. Try to make them more readable.
const BH_NAME_MAP = [
  { pattern: /^BLACK-?MAGIC\b/i, replace: 'Blackmagic' },
  { pattern: /\bBLAC\d*\b/i, replace: 'Blackmagic' },
  { pattern: /\bMICRO CONVERTER\b/i, replace: 'Micro Converter' },
  { pattern: /\bHDMI TO SDI\b/i, replace: 'HDMI to SDI' },
  { pattern: /\bSDI TO HDMI\b/i, replace: 'SDI to HDMI' },
  { pattern: /\bWEB PRESENTER\b/i, replace: 'Web Presenter' },
];

function cleanBHName(name) {
  let cleaned = name;
  for (const rule of BH_NAME_MAP) {
    cleaned = cleaned.replace(rule.pattern, rule.replace);
  }
  // Title-case remaining all-caps words (4+ chars), preserve known acronyms
  const preserveAcronyms = new Set(['HD','SDI','HDMI','USB','XLR','DMX','LED','LCD','AC','DC','POE','PTZ','SSD','NVR','AES','VGA','DVI','NDI','IP','DP','UHD','4K','8K']);
  cleaned = cleaned.replace(/\b([A-Z]{4,})\b/g, (m) => {
    if (preserveAcronyms.has(m)) return m;
    return m.charAt(0) + m.slice(1).toLowerCase();
  });
  return cleaned.trim();
}

// ── Main Parse Function ─────────────────────────────────────────────────────

function parseInvoice(text) {
  const source = detectSource(text);
  if (!source) {
    return { 
      error: 'Could not identify invoice source. Supported: eBay, Amazon, B&H, PayPal, Best Buy, MPB, vendor invoices.',
      source: null, items: [] 
    };
  }

  let result;
  switch (source) {
    case 'ebay':    result = parseEbay(text); break;
    case 'amazon':  result = parseAmazon(text); break;
    case 'bh':      result = parseBH(text); break;
    case 'paypal':  result = parsePaypal(text); break;
    case 'bestbuy': result = parseBestBuy(text); break;
    case 'mpb':     result = parseMPB(text); break;
    case 'vendor':  result = parseVendor(text); break;
    default:        result = { source, items: [] };
  }

  // If no items found, provide helpful error
  if (result.items.length === 0) {
    result.warning = `Detected ${source.toUpperCase()} invoice but could not extract items. You may need to add them manually.`;
  }

  // Clean up B&H names to be more readable
  for (const item of result.items) {
    item.name = cleanBHName(item.name);
  }

  return result;
}


module.exports = { parseInvoice, categorizeItem, detectSource };
