import './styles.css';
import { BrowserMultiFormatReader } from '@zxing/browser';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';

const app=document.querySelector('#app');
const state={page:'home',admin:false,products:[],sales:[],dashboard:null,cart:[],online:navigator.onLine,scanner:null};
const euro=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(Number(n)||0);
const api=async(path,opts={})=>{const r=await fetch(path,{headers:{'content-type':'application/json',...(opts.headers||{})},...opts});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Errore');return d};
const icon=(x)=>x;

window.addEventListener('online',()=>{state.online=true;syncQueue();render()});
window.addEventListener('offline',()=>{state.online=false;render()});

function shell(content){return `<div class="app"><header class="topbar"><div><div class="brand">Gestionale MB</div><div class="muted">${state.admin?'Area amministratore':'Area store'}</div></div><div>${state.online?'<span class="badge ok">Online</span>':'<span class="badge warn">Offline</span>'} ${state.admin?'<button class="btn ghost" id="logout">Esci</button>':'<button class="btn ghost" id="adminLogin">Admin</button>'}</div></header><main class="container">${!state.online?'<div class="notice offline">Sei offline: le operazioni verranno salvate e sincronizzate appena torna Internet.</div>':''}${content}</main>${nav()}</div>`}
function nav(){return `<nav class="bottomnav"><button class="navbtn ${state.page==='home'?'active':''}" data-page="home">⌂<br>Home</button><button class="navbtn ${state.page==='products'?'active':''}" data-page="products">▦<br>Magazzino</button><button class="navbtn scan-main" id="scanNav">⌁</button><button class="navbtn ${state.page==='sales'?'active':''}" data-page="sales">€<br>Vendite</button><button class="navbtn ${state.page==='more'?'active':''}" data-page="more">•••<br>Altro</button></nav>`}

async function refresh(){try{state.products=await api('/api/products');state.sales=await api('/api/sales');state.dashboard=await api('/api/dashboard')}catch(e){console.warn(e)}render()}
function render(){let content='';if(state.page==='home')content=home();if(state.page==='products')content=products();if(state.page==='sales')content=sales();if(state.page==='more')content=more();app.innerHTML=shell(content);bindCommon()}
function home(){const d=state.dashboard||{inventory:{units:0,out_of_stock:0},month:{sales:0,revenue:0,commission:0},top:[],trend:[]};return `<div class="actions"><button class="btn large" id="addProduct">＋ Carica prodotto</button><button class="btn large secondary" id="newSale">⌁ Registra vendita</button></div><div class="grid ${state.admin?'three':'two'}"><div class="card stat"><span class="muted">Prodotti disponibili</span><strong>${d.inventory.units||0}</strong></div><div class="card stat"><span class="muted">Prodotti esauriti</span><strong>${d.inventory.out_of_stock||0}</strong></div><div class="card stat"><span class="muted">Vendite del mese</span><strong>${d.month.sales||0}</strong></div>${state.admin?`<div class="card stat"><span class="muted">Incasso mese</span><strong>${euro(d.month.revenue)}</strong></div><div class="card stat"><span class="muted">Provvigione maturata</span><strong>${euro(d.month.commission)}</strong></div><div class="card stat"><span class="muted">Da incassare</span><strong>${euro(d.month.commission_due)}</strong></div>`:''}</div>${state.admin?adminHome(d):recentOps()}`}
function adminHome(d){const max=Math.max(...(d.trend||[]).map(x=>x.revenue),1);return `<div class="grid two" style="margin-top:14px"><div class="card"><h3>Andamento ultimi 12 mesi</h3><div class="chart">${(d.trend||[]).map(x=>`<div class="bar" style="height:${Math.max(8,x.revenue/max*100)}%"><span>${x.period.slice(5)}</span></div>`).join('')||'<span class="muted">Nessun dato</span>'}</div></div><div class="card"><h3>Prodotti più venduti</h3>${(d.top||[]).slice(0,6).map(x=>`<div style="display:flex;justify-content:space-between;padding:8px 0"><span>${x.brand} ${x.name}</span><strong>${x.qty}</strong></div>`).join('')||'<span class="muted">Nessuna vendita</span>'}</div></div><div class="card" style="margin-top:14px"><h3>Prodotti fermi da oltre 90 giorni</h3>${(d.stale||[]).length?d.stale.map(x=>`<div style="display:flex;justify-content:space-between;padding:8px 0"><span>${x.brand} ${x.name}</span><span class="muted">${x.current_qty} pz</span></div>`).join(''):'<span class="muted">Nessun prodotto fermo.</span>'}</div>`}
function recentOps(){return `<div class="card" style="margin-top:14px"><h3>Ultime vendite</h3>${state.sales.slice(0,6).map(s=>`<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #eee"><span>${s.sale_code}<br><small class="muted">${new Date(s.occurred_at).toLocaleString('it-IT')}</small></span><strong>${euro(s.total)}</strong></div>`).join('')||'<span class="muted">Nessuna vendita.</span>'}</div>`}
function products(){return `<div class="section-title"><h2>Magazzino</h2><button class="btn" id="addProduct">＋ Nuovo</button></div><div class="toolbar"><input class="input" id="productSearch" placeholder="Cerca codice, nome, marca..."><button class="btn secondary" id="importBtn">Importa CSV/XLSX</button></div><div class="table-wrap"><table><thead><tr><th>Prodotto</th><th>Codice</th><th>Taglia</th><th>Prezzo</th><th>Quantità</th><th>Stato</th><th></th></tr></thead><tbody>${state.products.map(p=>`<tr><td><strong>${p.brand||''} ${p.model||p.name||'Senza modello'}</strong><br><small class="muted">${p.category||''} ${p.color||''}</small></td><td>${p.barcode||p.internal_code}</td><td>${p.size||'—'}</td><td><small class="muted">Listino ${euro(p.list_price)}</small><br><strong>${euro(baseSalePrice(p))}</strong></td><td>${p.current_qty}</td><td><span class="badge ${p.current_qty>0?'ok':'bad'}">${p.current_qty>0?'Disponibile':'Esaurito'}</span></td><td><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn ghost editProduct" data-id="${p.id}">Modifica</button>${state.admin?`<button class="btn danger deleteProduct" data-id="${p.id}">Elimina</button>`:''}</div></td></tr>`).join('')}</tbody></table></div>`}
function saleDisplayStatus(s){if(s.status!=='completed')return {label:'Eliminata',cls:'bad'};const returned=Number(s.returned_amount)||0;if(returned<=0)return {label:'Completata',cls:'ok'};if(returned+0.005>=Number(s.total||0))return {label:'Resa totalmente',cls:'warn'};return {label:'Reso parziale',cls:'warn'}}
function sales(){return `<div class="section-title"><h2>Vendite</h2><button class="btn" id="newSale">＋ Registra</button></div><div class="table-wrap"><table><thead><tr><th>Codice vendita</th><th>Barcode prodotti</th><th>Data</th><th>Articoli</th><th>Sconto</th><th>Vendita originale</th><th>Resi</th><th>Netto</th><th>Stato</th><th></th></tr></thead><tbody>${state.sales.map(s=>{const st=saleDisplayStatus(s);const returned=Number(s.returned_amount)||0;const net=s.status==='completed'?Math.max(0,Number(s.total)-returned):0;return `<tr><td>${s.sale_code}</td><td><small>${(s.product_barcodes||'—').split(',').join('<br>')}</small></td><td>${new Date(s.occurred_at).toLocaleString('it-IT')}</td><td>${s.items_count}</td><td>${euro(s.discount_total)}</td><td><strong>${euro(s.total)}</strong></td><td>${euro(returned)}</td><td><strong>${euro(net)}</strong></td><td><span class="badge ${st.cls}">${st.label}</span></td><td><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn ghost saleDetail" data-id="${s.id}">Apri</button>${state.admin&&s.status==='completed'?`<button class="btn danger deleteSale" data-id="${s.id}" data-code="${s.sale_code}">Elimina</button>`:''}</div></td></tr>`}).join('')}</tbody></table></div>`}
function more(){return `<h2>Strumenti</h2><div class="grid two"><button class="card btn secondary" id="movementsBtn">Storico movimenti</button><button class="card btn secondary" id="returnsBtn">Registro resi</button>${state.admin?'<button class="card btn secondary" id="commissionsBtn">Provvigioni</button><button class="card btn secondary" id="auditBtn">Registro attività</button><button class="card btn secondary" id="exportBtn">Esporta report</button>':''}</div><div class="card" style="margin-top:14px"><h3>Installazione su iPhone</h3><p class="muted">Apri il sito in Safari, premi Condividi e scegli “Aggiungi alla schermata Home”.</p></div>`}

function bindCommon(){document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{state.page=b.dataset.page;render()});document.querySelector('#scanNav')?.addEventListener('click',()=>openScanner('sale'));document.querySelectorAll('#addProduct').forEach(b=>b.onclick=()=>openScanner('product'));document.querySelectorAll('#newSale').forEach(b=>b.onclick=()=>openScanner('sale'));document.querySelector('#adminLogin')?.addEventListener('click',openLogin);document.querySelector('#logout')?.addEventListener('click',async()=>{await api('/api/auth/logout',{method:'POST'});state.admin=false;render()});document.querySelectorAll('.editProduct').forEach(b=>b.onclick=()=>openProduct(state.products.find(x=>x.id==b.dataset.id)));document.querySelectorAll('.deleteProduct').forEach(b=>b.onclick=()=>deleteProduct(b.dataset.id));document.querySelectorAll('.saleDetail').forEach(b=>b.onclick=()=>openSaleDetail(b.dataset.id));document.querySelectorAll('.deleteSale').forEach(b=>b.onclick=()=>deleteSale(b.dataset.id,b.dataset.code));document.querySelector('#productSearch')?.addEventListener('input',e=>{const q=e.target.value.toLowerCase();document.querySelectorAll('tbody tr').forEach(r=>r.style.display=r.textContent.toLowerCase().includes(q)?'':'none')});document.querySelector('#importBtn')?.addEventListener('click',openImport);document.querySelector('#movementsBtn')?.addEventListener('click',openMovements);document.querySelector('#returnsBtn')?.addEventListener('click',openReturns);document.querySelector('#commissionsBtn')?.addEventListener('click',openCommissions);document.querySelector('#auditBtn')?.addEventListener('click',openAudit);document.querySelector('#exportBtn')?.addEventListener('click',exportMenu)}
async function deleteProduct(id){
  if(!state.admin)return;
  const p=state.products.find(x=>String(x.id)===String(id));
  const label=[p?.brand,p?.model||p?.name,p?.barcode||p?.internal_code].filter(Boolean).join(' · ');
  if(!confirm(`Eliminare dal magazzino ${label||'questo articolo'}?\n\nL’articolo non sarà più visibile nello stock, ma resterà collegato allo storico delle vendite.`))return;
  const reason=prompt('Motivo eliminazione articolo:','Rimosso dal magazzino');
  if(reason===null)return;
  try{await api(`/api/products/${id}`,{method:'DELETE',body:JSON.stringify({reason})});alert('Articolo eliminato dal magazzino.');await refresh()}catch(e){alert(`Articolo non eliminato: ${e.message}`)}
}

async function deleteSale(id,code=''){
  if(!state.admin)return;
  if(!confirm(`Eliminare la transazione ${code||''}?\n\nL’incasso verrà stornato automaticamente, le provvigioni saranno ricalcolate e la merce non ancora resa tornerà in magazzino.`))return;
  const reason=prompt('Motivo eliminazione transazione:','Errore di registrazione');
  if(reason===null)return;
  if(!reason.trim())return alert('Inserisci il motivo dell’eliminazione.');
  try{const r=await api(`/api/sales/${id}/cancel`,{method:'POST',body:JSON.stringify({reason:reason.trim()})});alert(`Transazione eliminata.\nIncasso stornato: ${euro(r.reversed_amount)}`);await refresh()}catch(e){alert(`Transazione non eliminata: ${e.message}`)}
}

function modal(html){const el=document.createElement('div');el.className='modal';el.innerHTML=`<div class="modal-panel"><div class="modal-head"><h2 style="margin:0">${html.title||''}</h2><button class="close">×</button></div>${html.body}</div>`;document.body.appendChild(el);el.querySelector('.close').onclick=()=>{state.scanner?.reset?.();el.remove()};return el}
function openLogin(){const m=modal({title:'Accesso amministratore',body:`<form id="loginForm"><div class="field"><label>Email</label><input class="input" name="email" type="email" value="effestrategy@gmail.com"></div><div class="field" style="margin-top:12px"><label>Password</label><input class="input" name="password" type="password" required></div><button class="btn" style="width:100%;margin-top:16px">Accedi</button></form>`});m.querySelector('form').onsubmit=async e=>{e.preventDefault();const o=Object.fromEntries(new FormData(e.target));try{await api('/api/auth/login',{method:'POST',body:JSON.stringify(o)});state.admin=true;m.remove();refresh()}catch(err){alert(err.message)}}}
function productLabel(p){return [p.brand,p.model||p.name,p.category,p.color,p.size].filter(Boolean).join(' · ')||'Prodotto senza descrizione'}
function baseSalePrice(p){const v=Number(p.sale_price);return Number.isFinite(v)&&v>=0?v:Number(p.list_price)||0}
function itemFinalPrice(x){const base=baseSalePrice(x.product);const value=Math.max(0,Number(x.discount_value)||0);if(x.discount_type==='percent')return Math.max(0,base-(base*Math.min(value,100)/100));return Math.max(0,base-value)}
function cartTotals(){return state.cart.reduce((a,x)=>{const base=baseSalePrice(x.product)*x.quantity;const total=itemFinalPrice(x)*x.quantity;return {subtotal:a.subtotal+base,total:a.total+total,discount:a.discount+(base-total)}},{subtotal:0,total:0,discount:0})}

function openProduct(p={}, options={}){
  const isEdit=Boolean(p.id);
  const barcode=p.barcode||options.barcode||'';
  const fields=[
    ['brand','Marca','text'],['category','Categoria','text'],['model','Modello','text'],['color','Colore','text'],['size','Taglia','text'],
    [isEdit?'current_qty':'quantity','Quantità','number'],['list_price','Prezzo listino','number'],['sale_price','Prezzo vendita','number'],['notes','Note','text']
  ];
  const m=modal({title:isEdit?'Modifica prodotto':'Dati del nuovo capo',body:`<form id="productForm">
    <div class="barcode-confirm"><span>Codice a barre</span><strong>${barcode||p.internal_code||'Codice interno automatico'}</strong></div>
    <input type="hidden" name="barcode" value="${barcode}">
    <div class="form-grid">${fields.map(([n,l,t])=>`<div class="field ${n==='notes'?'full':''}"><label>${l}</label>${n==='notes'?`<textarea class="input" name="${n}" rows="3">${p[n]??''}</textarea>`:`<input class="input" name="${n}" type="${t}" ${t==='number'?'min="0" step="'+(n.includes('price')?'0.01':'1')+'"':''} value="${p[n]??''}">`}</div>`).join('')}</div>
    <button class="btn" style="width:100%;margin-top:16px">${isEdit?'Salva modifiche':'Registra prodotto'}</button>
  </form>`});
  m.querySelector('form').onsubmit=async e=>{
    e.preventDefault();const o=Object.fromEntries(new FormData(e.target));
    o.name=o.model||o.category||'';
    try{
      if(!state.online){queue({type:isEdit?'product_update':'product_create',id:p.id,data:o});m.remove();alert('Salvato offline. Sarà sincronizzato.');return}
      await api(isEdit?`/api/products/${p.id}`:'/api/products',{method:isEdit?'PUT':'POST',body:JSON.stringify(o)});
      m.remove();refresh();
    }catch(err){alert(err.message)}
  };
}

async function openScanner(mode='sale'){
  if(mode==='sale') state.cart=[];
  const m=modal({title:mode==='sale'?'Registra vendita':'Scansiona il codice del prodotto',body:`
    <div class="scanner"><video id="video"></video><div class="scanner-tip">Inquadra il codice a barre con la fotocamera.</div></div>
    <div class="manual-row"><input id="manualCode" class="input" inputmode="numeric" placeholder="Inserisci il barcode manualmente"><button class="btn" id="manualGo">Continua</button></div>
    ${mode==='sale'?`<div class="product-search"><input id="productQuery" class="input" placeholder="Oppure cerca per marca, modello, categoria..."><button class="btn secondary" id="productSearchGo">Cerca prodotto</button></div><div id="searchResults"></div>`:''}
    <div id="scanCart" style="margin-top:14px"></div>`});

  const stopScanner=()=>{try{state.scanner?.reset?.()}catch{} state.scanner=null};
  const handle=async code=>{
    code=String(code||'').trim();if(!code||m.dataset.busy)return;
    m.dataset.busy='1';setTimeout(()=>m.dataset.busy='',900);
    try{
      const p=await api(`/api/products/lookup/${encodeURIComponent(code)}`);
      if(mode==='sale'){addCart(p);renderScannerCart(m);navigator.vibrate?.(80)}
      else{
        stopScanner();m.remove();
        if(confirm(`Il codice ${code} è già registrato. Vuoi aprire il prodotto?`))openProduct(p);
      }
    }catch(err){
      if(mode==='product'){
        stopScanner();m.remove();openProduct({barcode:code},{barcode:code});
      }else alert('Nessun prodotto trovato con questo barcode. Caricalo prima nel magazzino.');
    }
  };
  m.querySelector('#manualGo').onclick=()=>handle(m.querySelector('#manualCode').value);
  m.querySelector('#manualCode').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();handle(e.target.value)}});

  if(mode==='sale'){
    const search=async()=>{
      const q=m.querySelector('#productQuery').value.trim();if(!q)return;
      try{
        const rows=await api(`/api/products?q=${encodeURIComponent(q)}`);
        const box=m.querySelector('#searchResults');
        box.innerHTML=rows.length?`<div class="search-list">${rows.slice(0,12).map(p=>`<button class="search-result" data-id="${p.id}"><span><strong>${productLabel(p)}</strong><small>${p.barcode||p.internal_code} · ${euro(baseSalePrice(p))} · ${p.current_qty} pz</small></span><b>＋</b></button>`).join('')}</div>`:'<p class="muted">Nessun prodotto trovato.</p>';
        box.querySelectorAll('.search-result').forEach(b=>b.onclick=()=>{const p=rows.find(x=>x.id==b.dataset.id);addCart(p);renderScannerCart(m)});
      }catch(e){alert(e.message)}
    };
    m.querySelector('#productSearchGo').onclick=search;
    m.querySelector('#productQuery').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();search()}});
  }

  try{
    const reader=new BrowserMultiFormatReader();
    const controls=await reader.decodeFromVideoDevice(undefined,m.querySelector('#video'),result=>{if(result)handle(result.getText())});
    state.scanner={reset:()=>controls.stop()};
  }catch(e){m.querySelector('.scanner-tip').textContent='Fotocamera non disponibile. Inserisci il codice manualmente.'}
  if(mode==='sale')renderScannerCart(m);
}

