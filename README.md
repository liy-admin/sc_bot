# 卡密销售 Telegram Bot

基于 Node.js 的 Telegram 卡密自动售卖机器人，集成蔬菜支付（scpay.q105.cn），支持微信支付和支付宝，支付成功后自动发送卡密。

## 功能

- `/start` 展示主菜单，提供联系客服和购买卡密入口
- 购买流程：选择商品 → 选择支付方式（微信 / 支付宝）→ 扫码支付 → 自动收到卡密
- 管理员可通过命令管理商品和卡密库存
- 支付回调验签，防止伪造通知

## 目录结构

```
sc_bot/
├── index.js        # 主程序（Bot + 支付回调服务器）
├── payment.js      # 蔬菜支付 API 封装 & MD5 签名
├── db.js           # 数据读写（JSON 文件）
├── data/           # 运行时自动生成
│   ├── products.json
│   ├── cards.json
│   └── orders.json
├── .env            # 配置文件（不上传）
├── .env.example    # 配置模板
└── package.json
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`：

| 变量 | 说明 |
|------|------|
| `BOT_TOKEN` | BotFather 申请的 Bot Token |
| `ADMIN_IDS` | 管理员 Telegram 用户 ID，多个用逗号分隔 |
| `SUPPORT_URL` | 联系客服链接，如 `https://t.me/xxx` |
| `PAY_PID` | 蔬菜支付商户 ID |
| `PAY_KEY` | 蔬菜支付商户密钥 |
| `PAY_TYPE` | 默认支付方式（`wxpay` / `alipay`，用户可在购买时自选） |
| `NOTIFY_URL` | 支付回调地址，须为公网可访问的地址，如 `https://yourdomain.com/notify` |
| `RETURN_URL` | 支付完成后跳转地址，填 Bot 链接即可 |
| `PORT` | 回调服务器端口，默认 `3000` |

> **注意：** `NOTIFY_URL` 必须是公网可访问的地址，本地开发可使用 [ngrok](https://ngrok.com)：
> ```bash
> ngrok http 3000
> # 将生成的 https://xxxx.ngrok-free.app/notify 填入 NOTIFY_URL
> ```

### 3. 启动

```bash
npm start
```

## 管理员命令

> 管理员命令不出现在公开菜单，仅对 `ADMIN_IDS` 中的用户生效。

### 商品管理

```
/addproduct <名称> <价格>               添加商品
/editproduct <id> <新名称> <新价格>     修改商品
/delproduct <id>                        删除商品
/listproducts                           查看所有商品及库存
```

### 卡密管理

```
/addcard <商品id> <卡密>                添加单条卡密

/addcards <商品id>                      批量添加卡密（换行分隔）
key-001
key-002
key-003

/listcards <商品id>                     查看该商品所有卡密及使用状态
```

### 示例

```
# 添加一个商品
/addproduct 月卡会员 30.00

# 返回: ✅ 商品已添加  ID: p1234567890

# 添加卡密
/addcard p1234567890 XXXX-YYYY-ZZZZ

# 批量添加卡密
/addcards p1234567890
AAAA-1111
BBBB-2222
CCCC-3333
```

## 用户购买流程

```
/start
  ├── 💬 联系客服   →  跳转客服链接
  └── 🛒 购买卡密
        └── [商品列表]
              └── 选择商品
                    ├── 💚 微信支付  →  显示微信支付二维码
                    └── 💙 支付宝    →  显示支付宝二维码
                          └── 扫码支付成功
                                └── 自动收到卡密 ✅
```

## 支付回调

支付成功后蔬菜支付会向 `NOTIFY_URL` 发送 GET 请求，Bot 验证签名后自动将卡密发送给买家。

回调地址：`GET /notify`
健康检查：`GET /ping`

## 依赖

| 包 | 用途 |
|----|------|
| `node-telegram-bot-api` | Telegram Bot SDK |
| `express` | 支付回调 HTTP 服务器 |
| `axios` | 调用蔬菜支付 API |
| `qrcode` | 生成支付二维码图片 |
| `dotenv` | 读取环境变量 |
