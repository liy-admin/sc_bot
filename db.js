const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const CARDS_FILE    = path.join(DATA_DIR, 'cards.json');
const ORDERS_FILE   = path.join(DATA_DIR, 'orders.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJSON(file, def) {
  ensureDir();
  if (!fs.existsSync(file)) return def;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return def; }
}

function writeJSON(file, data) {
  ensureDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// ---------- Products ----------

function getProducts() {
  return readJSON(PRODUCTS_FILE, {});
}

function addProduct(name, price) {
  const products = getProducts();
  const id = `p${Date.now()}`;
  products[id] = { id, name, price: parseFloat(price).toFixed(2) };
  writeJSON(PRODUCTS_FILE, products);
  return products[id];
}

function updateProduct(id, fields) {
  const products = getProducts();
  if (!products[id]) return false;
  Object.assign(products[id], fields);
  writeJSON(PRODUCTS_FILE, products);
  return true;
}

function deleteProduct(id) {
  const products = getProducts();
  if (!products[id]) return false;
  delete products[id];
  writeJSON(PRODUCTS_FILE, products);
  return true;
}

// ---------- Cards ----------

function getCards(productId) {
  const cards = readJSON(CARDS_FILE, {});
  return cards[productId] || [];
}

function addCards(productId, keys) {
  const cards = readJSON(CARDS_FILE, {});
  if (!cards[productId]) cards[productId] = [];
  for (const key of keys) {
    if (key.trim()) cards[productId].push({ key: key.trim(), used: false });
  }
  writeJSON(CARDS_FILE, cards);
  return keys.length;
}

function popCard(productId) {
  const cards = readJSON(CARDS_FILE, {});
  if (!cards[productId]) return null;
  const idx = cards[productId].findIndex(c => !c.used);
  if (idx === -1) return null;
  const key = cards[productId][idx].key;
  cards[productId][idx].used = true;
  writeJSON(CARDS_FILE, cards);
  return key;
}

function countAvailable(productId) {
  return getCards(productId).filter(c => !c.used).length;
}

// ---------- Orders ----------

function saveOrder(order) {
  const orders = readJSON(ORDERS_FILE, {});
  orders[order.out_trade_no] = order;
  writeJSON(ORDERS_FILE, orders);
}

function getOrder(outTradeNo) {
  return readJSON(ORDERS_FILE, {})[outTradeNo] || null;
}

function updateOrder(outTradeNo, fields) {
  const orders = readJSON(ORDERS_FILE, {});
  if (!orders[outTradeNo]) return;
  Object.assign(orders[outTradeNo], fields);
  writeJSON(ORDERS_FILE, orders);
}

module.exports = {
  getProducts, addProduct, updateProduct, deleteProduct,
  getCards, addCards, popCard, countAvailable,
  saveOrder, getOrder, updateOrder,
};