function addCart(p){
  const x=state.cart.find(i=>i.product.id===p.id);
  if(x)x.quantity++;
  else state.cart.push({product:p,quantity:1,discount_type:'percent',discount_value:0});
}

function renderScannerCart(m){
  const box=m.querySelector('#scanCart');if(!box)return;
  const t=cartTotals();
  box.innerHTML=`<div class="cart-head"><h3>Carrello (${state.cart.reduce((a,x)=>a+x.quantity,0)})</h3>${state.cart.length?'<button class="btn ghost" id="clearCart">Svuota</button>':''}</div>
  ${state.cart.map((x,i)=>`<div class="cart-item sale-cart-item">
    <div class="cart-product"><strong>${productLabel(x.product)}</strong><small>${x.product.barcode||x.product.internal_code} · Prezzo ${euro(baseSalePrice(x.product))}</small></div>
    <div class="field compact"><label>Qtà</label><input class="input qty" data-i="${i}" type="number" min="1" value="${x.quantity}"></div>
    <div class="field compact"><label>Sconto</label><select class="input discountType" data-i="${i}"><option value="percent" ${x.discount_type==='percent'?'selected':''}>%</option><option value="amount" ${x.discount_type==='amount'?'selected':''}>€</option></select></div>
    <div class="field compact"><label>Valore</label><input class="input discountValue" data-i="${i}" type="number" min="0" step="0.01" value="${x.discount_value}"></div>
    <div class="line-total"><span>Totale</span><strong>${euro(itemFinalPrice(x)*x.quantity)}</strong></div>
    <button class="btn danger remove" data-i="${i}">×</button>
  </div>`).join('')||'<p class="muted">Scansiona o cerca il primo prodotto.</p>'}
  <div class="checkout-summary"><div><span>Subtotale</span><strong>${euro(t.subtotal)}</strong></div><div><span>Sconto</span><strong>− ${euro(t.discount)}</strong></div><div class="grand-total"><span>Totale vendita</span><strong>${euro(t.total)}</strong></div><button class="btn" id="checkout" ${state.cart.length?'':'disabled'}>Conferma vendita</button></div>`;
  box.querySelectorAll('.qty').forEach(el=>el.onchange=()=>{state.cart[el.dataset.i].quantity=Math.max(1,+el.value||1);renderScannerCart(m)});
  box.querySelectorAll('.discountType').forEach(el=>el.onchange=()=>{state.cart[el.dataset.i].discount_type=el.value;renderScannerCart(m)});
  box.querySelectorAll('.discountValue').forEach(el=>el.oninput=()=>{state.cart[el.dataset.i].discount_value=Math.max(0,+el.value||0);renderScannerCart(m)});
  box.querySelectorAll('.remove').forEach(el=>el.onclick=()=>{state.cart.splice(el.dataset.i,1);renderScannerCart(m)});
  box.querySelector('#clearCart')?.addEventListener('click',()=>{state.cart=[];renderScannerCart(m)});
  box.querySelector('#checkout').onclick=()=>checkout(m);
}

