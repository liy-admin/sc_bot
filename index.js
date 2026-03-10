require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const express    = require('express');
const QRCode     = require('qrcode');
const { createOrder, verifySign } = require('./payment');
const db = require('./db');

// ── Config ──────────────────────────────────────────────────────────────────
const BOT_TOKEN  = process.env.BOT_TOKEN;
const ADMIN_IDS  = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const SUPPORT_URL = process.env.SUPPORT_URL || 'https://t.me/support';
const PAY_PID    = process.env.PAY_PID;
const PAY_KEY    = process.env.PAY_KEY;
const PAY_TYPE   = process.env.PAY_TYPE || 'wxpay';
const NOTIFY_URL = process.env.NOTIFY_URL;
const RETURN_URL = process.env.RETURN_URL || 'https://t.me/bot';
const PORT       = parseInt(process.env.PORT) || 3000;

if (!BOT_TOKEN) { console.error('Missing BOT_TOKEN'); process.exit(1); }
if (!PAY_PID || !PAY_KEY) { console.error('Missing PAY_PID or PAY_KEY'); process.exit(1); }
if (!NOTIFY_URL) { console.error('Missing NOTIFY_URL'); process.exit(1); }

// ── Bot ──────────────────────────────────────────────────────────────────────
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// 注册公开菜单命令（仅 /start 和 /help 对所有人可见）
bot.setMyCommands([
  { command: 'start', description: '开始使用' },
  { command: 'help',  description: '帮助' },
]);

function isAdmin(userId) {
  return ADMIN_IDS.includes(String(userId));
}

function adminOnly(msg, fn) {
  if (!isAdmin(msg.from.id)) return;
  fn();
}

// ── /start ───────────────────────────────────────────────────────────────────
bot.onText(/\/start/, msg => {
  bot.sendMessage(msg.chat.id, '欢迎！请选择下方操作：', {
    reply_markup: {
      inline_keyboard: [[
        { text: '💬 联系客服', url: SUPPORT_URL },
        { text: '🛒 购买卡密', callback_data: 'buy' },
      ]],
    },
  });
});

