const express = require('express');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const WHATSAPP_NUMBER = (process.env.WHATSAPP_NUMBER || '+57 3137586609').replace(/\D/g, '');
const rootDir = __dirname;
const dataDir = path.join(rootDir, 'data');

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'cafe-campus.db'));
db.pragma('journal_mode = WAL');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      price INTEGER NOT NULL CHECK(price > 0),
      description TEXT,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_code TEXT NOT NULL UNIQUE,
      client_name TEXT NOT NULL,
      phone TEXT,
      pickup_time TEXT NOT NULL,
      total_price INTEGER NOT NULL CHECK(total_price >= 0),
      status TEXT NOT NULL DEFAULT 'PENDIENTE',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      unit_price INTEGER NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      subtotal INTEGER NOT NULL,
      FOREIGN KEY(order_id) REFERENCES orders(id),
      FOREIGN KEY(product_id) REFERENCES products(id)
    );
  `);

  const productCount = db.prepare('SELECT COUNT(*) AS count FROM products').get().count;

  if (productCount === 0) {
    const insertProduct = db.prepare(
      'INSERT INTO products (name, price, description) VALUES (?, ?, ?)',
    );

    const seedProducts = [
      ['Hamburguesa', 3500, 'Clásica de la casa'],
      ['Jugo natural', 2800, 'Refrescante y energético'],
      ['Empanada de queso', 2200, 'Perfecta para llevar'],
      ['Café americano', 2500, 'Ideal para arrancar'],
      ['Sandwich de pollo', 5200, 'Sabor intenso y completo'],
      ['Té helado', 1800, 'Ligero y refrescante'],
      ['Brownie', 3000, 'Dulce para acompañar'],
      ['Almuerzo universitario', 6500, 'Combo balanceado'],
    ];

    const insertMany = db.transaction((products) => {
      for (const product of products) {
        insertProduct.run(product[0], product[1], product[2]);
      }
    });

    insertMany(seedProducts);
  }
}

initDatabase();

function formatCurrency(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value);
}

function buildWhatsAppMessage(order) {
  const lines = order.items.map(
    (item) => `- ${item.quantity}x ${item.productName} · ${formatCurrency(item.subtotal)}`,
  );

  return [
    'Hola, quiero confirmar mi pedido.',
    '',
    `Nombre: ${order.clientName}`,
    '',
    'Pedido:',
    ...lines,
    '',
    `Total: ${formatCurrency(order.totalPrice)}`,
    `Horario de recogida: ${order.pickupTime}`,
    `Código de recogida: ${order.orderCode}`,
    '',
    'Gracias.',
  ].join('\n');
}

function buildWhatsAppUrl(order) {
  const message = encodeURIComponent(buildWhatsAppMessage(order));
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${message}`;
}

function generateOrderCode() {
  const currentYear = new Date().getFullYear();
  const nextOrderId = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM orders').get().next_id;
  return `PED-${currentYear}-${String(nextOrderId).padStart(4, '0')}`;
}

function sanitizeName(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateOrderPayload(payload) {
  const errors = [];
  const name = sanitizeName(payload.name);

  if (!name) {
    errors.push('El nombre es obligatorio.');
  }

  if (typeof payload.pickupTime !== 'string' || !payload.pickupTime.trim()) {
    errors.push('El horario de recogida es obligatorio.');
  }

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    errors.push('Debe existir al menos un producto en el pedido.');
  }

  return { name, errors };
}

app.use(express.json({ limit: '1mb' }));
app.use(express.static(rootDir));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    status: 'online',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/products', (req, res) => {
  const products = db
    .prepare('SELECT id, name, price, description FROM products WHERE active = 1 ORDER BY id')
    .all()
    .map((product) => ({
      ...product,
      price: Number(product.price),
    }));

  res.json({ products });
});