async function checkout(m){
  const payload={items:state.cart.map(x=>({product_id:x.product.id,quantity:x.quantity,discount_type:x.discount_type,discount_value:x.discount_value})),source:'store'};
  try{
    if(!state.online){queue({type:'sale_create',data:payload});state.cart=[];state.scanner?.reset?.();m.remove();alert('Vendita salvata offline.');return}
    const r=await api('/api/sales',{method:'POST',body:JSON.stringify(payload)});
    state.cart=[];state.scanner?.reset?.();m.remove();alert(`Vendita ${r.sale_code} registrata.\nBarcode: ${(r.product_barcodes||[]).join(', ')||'—'}\nTotale ${euro(r.total)}`);refresh();
  }catch(e){alert(`Vendita non registrata: ${e.message}`)}
}

async function openSaleDetail(id){
  try{
    const s=await api(`/api/sales/${id}`);
    const returnedAmount=(s.returns||[]).reduce((a,r)=>a+(Number(r.amount)||0),0);
    const itemHtml=s.items.map(i=>{
      const canReturn=s.status==='completed' && i.returned_qty<i.quantity;
      const btn=canReturn?`<button class="btn ghost returnBtn" data-id="${i.id}" data-max="${i.quantity-i.returned_qty}" style="float:right">Registra reso</button>`:'';
      return `<div class="card" style="margin-bottom:8px"><strong>${i.brand} ${i.name}</strong><br><small class="muted">Barcode: ${i.barcode||i.internal_code||'—'}</small><br><span>Venduti: ${i.quantity} × ${euro(i.final_unit_price)} · Resi: ${i.returned_qty||0}</span>${btn}</div>`;
    }).join('');
    const returnsHtml=(s.returns||[]).length?`<h3 style="margin-top:18px">Resi registrati</h3>${s.returns.map(r=>`<div class="card" style="margin-bottom:8px"><strong>${r.return_code||'Reso'}</strong> · ${euro(r.amount)}<br><small class="muted">${new Date(r.created_at).toLocaleString('it-IT')} · Barcode ${r.barcode_snapshot||r.barcode||'—'} · Q.tà ${r.quantity}</small><br><span>${r.reason||'Nessun motivo indicato'}</span></div>`).join('')}`:'';
    const cancelBtn=state.admin && s.status==='completed'?'<button class="btn danger" id="cancelSale" style="width:100%;margin-top:10px">Elimina transazione</button>':'';
    const m=modal({title:`Vendita ${s.sale_code}`,body:`<div class="card"><div style="display:flex;justify-content:space-between"><span>Vendita originale</span><strong>${euro(s.total)}</strong></div><div style="display:flex;justify-content:space-between;margin-top:8px"><span>Resi registrati</span><strong>− ${euro(returnedAmount)}</strong></div><div style="display:flex;justify-content:space-between;margin-top:8px;padding-top:8px;border-top:1px solid #eee"><span>Valore netto</span><strong>${euro(Math.max(0,Number(s.total)-returnedAmount))}</strong></div></div><p class="muted">${new Date(s.occurred_at).toLocaleString('it-IT')}</p>${itemHtml}${returnsHtml}${cancelBtn}`});
    m.querySelectorAll('.returnBtn').forEach(b=>b.onclick=()=>openReturnForm({saleItemId:+b.dataset.id,maxQty:+b.dataset.max,parent:m}));
    m.querySelector('#cancelSale')?.addEventListener('click',async()=>{m.remove();await deleteSale(id,s.sale_code)});
  }catch(e){alert(e.message)}
}