// ── /help ────────────────────────────────────────────────────────────────────
bot.onText(/\/help/, msg => {
  const userHelp =
    `📖 *使用帮助*\n\n` +
    `/start — 返回主菜单\n` +
    `/help  — 显示此帮助\n\n` +
    `点击「🛒 购买卡密」选择商品并扫码支付，支付完成后卡密将自动发送到此对话。\n` +
    `如有问题请点击「💬 联系客服」。`;

  const adminHelp =
    `\n\n─────────────────\n` +
    `🔧 *管理员命令*\n\n` +
    `*商品管理*\n` +
    `/addproduct <名称> <价格> — 添加商品\n` +
    `/editproduct <id> <名称> <价格> — 修改商品\n` +
    `/delproduct <id> — 删除商品\n` +
    `/listproducts — 查看所有商品及库存\n\n` +
    `*卡密管理*\n` +
    `/addcard <商品id> <卡密> — 添加单条卡密\n` +
    `/addcards <商品id>\\n卡密1\\n卡密2 — 批量添加卡密\n` +
    `/listcards <商品id> — 查看该商品所有卡密`;

  const text = isAdmin(msg.from.id) ? userHelp + adminHelp : userHelp;

  bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

// ── Admin: /addproduct <名称> <价格> ─────────────────────────────────────────
bot.onText(/\/addproduct (.+?) (\d+(?:\.\d{1,2})?)$/, (msg, match) => {
  adminOnly(msg, () => {
    const product = db.addProduct(match[1].trim(), match[2]);
    bot.sendMessage(msg.chat.id,
      `✅ 商品已添加\nID: \`${product.id}\`\n名称: ${product.name}\n价格: ¥${product.price}`,
      { parse_mode: 'Markdown' });
  });
});

// ── Admin: /editproduct <id> <新名称> <新价格> ───────────────────────────────
bot.onText(/\/editproduct (\S+) (.+?) (\d+(?:\.\d{1,2})?)$/, (msg, match) => {
  adminOnly(msg, () => {
    const ok = db.updateProduct(match[1], {
      name: match[2].trim(),
      price: parseFloat(match[3]).toFixed(2),
    });
    bot.sendMessage(msg.chat.id, ok ? '✅ 商品已更新' : '❌ 商品不存在');
  });
});

// ── Admin: /delproduct <id> ──────────────────────────────────────────────────
bot.onText(/\/delproduct (\S+)/, (msg, match) => {
  adminOnly(msg, () => {
    const ok = db.deleteProduct(match[1]);
    bot.sendMessage(msg.chat.id, ok ? '✅ 商品已删除' : '❌ 商品不存在');
  });
});

// ── Admin: /listproducts ─────────────────────────────────────────────────────
bot.onText(/\/listproducts/, msg => {
  adminOnly(msg, () => {
    const products = Object.values(db.getProducts());
    if (!products.length) return bot.sendMessage(msg.chat.id, '暂无商品');
    const lines = products.map(p => {
      const avail = db.countAvailable(p.id);
      return `• ${p.name}  ¥${p.price}  库存: ${avail}\n  ID: \`${p.id}\``;
    });
    bot.sendMessage(msg.chat.id, lines.join('\n\n'), { parse_mode: 'Markdown' });
  });
});

// ── Admin: /addcard <product_id> <卡密> ─────────────────────────────────────
//   支持单条: /addcard p123 ABCD-1234
bot.onText(/\/addcard (\S+) (.+)/, (msg, match) => {
  adminOnly(msg, () => {
    const productId = match[1];
    const products = db.getProducts();
    if (!products[productId]) return bot.sendMessage(msg.chat.id, '❌ 商品不存在');
    db.addCards(productId, [match[2].trim()]);
    bot.sendMessage(msg.chat.id, `✅ 已添加 1 条卡密`);
  });
});

// ── Admin: /addcards <product_id>  (批量, 每行一条卡密) ──────────────────────
//   用法: /addcards p123
//         key-001
//         key-002
bot.onText(/\/addcards (\S+)\n([\s\S]+)/, (msg, match) => {
  adminOnly(msg, () => {
    const productId = match[1];
    const products = db.getProducts();
    if (!products[productId]) return bot.sendMessage(msg.chat.id, '❌ 商品不存在');
    const keys = match[2].split('\n').map(s => s.trim()).filter(Boolean);
    const count = db.addCards(productId, keys);
    bot.sendMessage(msg.chat.id, `✅ 已批量添加 ${count} 条卡密到「${products[productId].name}」`);
  });
});

// ── Admin: /listcards <product_id> ──────────────────────────────────────────
bot.onText(/\/listcards (\S+)/, (msg, match) => {
  adminOnly(msg, () => {
    const cards = db.getCards(match[1]);
    if (!cards.length) return bot.sendMessage(msg.chat.id, '该商品暂无卡密');
    const avail = cards.filter(c => !c.used).length;
    const lines = cards.map((c, i) => `${i + 1}. \`${c.key}\` [${c.used ? '已用' : '可用'}]`);
    bot.sendMessage(msg.chat.id,
      `共 ${cards.length} 条，可用 ${avail} 条：\n\n${lines.join('\n')}`,
      { parse_mode: 'Markdown' });
  });
});

// ── Callback queries ─────────────────────────────────────────────────────────
bot.on('callback_query', async query => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data   = query.data;

  bot.answerCallbackQuery(query.id).catch(() => {});

  // Show product list
  if (data === 'buy') {
    const products = Object.values(db.getProducts());
    if (!products.length) {
      return bot.sendMessage(chatId, '暂无在售商品，请稍后再试');
    }
    const keyboard = products.map(p => {
      const avail = db.countAvailable(p.id);
      return [{
        text: `${p.name}  ¥${p.price}  (库存 ${avail})`,
        callback_data: `buy_${p.id}`,
      }];
    });
    keyboard.push([{ text: '🔙 返回', callback_data: 'back_start' }]);
    return bot.sendMessage(chatId, '请选择商品：', {
      reply_markup: { inline_keyboard: keyboard },
    });
  }

  // Back to start
  if (data === 'back_start') {
    return bot.sendMessage(chatId, '欢迎！请选择下方操作：', {
      reply_markup: {
        inline_keyboard: [[
          { text: '💬 联系客服', url: SUPPORT_URL },
          { text: '🛒 购买卡密', callback_data: 'buy' },
        ]],
      },
    });
  }

  // User selected a product → show payment method choice
  if (data.startsWith('buy_')) {
    const productId = data.slice(4);
    const products  = db.getProducts();
    const product   = products[productId];
    if (!product) return bot.sendMessage(chatId, '商品不存在');

    if (db.countAvailable(productId) === 0) {
      return bot.sendMessage(chatId, '该商品暂时缺货，请联系客服');
    }

    return bot.sendMessage(chatId,
      `🛒 商品：${product.name}\n💰 金额：¥${product.price}\n\n请选择支付方式：`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '💚 微信支付', callback_data: `pay_wxpay_${productId}` },
              { text: '💙 支付宝',   callback_data: `pay_alipay_${productId}` },
            ],
            [{ text: '🔙 返回商品列表', callback_data: 'buy' }],
          ],
        },
      }
    );
  }

  // User selected payment method → create order → show QR code
  if (data.startsWith('pay_')) {
    const parts     = data.split('_');              // pay_wxpay_p123 → ['pay','wxpay','p123']
    const type      = parts[1];
    const productId = parts.slice(2).join('_');    // productId 本身含 _ 也安全
    const products = db.getProducts();
    const product  = products[productId];
    if (!product) return bot.sendMessage(chatId, '商品不存在');

    if (db.countAvailable(productId) === 0) {
      return bot.sendMessage(chatId, '该商品暂时缺货，请联系客服');
    }

    const outTradeNo = `TG${Date.now()}${userId}`;
    let result;
    try {
      result = await createOrder({
        pid:        PAY_PID,
        key:        PAY_KEY,
        money:      product.price,
        name:       product.name,
        notifyUrl:  NOTIFY_URL,
        returnUrl:  RETURN_URL,
        outTradeNo,
        type,
      });
    } catch (err) {
      console.error('createOrder error:', err.message);
      return bot.sendMessage(chatId, '创建订单失败，请稍后重试');
    }

    if (result.code !== 1) {
      return bot.sendMessage(chatId, `创建订单失败：${result.msg}`);
    }

    db.saveOrder({
      out_trade_no: outTradeNo,
      trade_no:     result.trade_no || '',
      user_id:      userId,
      chat_id:      chatId,
      product_id:   productId,
      money:        product.price,
      status:       'pending',
    });

    const payLabel  = type === 'wxpay' ? '💚 微信支付' : '💙 支付宝';
    const payTarget = result.payurl || result.qrcode;
    let qrBuffer;
    try {
      qrBuffer = await QRCode.toBuffer(payTarget, { width: 320, margin: 2 });
    } catch (err) {
      console.error('QR generation error:', err.message);
      return bot.sendMessage(chatId,
        `请打开以下链接完成支付：\n${payTarget}\n\n商品：${product.name}\n金额：¥${product.price}`);
    }

    bot.sendPhoto(chatId, qrBuffer, {
      caption:
        `🛒 商品：${product.name}\n` +
        `💰 金额：¥${product.price}\n` +
        `${payLabel}\n` +
        `🔢 订单号：${outTradeNo}\n\n` +
        `请扫描上方二维码完成支付，支付成功后卡密将自动发送。`,
    });
  }
});

