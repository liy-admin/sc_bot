const crypto = require('crypto');
const https  = require('https');
const axios  = require('axios');

// 对照 PHP EpayCore::getSign() — ksort + 拼接 + 末尾截 & + 追加 key + md5
function getSign(params, key) {
  // ksort: 按 key 字母升序
  const sorted = Object.keys(params).sort();

  let signstr = '';
  for (const k of sorted) {
    const v = params[k];
    // 与 PHP 一致：排除 sign、sign_type、空值
    if (k === 'sign' || k === 'sign_type') continue;
    if (v === '' || v == null) continue;
    signstr += `${k}=${v}&`;
  }
  // substr($signstr, 0, -1)  去掉末尾 &
  signstr = signstr.slice(0, -1);
  // 追加商户 key
  signstr += key;

  return crypto.createHash('md5').update(signstr, 'utf8').digest('hex');
}

// 对照 PHP EpayCore::apiPay() — buildRequestParam + http_build_query + POST mapi.php
async function createOrder({ pid, key, money, name, notifyUrl, returnUrl, outTradeNo, type }) {
  // 业务参数（对应 PHP $param_tmp）
  const param = {
    pid,
    type,
    out_trade_no: outTradeNo,
    notify_url:   notifyUrl,
    name,
    money,
    clientip:     '1.1.1.1',   // 文档必填：发起支付的用户IP
  };

  // buildRequestParam: 加 sign 和 sign_type
  param.sign      = getSign(param, key);
  param.sign_type = 'MD5';

  // http_build_query 等价：URLSearchParams（值自动 URL 编码）
  const body = new URLSearchParams(param).toString();
  console.log('[payment] POST body:', body);

  // 对照 PHP curl：关闭 SSL 验证、固定 headers、Connection: close
  const agent = new https.Agent({ rejectUnauthorized: false });

  const res = await axios.post(
    'https://scpay.q105.cn/mapi.php',
    body,
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      httpsAgent:     agent,
      proxy:          false,     // 不走系统代理，直连（与 Postman 行为一致）
      timeout:        10000,
      maxRedirects:   0,
      validateStatus: s => true,
    }
  );

  console.log('[payment] status:', res.status, 'data:', JSON.stringify(res.data));

  if (res.status >= 300) {
    return { code: -1, msg: `服务器返回 ${res.status}，请检查 pid/key 是否正确` };
  }
  return res.data;
}

// 对照 PHP EpayCore::verifyNotify()
function verifySign(params, key) {
  const { sign, sign_type, ...rest } = params;
  return getSign(rest, key) === sign;
}

module.exports = { createOrder, verifySign };