function openReturnForm({saleItemId,maxQty,parent}){
  const r=modal({title:'Registra reso',body:`<p class="notice">Il reso sarà registrato come operazione separata. La vendita originale non verrà modificata.</p><div class="field"><label>Quantità da rendere</label><input class="input" id="returnQty" type="number" min="1" max="${maxQty}" value="1"></div><div class="field" style="margin-top:12px"><label>Motivo del reso</label><textarea class="input" id="returnReason" rows="3" placeholder="Es. taglia errata, difetto, ripensamento" required></textarea></div><button class="btn" id="confirmReturn" style="width:100%;margin-top:16px">Conferma e registra reso</button>`});
  r.querySelector('#confirmReturn').onclick=async()=>{
    const quantity=Math.max(1,parseInt(r.querySelector('#returnQty').value||1));
    const reason=r.querySelector('#returnReason').value.trim();
    if(quantity>maxQty)return alert(`Puoi rendere al massimo ${maxQty} articolo/i.`);
    if(!reason)return alert('Inserisci il motivo del reso.');
    try{const result=await api('/api/returns',{method:'POST',body:JSON.stringify({sale_item_id:saleItemId,quantity,reason})});alert(`Reso ${result.return_code} registrato.\nImporto stornato: ${euro(result.amount)}`);r.remove();parent?.remove();refresh()}catch(e){alert(`Reso non registrato: ${e.message}`)}
  };
}