// ── Express: payment callback ────────────────────────────────────────────────
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get('/notify', async (req, res) => {
  const params = req.query;
  console.log('[notify]', new Date().toISOString(), params);

  if (!verifySign(params, PAY_KEY)) {
    console.warn('[notify] invalid signature');
    return res.send('fail');
  }

  if (params.trade_status !== 'TRADE_SUCCESS') {
    return res.send('success');
  }

  const order = db.getOrder(params.out_trade_no);
  if (!order) return res.send('success');
  if (order.status === 'paid') return res.send('success');

  db.updateOrder(params.out_trade_no, { status: 'paid', trade_no: params.trade_no });

  const cardKey = db.popCard(order.product_id);
  const targetChat = order.chat_id || order.user_id;

  if (!cardKey) {
    console.error('[notify] no card available for product:', order.product_id);
    bot.sendMessage(targetChat,
      '⚠️ 支付成功，但卡密暂时缺货，请联系客服处理，订单号：`' + params.out_trade_no + '`',
      { parse_mode: 'Markdown' });
    return res.send('success');
  }

  db.updateOrder(params.out_trade_no, { card_key: cardKey });

  bot.sendMessage(targetChat,
    `✅ 支付成功！\n\n您的卡密：\n\`${cardKey}\`\n\n感谢购买，如有问题请联系客服。`,
    { parse_mode: 'Markdown' });

  res.send('success');
});

// Health check
app.get('/ping', (_req, res) => res.send('pong'));

app.listen(PORT, () => {
  console.log(`[server] Payment callback listening on port ${PORT}`);
});

console.log('[bot] Started (polling)');
