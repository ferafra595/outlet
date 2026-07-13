const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', ...headers }
});

const readJson = async (request) => {
  try { return await request.json(); } catch { return {}; }
};

const money = (n) => Math.round((Number(n) || 0) * 100) / 100;
const uid = (prefix = '') => `${prefix}${Date.now().toString(36)}${crypto.randomUUID().slice(0, 8)}`.toUpperCase();

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
}

async function makeSession(env) {
  const payload = btoa(JSON.stringify({ role: 'admin', exp: Date.now() + 1000 * 60 * 60 * 12 }));
  return `${payload}.${await hmac(env.SESSION_SECRET, payload)}`;
}

async function isAdmin(request, env) {
  const cookie = request.headers.get('cookie') || '';
  const token = cookie.match(/mb_session=([^;]+)/)?.[1];
  if (!token || !env.SESSION_SECRET) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig || await hmac(env.SESSION_SECRET, payload) !== sig) return false;
  try { return JSON.parse(atob(payload)).exp > Date.now(); } catch { return false; }
}

async function audit(env, actor, action, entityType, entityId, details = {}) {
  await env.DB.prepare(`INSERT INTO audit_logs(actor,action,entity_type,entity_id,details) VALUES(?,?,?,?,?)`)
    .bind(actor, action, entityType, entityId || null, JSON.stringify(details)).run();
}

function commissionFor(total) {
  const t = Math.max(0, Number(total) || 0);
  const first = Math.min(t, 5000) * .10;
  const second = Math.min(Math.max(t - 5000, 0), 2500) * .12;
  const third = Math.max(t - 7500, 0) * .15;
  return money(first + second + third);
}

async function notify(env, subject, html) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM || !env.ALERT_EMAIL) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [env.ALERT_EMAIL], subject, html })
  }).catch(() => null);
}