function openImport(){const m=modal({title:'Importa prodotti',body:`<p class="muted">Colonne supportate: barcode, brand, category, model, color, size, list_price, sale_price, quantity, notes.</p><input type="file" id="file" class="input" accept=".csv,.xlsx,.xls"><button class="btn" id="doImport" style="width:100%;margin-top:12px">Importa</button>`});m.querySelector('#doImport').onclick=async()=>{const f=m.querySelector('#file').files[0];if(!f)return alert('Seleziona un file');const buf=await f.arrayBuffer();const wb=XLSX.read(buf);const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});const r=await api('/api/products/import',{method:'POST',body:JSON.stringify({rows})});alert(`Inseriti: ${r.inserted}\nAggiornati: ${r.updated}\nErrori: ${r.errors.length}`);m.remove();refresh()}}
async function openMovements(){const rows=await api('/api/movements');modal({title:'Storico movimenti',body:`<div class="table-wrap"><table><thead><tr><th>Data</th><th>Prodotto</th><th>Tipo</th><th>Movimento</th><th>Quantità</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${new Date(x.created_at).toLocaleString('it-IT')}</td><td>${x.brand} ${x.name}</td><td>${x.type}</td><td>${x.quantity>0?'+':''}${x.quantity}</td><td>${x.previous_qty} → ${x.new_qty}</td></tr>`).join('')}</tbody></table></div>`})}
async function openReturns(){
  try{
    const rows=await api('/api/returns');
    modal({title:'Registro resi',body:`<div class="table-wrap"><table><thead><tr><th>Codice reso</th><th>Data</th><th>Vendita origine</th><th>Prodotto / Barcode</th><th>Q.tà</th><th>Importo stornato</th><th>Motivo</th></tr></thead><tbody>${rows.map(r=>`<tr><td><strong>${r.return_code||'—'}</strong></td><td>${new Date(r.created_at).toLocaleString('it-IT')}</td><td>${r.sale_code}</td><td>${r.brand||''} ${r.model||r.name||''}<br><small>${r.barcode_snapshot||r.barcode||r.internal_code||'—'}</small></td><td>${r.quantity}</td><td><strong>${euro(r.amount)}</strong></td><td>${r.reason||'—'}</td></tr>`).join('')||'<tr><td colspan="7">Nessun reso registrato.</td></tr>'}</tbody></table></div>`});
  }catch(e){alert(e.message)}
}

async function openCommissions(){const rows=await api('/api/commissions');const m=modal({title:'Provvigioni mensili',body:`<div class="table-wrap"><table><thead><tr><th>Mese</th><th>Vendite</th><th>Provvigione</th><th>Pagata</th><th>Da incassare</th><th></th></tr></thead><tbody>${rows.map(x=>`<tr><td>${x.period}</td><td>${euro(x.revenue)}</td><td>${euro(x.commission)}</td><td>${euro(x.paid)}</td><td><strong>${euro(x.due)}</strong></td><td><button class="btn ghost pay" data-period="${x.period}" data-amount="${x.commission}">Segna pagata</button></td></tr>`).join('')}</tbody></table></div>`});m.querySelectorAll('.pay').forEach(b=>b.onclick=async()=>{await api('/api/commissions/pay',{method:'POST',body:JSON.stringify({period:b.dataset.period,amount:+b.dataset.amount})});m.remove();openCommissions()})}
async function openAudit(){const rows=await api('/api/audit');modal({title:'Registro attività',body:`<div class="table-wrap"><table><thead><tr><th>Data</th><th>Utente</th><th>Azione</th><th>Elemento</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${new Date(x.created_at).toLocaleString('it-IT')}</td><td>${x.actor}</td><td>${x.action}</td><td>${x.entity_type} #${x.entity_id||''}</td></tr>`).join('')}</tbody></table></div>`})}
function exportMenu(){const rows=state.sales.map(s=>({Codice:s.sale_code,Data:s.occurred_at,Articoli:s.items_count,Subtotale:s.subtotal,Sconto:s.discount_total,Totale:s.total,Stato:s.status}));const ws=XLSX.utils.json_to_sheet(rows);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Vendite');XLSX.writeFile(wb,'report-vendite-mb.xlsx');const pdf=new jsPDF();pdf.text('Gestionale MB - Report vendite',14,18);rows.slice(0,45).forEach((r,i)=>pdf.text(`${r.Data.slice(0,10)}  ${r.Codice}  EUR ${r.Totale}`,14,30+i*5));pdf.save('report-vendite-mb.pdf')}
function queue(item){const q=JSON.parse(localStorage.getItem('mb_queue')||'[]');q.push({...item,queued_at:new Date().toISOString()});localStorage.setItem('mb_queue',JSON.stringify(q))}
async function syncQueue(){const q=JSON.parse(localStorage.getItem('mb_queue')||'[]');if(!q.length)return;const rest=[];for(const x of q){try{if(x.type==='product_create')await api('/api/products',{method:'POST',body:JSON.stringify(x.data)});if(x.type==='product_update')await api(`/api/products/${x.id}`,{method:'PUT',body:JSON.stringify(x.data)});if(x.type==='sale_create')await api('/api/sales',{method:'POST',body:JSON.stringify(x.data)})}catch{rest.push(x)}}localStorage.setItem('mb_queue',JSON.stringify(rest));refresh()}

(async()=>{try{const me=await api('/api/auth/me');state.admin=me.authenticated}catch{}await refresh();syncQueue()})();