app.get('/api/orders', (req, res) => {
  const orders = db
    .prepare(`
      SELECT o.id, o.order_code AS orderCode, o.client_name AS clientName, o.phone,
             o.pickup_time AS pickupTime, o.total_price AS totalPrice,
             o.status, o.created_at AS createdAt
      FROM orders o
      ORDER BY o.id DESC
    `)
    .all();

  const itemsByOrder = db
    .prepare(`
      SELECT order_id AS orderId, product_name AS productName, quantity, unit_price AS unitPrice,
             subtotal
      FROM order_items
      ORDER BY order_id, id
    `)
    .all();

  const orderItems = itemsByOrder.reduce((accumulator, item) => {
    const list = accumulator[item.orderId] || [];
    list.push(item);
    accumulator[item.orderId] = list;
    return accumulator;
  }, {});

  res.json({
    orders: orders.map((order) => ({
      ...order,
      items: orderItems[order.id] || [],
    })),
  });
});

app.post('/api/orders', (req, res) => {
  try {
    const payload = req.body || {};
    const { name, errors } = validateOrderPayload(payload);

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: errors[0],
      });
    }

    const pickupTime = String(payload.pickupTime).trim();
    const phone = '';
    const items = Array.isArray(payload.items) ? payload.items : [];

    const productIds = items.map((item) => Number(item.productId));
    const validProducts = db
      .prepare(
        `SELECT id, name, price FROM products WHERE active = 1 AND id IN (${productIds
          .map(() => '?')
          .join(',') || 'NULL'})`,
      )
      .all(...productIds);

    const productMap = new Map(validProducts.map((product) => [product.id, product]));

    if (validProducts.length !== productIds.length || productIds.some((id) => !Number.isInteger(id) || id <= 0)) {
      return res.status(400).json({
        success: false,
        message: 'Hay productos inválidos en el pedido.',
      });
    }

    const normalizedItems = [];
    let totalPrice = 0;

    for (const item of items) {
      const productId = Number(item.productId);
      const quantity = Number(item.quantity);

      if (!Number.isInteger(productId) || productId <= 0) {
        return res.status(400).json({
          success: false,
          message: 'La cantidad o el producto seleccionado no son válidos.',
        });
      }

      if (!Number.isInteger(quantity) || quantity <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Las cantidades deben ser mayores que cero.',
        });
      }

      const product = productMap.get(productId);

      if (!product) {
        return res.status(400).json({
          success: false,
          message: 'Uno o varios productos no existen o no están activos.',
        });
      }

      const subtotal = product.price * quantity;
      totalPrice += subtotal;

      normalizedItems.push({
        productId,
        productName: product.name,
        unitPrice: Number(product.price),
        quantity,
        subtotal,
      });
    }

    const orderCode = generateOrderCode();
    const createdAt = new Date().toISOString();

    const insertOrder = db.prepare(`
      INSERT INTO orders (order_code, client_name, phone, pickup_time, total_price, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'PENDIENTE', ?)
    `);

    const insertOrderItem = db.prepare(`
      INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, subtotal)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const createOrderTransaction = db.transaction(() => {
      const result = insertOrder.run(orderCode, name, phone || null, pickupTime, totalPrice, createdAt);
      const orderId = result.lastInsertRowid;

      for (const item of normalizedItems) {
        insertOrderItem.run(
          orderId,
          item.productId,
          item.productName,
          item.unitPrice,
          item.quantity,
          item.subtotal,
        );
      }

      return {
        id: Number(orderId),
        orderCode,
        clientName: name,
        phone,
        pickupTime,
        totalPrice,
        status: 'PENDIENTE',
        createdAt,
        items: normalizedItems,
      };
    });

    const order = createOrderTransaction();
    const whatsappUrl = buildWhatsAppUrl(order);

    return res.status(201).json({
      success: true,
      order: {
        ...order,
        whatsappUrl,
      },
    });
  } catch (error) {
    console.error('Error creating order:', error);
    return res.status(500).json({
      success: false,
      message: 'No se pudo guardar el pedido en este momento.',
    });
  }
});

app.get(/^(?!\/api\/).*$/, (req, res) => {
  res.sendFile(path.join(rootDir, 'index.html'));
});
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor activo en http://localhost:${PORT}`);
  console.log(`Acceso por Wi-Fi: http://192.168.18.146:${PORT}`);
  console.log(`WhatsApp centralizado en: ${WHATSAPP_NUMBER}`);
});