async function api(request, env, path) {
  const method = request.method;
  const admin = await isAdmin(request, env);

  if (path === '/api/health') return json({ ok: true, app: env.APP_NAME || 'Gestionale MB' });

  if (path === '/api/auth/login' && method === 'POST') {
    const body = await readJson(request);
    if (body.email !== env.ADMIN_EMAIL || body.password !== env.ADMIN_PASSWORD) return json({ error: 'Credenziali non valide' }, 401);
    const token = await makeSession(env);
    return json({ ok: true }, 200, { 'set-cookie': `mb_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200` });
  }
  if (path === '/api/auth/logout' && method === 'POST') return json({ ok: true }, 200, { 'set-cookie': 'mb_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0' });
  if (path === '/api/auth/me') return json({ authenticated: admin });

  if (path === '/api/products' && method === 'GET') {
    const url = new URL(request.url);
    const q = `%${url.searchParams.get('q') || ''}%`;
    const rows = await env.DB.prepare(`SELECT * FROM products WHERE deleted_at IS NULL AND (name LIKE ? OR brand LIKE ? OR barcode LIKE ? OR internal_code LIKE ? OR category LIKE ?) ORDER BY updated_at DESC`)
      .bind(q,q,q,q,q).all();
    return json(rows.results);
  }

  if (path.startsWith('/api/products/lookup/') && method === 'GET') {
    const code = decodeURIComponent(path.split('/').pop());
    const row = await env.DB.prepare(`SELECT * FROM products WHERE deleted_at IS NULL AND (barcode=? OR internal_code=?) LIMIT 1`).bind(code,code).first();
    return row ? json(row) : json({ error: 'Prodotto non trovato' }, 404);
  }

  if (path === '/api/products' && method === 'POST') {
    const b = await readJson(request);
    const internal = b.internal_code || uid('MB-');
    const qty = Math.max(0, parseInt(b.quantity || b.initial_qty || 0));
    try {
      const r = await env.DB.prepare(`INSERT INTO products(barcode,internal_code,name,brand,category,model,color,size,season,notes,list_price,sale_price,cost_price,initial_qty,current_qty,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(b.barcode || null, internal, b.name||'', b.brand||'', b.category||'', b.model||'', b.color||'', b.size||'', b.season||'', b.notes||'', money(b.list_price), money(b.sale_price ?? b.list_price), money(b.cost_price), qty, qty, qty > 0 ? 'available':'out_of_stock').run();
      await env.DB.prepare(`INSERT INTO stock_movements(product_id,type,quantity,previous_qty,new_qty,note) VALUES(?,?,?,?,?,?)`).bind(r.meta.last_row_id,'initial_load',qty,0,qty,'Caricamento iniziale').run();
      await audit(env, admin ? 'admin':'store', 'create', 'product', r.meta.last_row_id, b);
      return json({ id: r.meta.last_row_id, internal_code: internal }, 201);
    } catch (e) { return json({ error: e.message.includes('UNIQUE') ? 'Codice già utilizzato' : 'Errore nel salvataggio' }, 400); }
  }

  const productMatch = path.match(/^\/api\/products\/(\d+)$/);
  if (productMatch && method === 'PUT') {
    const id = Number(productMatch[1]); const b = await readJson(request);
    const old = await env.DB.prepare(`SELECT * FROM products WHERE id=?`).bind(id).first();
    if (!old) return json({ error: 'Prodotto non trovato' }, 404);
    const newQty = b.current_qty === undefined ? old.current_qty : Math.max(0, parseInt(b.current_qty));
    await env.DB.prepare(`UPDATE products SET barcode=?,name=?,brand=?,category=?,model=?,color=?,size=?,season=?,notes=?,list_price=?,sale_price=?,cost_price=?,current_qty=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(b.barcode ?? old.barcode, b.name ?? old.name, b.brand ?? old.brand, b.category ?? old.category, b.model ?? old.model, b.color ?? old.color, b.size ?? old.size, b.season ?? old.season, b.notes ?? old.notes, money(b.list_price ?? old.list_price), money(b.sale_price ?? old.sale_price ?? old.list_price), money(b.cost_price ?? old.cost_price), newQty, newQty > 0 ? 'available':'out_of_stock', id).run();
    if (newQty !== old.current_qty) await env.DB.prepare(`INSERT INTO stock_movements(product_id,type,quantity,previous_qty,new_qty,note) VALUES(?,?,?,?,?,?)`).bind(id,'adjustment',newQty-old.current_qty,old.current_qty,newQty,'Modifica quantità').run();
    await audit(env, admin ? 'admin':'store', 'update', 'product', id, { before: old, after: b });
    return json({ ok: true });
  }

  if (path === '/api/products/import' && method === 'POST') {
    const b = await readJson(request); const rows = Array.isArray(b.rows) ? b.rows : [];
    let inserted=0, updated=0, errors=[];
    for (const [i,row] of rows.entries()) {
      try {
        const code = row.barcode || null;
        const existing = code ? await env.DB.prepare(`SELECT * FROM products WHERE barcode=?`).bind(code).first() : null;
        const qty = Math.max(0, parseInt(row.quantity || 0));
        if (existing) {
          const nq = existing.current_qty + qty;
          await env.DB.prepare(`UPDATE products SET current_qty=?, initial_qty=initial_qty+?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(nq,qty,nq>0?'available':'out_of_stock',existing.id).run();
          await env.DB.prepare(`INSERT INTO stock_movements(product_id,type,quantity,previous_qty,new_qty,note) VALUES(?,?,?,?,?,?)`).bind(existing.id,'import',qty,existing.current_qty,nq,'Importazione file').run(); updated++;
        } else {
          const internal = row.internal_code || uid('MB-');
          const r = await env.DB.prepare(`INSERT INTO products(barcode,internal_code,name,brand,category,model,color,size,season,notes,list_price,sale_price,cost_price,initial_qty,current_qty,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
            .bind(code,internal,row.name||'',row.brand||'',row.category||'',row.model||'',row.color||'',row.size||'',row.season||'',row.notes||'',money(row.list_price),money(row.sale_price ?? row.list_price),money(row.cost_price),qty,qty,qty>0?'available':'out_of_stock').run();
          await env.DB.prepare(`INSERT INTO stock_movements(product_id,type,quantity,previous_qty,new_qty,note) VALUES(?,?,?,?,?,?)`).bind(r.meta.last_row_id,'import',qty,0,qty,'Importazione file').run(); inserted++;
        }
      } catch(e){ errors.push({ row:i+2,error:e.message }); }
    }
    await audit(env, admin?'admin':'store','import','products',null,{inserted,updated,errors:errors.length});
    return json({ inserted, updated, errors });
  }

  if (path === '/api/sales' && method === 'POST') {
    const b = await readJson(request); const items = Array.isArray(b.items) ? b.items : [];
    if (!items.length) return json({ error: 'Il carrello è vuoto' }, 400);
    const saleCode = uid('V-');
    let subtotal=0,total=0, normalized=[];
    for (const item of items) {
      const p = await env.DB.prepare(`SELECT * FROM products WHERE id=? AND deleted_at IS NULL`).bind(item.product_id).first();
      if (!p) return json({ error: 'Uno dei prodotti non esiste' }, 400);
      const qty = Math.max(1, parseInt(item.quantity||1));
      const original = money(p.sale_price ?? p.list_price);
      const discountType = item.discount_type === 'amount' ? 'amount' : 'percent';
      const discountValue = Math.max(0, Number(item.discount_value)||0);
      const unitDiscount = discountType === 'percent' ? original * Math.min(discountValue,100) / 100 : Math.min(discountValue,original);
      const final = money(Math.max(0, original-unitDiscount));
      subtotal += original*qty; total += final*qty;
      normalized.push({p,qty,original,final,discountType,discountValue});
    }
    subtotal=money(subtotal); total=money(total); const discount=money(subtotal-total);
    const sr = await env.DB.prepare(`INSERT INTO sales(sale_code,subtotal,discount_total,total,status,source,occurred_at) VALUES(?,?,?,?,?,?,?)`)
      .bind(saleCode,subtotal,discount,total,'completed',b.source||'store',b.occurred_at||new Date().toISOString()).run();
    for (const x of normalized) {
      await env.DB.prepare(`INSERT INTO sale_items(sale_id,product_id,quantity,original_unit_price,final_unit_price,discount_amount,discount_type,discount_value,line_total) VALUES(?,?,?,?,?,?,?,?,?)`)
        .bind(sr.meta.last_row_id,x.p.id,x.qty,x.original,x.final,money((x.original-x.final)*x.qty),x.discountType,x.discountValue,money(x.final*x.qty)).run();
      const newQty = x.p.current_qty - x.qty;
      await env.DB.prepare(`UPDATE products SET current_qty=?, sold_qty=sold_qty+?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(newQty,x.qty,newQty>0?'available':'out_of_stock',x.p.id).run();
      await env.DB.prepare(`INSERT INTO stock_movements(product_id,type,quantity,previous_qty,new_qty,reference_type,reference_id,note) VALUES(?,?,?,?,?,?,?,?)`)
        .bind(x.p.id,'sale',-x.qty,x.p.current_qty,newQty,'sale',sr.meta.last_row_id,`Vendita ${saleCode}`).run();
    }
    await audit(env, admin?'admin':'store','create','sale',sr.meta.last_row_id,{saleCode,total,discount,items:normalized.length});
    await notify(env, `Nuova vendita ${saleCode}`, `<p>Totale vendita: <strong>€ ${total.toFixed(2)}</strong></p>`);
    return json({ id: sr.meta.last_row_id, sale_code:saleCode, subtotal, discount, total },201);
  }

  if (path === '/api/sales' && method === 'GET') {
    const rows = await env.DB.prepare(`SELECT s.*, COUNT(si.id) items_count FROM sales s LEFT JOIN sale_items si ON si.sale_id=s.id GROUP BY s.id ORDER BY s.occurred_at DESC LIMIT 1000`).all();
    return json(rows.results);
  }

  const saleDetail = path.match(/^\/api\/sales\/(\d+)$/);
  if (saleDetail && method === 'GET') {
    const id=Number(saleDetail[1]);
    const sale=await env.DB.prepare(`SELECT * FROM sales WHERE id=?`).bind(id).first();
    if(!sale) return json({error:'Vendita non trovata'},404);
    const items=await env.DB.prepare(`SELECT si.*,p.name,p.brand,p.barcode,p.internal_code,p.size,p.color FROM sale_items si JOIN products p ON p.id=si.product_id WHERE si.sale_id=?`).bind(id).all();
    return json({...sale,items:items.results});
  }

  const cancelMatch = path.match(/^\/api\/sales\/(\d+)\/cancel$/);
  if (cancelMatch && method === 'POST') {
    if (!admin) return json({error:'Solo amministratore'},403);
    const id=Number(cancelMatch[1]); const b=await readJson(request);
    const sale=await env.DB.prepare(`SELECT * FROM sales WHERE id=?`).bind(id).first();
    if(!sale || sale.status!=='completed') return json({error:'Vendita non annullabile'},400);
    const items=(await env.DB.prepare(`SELECT si.*,p.current_qty FROM sale_items si JOIN products p ON p.id=si.product_id WHERE si.sale_id=?`).bind(id).all()).results;
    for(const x of items){ const nq=x.current_qty+x.quantity; await env.DB.prepare(`UPDATE products SET current_qty=?,sold_qty=MAX(0,sold_qty-?),status='available',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(nq,x.quantity,x.product_id).run(); await env.DB.prepare(`INSERT INTO stock_movements(product_id,type,quantity,previous_qty,new_qty,reference_type,reference_id,note) VALUES(?,?,?,?,?,?,?,?)`).bind(x.product_id,'sale_cancel',x.quantity,x.current_qty,nq,'sale',id,b.reason||'Vendita annullata').run(); }
    await env.DB.prepare(`UPDATE sales SET status='cancelled',cancelled_at=CURRENT_TIMESTAMP,cancellation_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(b.reason||'',id).run();
    await audit(env,'admin','cancel','sale',id,b); await notify(env,`Vendita annullata ${sale.sale_code}`,`<p>Importo stornato: € ${sale.total.toFixed(2)}</p>`);
    return json({ok:true});
  }

  if (path === '/api/returns' && method === 'POST') {
    const b=await readJson(request); const item=await env.DB.prepare(`SELECT si.*,s.sale_code,s.status,p.current_qty FROM sale_items si JOIN sales s ON s.id=si.sale_id JOIN products p ON p.id=si.product_id WHERE si.id=?`).bind(b.sale_item_id).first();
    if(!item || item.status!=='completed') return json({error:'Articolo non restituibile'},400);
    const qty=Math.max(1,parseInt(b.quantity||1)); if(item.returned_qty+qty>item.quantity) return json({error:'Quantità reso non valida'},400);
    const amount=money(item.final_unit_price*qty);
    const rr=await env.DB.prepare(`INSERT INTO returns(sale_id,sale_item_id,product_id,quantity,amount,reason) VALUES(?,?,?,?,?,?)`).bind(item.sale_id,item.id,item.product_id,qty,amount,b.reason||'').run();
    const nq=item.current_qty+qty;
    await env.DB.prepare(`UPDATE sale_items SET returned_qty=returned_qty+? WHERE id=?`).bind(qty,item.id).run();
    await env.DB.prepare(`UPDATE products SET current_qty=?,sold_qty=MAX(0,sold_qty-?),status='available',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(nq,qty,item.product_id).run();
    await env.DB.prepare(`UPDATE sales SET total=MAX(0,total-?),updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(amount,item.sale_id).run();
    await env.DB.prepare(`INSERT INTO stock_movements(product_id,type,quantity,previous_qty,new_qty,reference_type,reference_id,note) VALUES(?,?,?,?,?,?,?,?)`).bind(item.product_id,'return',qty,item.current_qty,nq,'return',rr.meta.last_row_id,b.reason||`Reso ${item.sale_code}`).run();
    await audit(env,admin?'admin':'store','create','return',rr.meta.last_row_id,{amount,qty}); await notify(env,`Nuovo reso ${item.sale_code}`,`<p>Importo stornato: € ${amount.toFixed(2)}</p>`);
    return json({ok:true,amount});
  }

  if (path === '/api/movements' && method === 'GET') {
    const rows=await env.DB.prepare(`SELECT sm.*,p.name,p.brand,p.barcode,p.internal_code FROM stock_movements sm JOIN products p ON p.id=sm.product_id ORDER BY sm.created_at DESC LIMIT 2000`).all(); return json(rows.results);
  }

  if (path === '/api/dashboard' && method === 'GET') {
    const inventory=await env.DB.prepare(`SELECT COUNT(*) product_types,COALESCE(SUM(current_qty),0) units,COALESCE(SUM(current_qty*cost_price),0) cost_value,COALESCE(SUM(current_qty*list_price),0) retail_value,SUM(CASE WHEN current_qty<=0 THEN 1 ELSE 0 END) out_of_stock FROM products WHERE deleted_at IS NULL`).first();
    const month=await env.DB.prepare(`SELECT COALESCE(SUM(total),0) revenue,COUNT(*) sales FROM sales WHERE status='completed' AND strftime('%Y-%m',occurred_at)=strftime('%Y-%m','now')`).first();
    const returns=await env.DB.prepare(`SELECT COALESCE(SUM(amount),0) amount FROM returns WHERE strftime('%Y-%m',created_at)=strftime('%Y-%m','now')`).first();
    const top=(await env.DB.prepare(`SELECT p.id,p.name,p.brand,SUM(si.quantity-si.returned_qty) qty,SUM(si.line_total-(si.returned_qty*si.final_unit_price)) revenue FROM sale_items si JOIN sales s ON s.id=si.sale_id JOIN products p ON p.id=si.product_id WHERE s.status='completed' GROUP BY p.id ORDER BY qty DESC LIMIT 10`).all()).results;
    const stale=(await env.DB.prepare(`SELECT * FROM products WHERE current_qty>0 AND deleted_at IS NULL AND datetime(updated_at) < datetime('now','-90 days') ORDER BY updated_at ASC LIMIT 50`).all()).results;
    const trend=(await env.DB.prepare(`SELECT strftime('%Y-%m',occurred_at) period,ROUND(SUM(total),2) revenue,COUNT(*) sales FROM sales WHERE status='completed' AND occurred_at>=datetime('now','-12 months') GROUP BY period ORDER BY period`).all()).results;
    const revenue=money(month.revenue); const commission=commissionFor(revenue); const period=new Date().toISOString().slice(0,7); const paid=await env.DB.prepare(`SELECT amount,paid_at FROM commission_payments WHERE period=?`).bind(period).first();
    return json({inventory,month:{...month,revenue,returns:money(returns.amount),commission,commission_due:money(commission-(paid?.amount||0)),paid:paid||null},top,stale,trend});
  }

  if (path === '/api/commissions' && method === 'GET') {
    if(!admin) return json({error:'Solo amministratore'},403);
    const rows=(await env.DB.prepare(`SELECT strftime('%Y-%m',occurred_at) period,ROUND(SUM(total),2) revenue FROM sales WHERE status='completed' GROUP BY period ORDER BY period DESC`).all()).results;
    const pays=(await env.DB.prepare(`SELECT * FROM commission_payments`).all()).results; const map=Object.fromEntries(pays.map(x=>[x.period,x]));
    return json(rows.map(r=>({...r,commission:commissionFor(r.revenue),paid:map[r.period]?.amount||0,paid_at:map[r.period]?.paid_at||null,due:money(commissionFor(r.revenue)-(map[r.period]?.amount||0))})));
  }

  if (path === '/api/commissions/pay' && method === 'POST') {
    if(!admin) return json({error:'Solo amministratore'},403); const b=await readJson(request);
    await env.DB.prepare(`INSERT INTO commission_payments(period,amount,paid_at,note) VALUES(?,?,?,?) ON CONFLICT(period) DO UPDATE SET amount=excluded.amount,paid_at=excluded.paid_at,note=excluded.note`).bind(b.period,money(b.amount),b.paid_at||new Date().toISOString(),b.note||'').run(); await audit(env,'admin','pay','commission',null,b); return json({ok:true});
  }

  if (path === '/api/audit' && method === 'GET') { if(!admin) return json({error:'Solo amministratore'},403); const rows=await env.DB.prepare(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 2000`).all(); return json(rows.results); }

  return json({ error: 'Endpoint non trovato' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return api(request, env, url.pathname);
    return env.ASSETS.fetch(request);
  }
};
