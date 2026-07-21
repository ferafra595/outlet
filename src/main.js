import './styles.css';
import { BrowserMultiFormatReader } from '@zxing/browser';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';

const app=document.querySelector('#app');
const state={page:'home',admin:false,products:[],sales:[],returns:[],salesSummary:{net_revenue:0,gross_revenue:0,returns_amount:0,sales_count:0},salesView:'sales',dashboard:null,cart:[],online:navigator.onLine,scanner:null};
const euro=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(Number(n)||0);
const api=async(path,opts={})=>{const r=await fetch(path,{headers:{'content-type':'application/json',...(opts.headers||{})},...opts});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Errore');return d};
const icon=(x)=>x;

window.addEventListener('online',()=>{state.online=true;syncQueue();render()});
window.addEventListener('offline',()=>{state.online=false;render()});

function shellLegacy(content){return `<div class="app"><header class="topbar"><div><div class="brand">Gestionale MB</div><div class="muted">${state.admin?'Area amministratore':'Area store'}</div></div><div>${state.online?'<span class="badge ok">Online</span>':'<span class="badge warn">Offline</span>'} ${state.admin?'<button class="btn ghost" id="logout">Esci</button>':'<button class="btn ghost" id="adminLogin">Admin</button>'}</div></header><main class="container">${!state.online?'<div class="notice offline">Sei offline: le operazioni verranno salvate e sincronizzate appena torna Internet.</div>':''}${content}</main>${nav()}</div>`}
function nav(){return `<nav class="bottomnav"><button class="navbtn ${state.page==='home'?'active':''}" data-page="home">⌂<br>Home</button><button class="navbtn ${state.page==='products'?'active':''}" data-page="products">▦<br>Magazzino</button><button class="navbtn scan-main" id="scanNav">⌁</button><button class="navbtn ${state.page==='sales'?'active':''}" data-page="sales">€<br>Vendite</button><button class="navbtn ${state.page==='more'?'active':''}" data-page="more">•••<br>Altro</button></nav>`}

async function refresh(){try{const [products,sales,returns,summary,dashboard]=await Promise.all([api('/api/products'),api('/api/sales'),api('/api/returns'),api('/api/sales-summary'),api('/api/dashboard')]);state.products=products;state.sales=sales;state.returns=returns;state.salesSummary=summary;state.dashboard=dashboard}catch(e){console.warn(e)}render()}
function render(){let content='';if(state.page==='home')content=home();if(state.page==='products')content=products();if(state.page==='sales')content=sales();if(state.page==='more')content=more();app.innerHTML=shell(content);bindCommon()}
function home(){const d=state.dashboard||{inventory:{units:0,out_of_stock:0},month:{sales:0,revenue:0,commission:0},top:[],trend:[]};return `<div class="actions"><button class="btn large" id="addProduct">＋ Carica prodotto</button><button class="btn large secondary" id="newSale">⌁ Registra vendita</button></div><div class="grid ${state.admin?'three':'two'}"><div class="card stat"><span class="muted">Prodotti disponibili</span><strong>${d.inventory.units||0}</strong></div><div class="card stat"><span class="muted">Prodotti esauriti</span><strong>${d.inventory.out_of_stock||0}</strong></div><div class="card stat"><span class="muted">Vendite del mese</span><strong>${d.month.sales||0}</strong></div>${state.admin?`<div class="card stat"><span class="muted">Incasso mese</span><strong>${euro(d.month.revenue)}</strong></div><div class="card stat"><span class="muted">Provvigione maturata</span><strong>${euro(d.month.commission)}</strong></div><div class="card stat"><span class="muted">Da incassare</span><strong>${euro(d.month.commission_due)}</strong></div>`:''}</div>${state.admin?adminHome(d):recentOps()}`}
function adminHomeLegacy(d){const max=Math.max(...(d.trend||[]).map(x=>x.revenue),1);return `<div class="grid two" style="margin-top:14px"><div class="card"><h3>Andamento ultimi 12 mesi</h3><div class="chart">${(d.trend||[]).map(x=>`<div class="bar" style="height:${Math.max(8,x.revenue/max*100)}%"><span>${x.period.slice(5)}</span></div>`).join('')||'<span class="muted">Nessun dato</span>'}</div></div><div class="card"><h3>Prodotti più venduti</h3>${(d.top||[]).slice(0,6).map(x=>`<div style="display:flex;justify-content:space-between;padding:8px 0"><span>${x.brand} ${x.name}</span><strong>${x.qty}</strong></div>`).join('')||'<span class="muted">Nessuna vendita</span>'}</div></div><div class="card" style="margin-top:14px"><h3>Prodotti fermi da oltre 90 giorni</h3>${(d.stale||[]).length?d.stale.map(x=>`<div style="display:flex;justify-content:space-between;padding:8px 0"><span>${x.brand} ${x.name}</span><span class="muted">${x.current_qty} pz</span></div>`).join(''):'<span class="muted">Nessun prodotto fermo.</span>'}</div>`}
function recentOps(){return `<div class="card" style="margin-top:14px"><h3>Ultime vendite</h3>${state.sales.slice(0,6).map(s=>`<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #eee"><span>${s.sale_code}<br><small class="muted">${new Date(s.occurred_at).toLocaleString('it-IT')}</small></span><strong>${euro(s.total)}</strong></div>`).join('')||'<span class="muted">Nessuna vendita.</span>'}</div>`}
function productsLegacy(){return `<div class="section-title"><h2>Magazzino</h2><button class="btn" id="addProduct">＋ Nuovo</button></div><div class="toolbar"><input class="input" id="productSearch" placeholder="Cerca codice, nome, marca..."><button class="btn secondary" id="importBtn">Importa CSV/XLSX</button></div><div class="table-wrap"><table><thead><tr><th>Prodotto</th><th>Codice</th><th>Taglia</th><th>Prezzo</th><th>Quantità</th><th>Stato</th><th></th></tr></thead><tbody>${state.products.map(p=>`<tr><td><strong>${p.brand||''} ${p.model||p.name||'Senza modello'}</strong><br><small class="muted">${p.category||''} ${p.color||''}</small></td><td>${p.barcode||p.internal_code}</td><td>${p.size||'—'}</td><td><small class="muted">Listino ${euro(p.list_price)}</small><br><strong>${euro(baseSalePrice(p))}</strong></td><td>${p.current_qty}</td><td><span class="badge ${p.current_qty>0?'ok':'bad'}">${p.current_qty>0?'Disponibile':'Esaurito'}</span></td><td><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn ghost editProduct" data-id="${p.id}">Modifica</button>${state.admin?`<button class="btn danger deleteProduct" data-id="${p.id}">Elimina</button>`:''}</div></td></tr>`).join('')}</tbody></table></div>`}
function saleDisplayStatus(s){const returned=Number(s.returned_amount)||0;if(returned<=0)return {label:'Completata',cls:'ok'};if(returned+0.005>=Number(s.total||0))return {label:'Reso',cls:'warn'};return {label:'Reso parziale',cls:'warn'}}
function sales(){
  const summary=state.salesSummary||{};
  const tabs=`<div class="sales-tabs"><button class="sales-tab ${state.salesView==='sales'?'active':''}" data-sales-view="sales">Vendite</button><button class="sales-tab ${state.salesView==='returns'?'active':''}" data-sales-view="returns">Resi <span class="tab-count">${state.returns.length}</span></button></div>`;
  const cards=`<div class="grid three sales-summary"><div class="card stat"><span class="muted">Totale netto fatturato</span><strong>${euro(summary.net_revenue)}</strong></div><div class="card stat"><span class="muted">Vendite registrate</span><strong>${summary.sales_count||0}</strong></div><div class="card stat"><span class="muted">Totale resi</span><strong>${euro(summary.returns_amount)}</strong></div></div>`;
  return `<div class="section-title"><h2>Vendite</h2><button class="btn" id="newSale">＋ Registra</button></div>${tabs}${cards}${state.salesView==='returns'?returnsSection():salesSection()}`;
}
function salesSectionLegacy(){
  const rows=state.sales.map(s=>{const st=saleDisplayStatus(s);const returned=Number(s.returned_amount)||0;const net=Math.max(0,Number(s.total)-returned);return `<tr><td>${state.admin?`<input type="checkbox" class="saleSelect" value="${s.id}" aria-label="Seleziona ${s.sale_code}">`:''}</td><td>${s.sale_code}</td><td><small>${(s.product_barcodes||'—').split(',').join('<br>')}</small></td><td>${new Date(s.occurred_at).toLocaleString('it-IT')}</td><td>${s.items_count}</td><td>${euro(s.discount_total)}</td><td><strong>${euro(s.total)}</strong></td><td><strong>${euro(net)}</strong></td><td><span class="badge ${st.cls}">${st.label}</span></td><td><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn ghost saleDetail" data-id="${s.id}">Apri</button>${state.admin?`<button class="btn danger deleteSale" data-id="${s.id}" data-code="${s.sale_code}">Elimina</button>`:''}</div></td></tr>`}).join('');
  return `${state.admin?`<div class="bulk-bar"><label><input type="checkbox" id="selectAllSales"> Seleziona tutte</label><button class="btn danger" id="bulkDeleteSales" disabled>Elimina selezionate</button></div>`:''}<div class="table-wrap"><table><thead><tr><th>${state.admin?'Sel.':''}</th><th>Codice vendita</th><th>Barcode prodotti</th><th>Data</th><th>Articoli</th><th>Sconto</th><th>Vendita originale</th><th>Netto</th><th>Stato</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="10">Nessuna vendita registrata.</td></tr>'}</tbody></table></div>`;
}
function returnsSection(){
  const rows=state.returns.map(r=>`<tr><td><strong>${r.return_code||'—'}</strong></td><td>${new Date(r.created_at).toLocaleString('it-IT')}</td><td>${r.sale_code}</td><td>${r.brand||''} ${r.model||r.name||''}<br><small>${r.barcode_snapshot||r.barcode||r.internal_code||'—'}</small></td><td>${r.quantity}</td><td><strong>${euro(r.amount)}</strong></td><td>${r.reason||'—'}</td></tr>`).join('');
  const total=state.returns.reduce((sum,r)=>sum+(Number(r.amount)||0),0);
  return `<div class="returns-total"><span>Totale importi stornati</span><strong>${euro(total)}</strong></div><div class="table-wrap"><table><thead><tr><th>Codice reso</th><th>Data</th><th>Vendita origine</th><th>Prodotto / Barcode</th><th>Q.tà</th><th>Importo stornato</th><th>Motivo</th></tr></thead><tbody>${rows||'<tr><td colspan="7">Nessun reso registrato.</td></tr>'}</tbody></table></div>`;
}
function moreLegacy(){return `<h2>Strumenti</h2><div class="grid two"><button class="card btn secondary" id="movementsBtn">Storico movimenti</button><button class="card btn secondary" id="returnsBtn">Registro resi</button>${state.admin?'<button class="card btn secondary" id="commissionsBtn">Provvigioni</button><button class="card btn secondary" id="auditBtn">Registro attività</button><button class="card btn secondary" id="exportBtn">Esporta report</button>':''}</div><div class="card" style="margin-top:14px"><h3>Installazione su iPhone</h3><p class="muted">Apri il sito in Safari, premi Condividi e scegli “Aggiungi alla schermata Home”.</p></div>`}

function bindCommonLegacy(){
  document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{state.page=b.dataset.page;render()});
  document.querySelectorAll('[data-sales-view]').forEach(b=>b.onclick=()=>{state.salesView=b.dataset.salesView;render()});
  document.querySelector('#scanNav')?.addEventListener('click',()=>openScanner('sale'));
  document.querySelectorAll('#addProduct').forEach(b=>b.onclick=()=>openScanner('product'));
  document.querySelectorAll('#newSale').forEach(b=>b.onclick=()=>openScanner('sale'));
  document.querySelector('#adminLogin')?.addEventListener('click',openLogin);
  document.querySelector('#logout')?.addEventListener('click',async()=>{await api('/api/auth/logout',{method:'POST'});state.admin=false;render()});
  document.querySelectorAll('.editProduct').forEach(b=>b.onclick=()=>openProduct(state.products.find(x=>x.id==b.dataset.id)));
  document.querySelectorAll('.deleteProduct').forEach(b=>b.onclick=()=>deleteProduct(b.dataset.id));
  document.querySelectorAll('.saleDetail').forEach(b=>b.onclick=()=>openSaleDetail(b.dataset.id));
  document.querySelectorAll('.deleteSale').forEach(b=>b.onclick=()=>deleteSale(b.dataset.id,b.dataset.code));
  document.querySelector('#productSearch')?.addEventListener('input',e=>{const q=e.target.value.toLowerCase();document.querySelectorAll('tbody tr').forEach(r=>r.style.display=r.textContent.toLowerCase().includes(q)?'':'none')});
  document.querySelector('#importBtn')?.addEventListener('click',openImport);
  document.querySelector('#movementsBtn')?.addEventListener('click',openMovements);
  document.querySelector('#returnsBtn')?.addEventListener('click',()=>{state.page='sales';state.salesView='returns';render()});
  document.querySelector('#commissionsBtn')?.addEventListener('click',openCommissions);
  document.querySelector('#auditBtn')?.addEventListener('click',openAudit);
  document.querySelector('#exportBtn')?.addEventListener('click',exportMenu);
  const selectAll=document.querySelector('#selectAllSales');
  const bulkBtn=document.querySelector('#bulkDeleteSales');
  const selections=()=>[...document.querySelectorAll('.saleSelect:checked')].map(x=>Number(x.value));
  const updateBulk=()=>{if(bulkBtn){const n=selections().length;bulkBtn.disabled=n===0;bulkBtn.textContent=n?`Elimina selezionate (${n})`:'Elimina selezionate'}};
  document.querySelectorAll('.saleSelect').forEach(x=>x.onchange=updateBulk);
  if(selectAll)selectAll.onchange=()=>{document.querySelectorAll('.saleSelect').forEach(x=>x.checked=selectAll.checked);updateBulk()};
  if(bulkBtn)bulkBtn.onclick=()=>deleteSalesBulk(selections());
}
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

async function deleteSalesBulk(ids){
  if(!ids.length)return;
  const reason=prompt(`Stai per eliminare ${ids.length} transazioni. Inserisci il motivo:`,'Errore di registrazione');
  if(reason===null)return;
  if(!reason.trim())return alert('Inserisci il motivo dell’eliminazione.');
  if(!confirm(`Confermi l’eliminazione di ${ids.length} transazioni? Gli incassi verranno stornati e le quantità ripristinate.`))return;
  try{const r=await api('/api/sales/bulk-cancel',{method:'POST',body:JSON.stringify({ids,reason:reason.trim()})});alert(`${r.deleted} transazioni eliminate.\nIncasso totale stornato: ${euro(r.reversed_amount)}`);await refresh()}catch(e){alert(`Transazioni non eliminate: ${e.message}`)}
}

function modal(html){const el=document.createElement('div');el.className='modal';el.innerHTML=`<div class="modal-panel"><div class="modal-head"><h2 style="margin:0">${html.title||''}</h2><button class="close">×</button></div>${html.body}</div>`;document.body.appendChild(el);el.querySelector('.close').onclick=()=>{state.scanner?.reset?.();el.remove()};return el}
function openLogin(){const m=modal({title:'Accesso amministratore',body:`<form id="loginForm"><div class="field"><label>Email</label><input class="input" name="email" type="email" value="effestrategy@gmail.com"></div><div class="field" style="margin-top:12px"><label>Password</label><input class="input" name="password" type="password" required></div><button class="btn" style="width:100%;margin-top:16px">Accedi</button></form>`});m.querySelector('form').onsubmit=async e=>{e.preventDefault();const o=Object.fromEntries(new FormData(e.target));try{await api('/api/auth/login',{method:'POST',body:JSON.stringify(o)});state.admin=true;m.remove();refresh()}catch(err){alert(err.message)}}}
function productLabel(p){return [p.brand,p.model||p.name,p.category,p.color,p.size].filter(Boolean).join(' · ')||'Prodotto senza descrizione'}
function baseSalePrice(p){const v=Number(p.sale_price);return Number.isFinite(v)&&v>=0?v:Number(p.list_price)||0}
function itemFinalPrice(x){const base=baseSalePrice(x.product);const value=Math.max(0,Number(x.discount_value)||0);if(x.discount_type==='percent')return Math.max(0,base-(base*Math.min(value,100)/100));return Math.max(0,base-value)}
function cartTotals(){return state.cart.reduce((a,x)=>{const base=baseSalePrice(x.product)*x.quantity;const total=itemFinalPrice(x)*x.quantity;return {subtotal:a.subtotal+base,total:a.total+total,discount:a.discount+(base-total)}},{subtotal:0,total:0,discount:0})}

function openProductV17(p={}, options={}){
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
    <div class="field compact"><label>Valore</label><input class="input discountValue" data-i="${i}" type="text" inputmode="decimal" autocomplete="off" value="${x.discount_value}"></div>
    <div class="line-total" data-line-total="${i}"><span>Totale</span><strong>${euro(itemFinalPrice(x)*x.quantity)}</strong></div>
    <button class="btn danger remove" data-i="${i}">×</button>
  </div>`).join('')||'<p class="muted">Scansiona o cerca il primo prodotto.</p>'}
  <div class="checkout-summary"><div><span>Subtotale</span><strong data-cart-subtotal>${euro(t.subtotal)}</strong></div><div><span>Sconto</span><strong data-cart-discount>− ${euro(t.discount)}</strong></div><div class="grand-total"><span>Totale vendita</span><strong data-cart-total>${euro(t.total)}</strong></div><button class="btn" id="checkout" ${state.cart.length?'':'disabled'}>Conferma vendita</button></div>`;
  const updateTotals=()=>{
    state.cart.forEach((item,i)=>{const target=box.querySelector(`[data-line-total="${i}"] strong`);if(target)target.textContent=euro(itemFinalPrice(item)*item.quantity)});
    const totals=cartTotals();
    const subtotal=box.querySelector('[data-cart-subtotal]');if(subtotal)subtotal.textContent=euro(totals.subtotal);
    const discount=box.querySelector('[data-cart-discount]');if(discount)discount.textContent=`− ${euro(totals.discount)}`;
    const total=box.querySelector('[data-cart-total]');if(total)total.textContent=euro(totals.total);
  };
  box.querySelectorAll('.qty').forEach(el=>el.onchange=()=>{state.cart[el.dataset.i].quantity=Math.max(1,+el.value||1);renderScannerCart(m)});
  box.querySelectorAll('.discountType').forEach(el=>el.onchange=()=>{state.cart[el.dataset.i].discount_type=el.value;updateTotals()});
  box.querySelectorAll('.discountValue').forEach(el=>{
    // Su iPhone non riscriviamo mai il valore dell'input durante la digitazione:
    // farlo sposta il cursore e può chiudere la tastiera dopo ogni cifra.
    const clearInitialZero=()=>{
      if(el.dataset.zeroCleared==='1')return;
      if(['0','0,00','0.00'].includes(el.value.trim())){
        el.value='';
        el.dataset.zeroCleared='1';
      }
    };
    el.addEventListener('pointerdown',clearInitialZero);
    el.addEventListener('focus',clearInitialZero);
    el.addEventListener('input',()=>{
      // Manteniamo la stringa digitata intatta per non alterare focus e posizione del cursore.
      const raw=el.value.trim();
      const normalized=raw.replace(',', '.');
      const valid=/^(?:\d+)?(?:\.\d*)?$/.test(normalized);
      if(!valid)return;
      state.cart[el.dataset.i].discount_value=normalized===''?0:Math.max(0,Number(normalized)||0);
      updateTotals();
    });
    el.addEventListener('blur',()=>{
      const normalized=el.value.trim().replace(',', '.');
      const value=normalized===''?0:Math.max(0,Number(normalized)||0);
      state.cart[el.dataset.i].discount_value=value;
      el.value=String(value).replace('.', ',');
      delete el.dataset.zeroCleared;
      updateTotals();
    });
  });
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
const movementLabels={initial_load:'Caricamento iniziale',sale:'Vendita',return:'Reso',sale_cancel:'Annullamento vendita',admin_delete:'Eliminazione articolo',adjustment:'Rettifica magazzino',import:'Importazione',restock:'Rifornimento'};
const auditActionLabels={create:'Creazione',update:'Modifica',delete:'Eliminazione',import:'Importazione',pay:'Pagamento registrato',login:'Accesso',logout:'Uscita'};
const auditEntityLabels={product:'Prodotto',products:'Prodotti',sale:'Vendita',return:'Reso',commission:'Provvigione',user:'Utente'};
const actorLabels={admin:'Amministratore',store:'Negozio'};
const monthLabel=period=>{const [y,m]=String(period||'').split('-');if(!y||!m)return period||'—';return new Date(Number(y),Number(m)-1,1).toLocaleDateString('it-IT',{month:'long',year:'numeric'})};
function progressiveCommissionParts(revenue){const t=Math.max(0,Number(revenue)||0);const first=Math.min(t,5000)*.10;const second=Math.min(Math.max(t-5000,0),2500)*.12;const third=Math.max(t-7500,0)*.15;return {first,second,third,total:first+second+third}}
async function openMovements(){const rows=await api('/api/movements');modal({title:'Storico movimenti',body:`<div class="table-wrap"><table><thead><tr><th>Data</th><th>Prodotto</th><th>Operazione</th><th>Variazione</th><th>Giacenza</th><th>Nota</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${new Date(x.created_at).toLocaleString('it-IT')}</td><td>${[x.brand,x.name].filter(Boolean).join(' ')||'Articolo eliminato'}</td><td><span class="badge">${movementLabels[x.type]||x.type||'Operazione'}</span></td><td><strong>${Number(x.quantity)>0?'+':''}${x.quantity}</strong></td><td>${x.previous_qty} → ${x.new_qty}</td><td>${x.note||'—'}</td></tr>`).join('')||'<tr><td colspan="6">Nessun movimento registrato.</td></tr>'}</tbody></table></div>`})}
async function openReturns(){
  try{
    const rows=await api('/api/returns');
    modal({title:'Registro resi',body:`<div class="table-wrap"><table><thead><tr><th>Codice reso</th><th>Data</th><th>Vendita origine</th><th>Prodotto / Barcode</th><th>Q.tà</th><th>Importo stornato</th><th>Motivo</th></tr></thead><tbody>${rows.map(r=>`<tr><td><strong>${r.return_code||'—'}</strong></td><td>${new Date(r.created_at).toLocaleString('it-IT')}</td><td>${r.sale_code}</td><td>${r.brand||''} ${r.model||r.name||''}<br><small>${r.barcode_snapshot||r.barcode||r.internal_code||'—'}</small></td><td>${r.quantity}</td><td><strong>${euro(r.amount)}</strong></td><td>${r.reason||'—'}</td></tr>`).join('')||'<tr><td colspan="7">Nessun reso registrato.</td></tr>'}</tbody></table></div>`});
  }catch(e){alert(e.message)}
}

async function openCommissions(){
  const rows=await api('/api/commissions');
  const totals=rows.reduce((a,x)=>({gross:a.gross+Number(x.gross_revenue||0),returns:a.returns+Number(x.returns_amount||0),net:a.net+Number(x.revenue||0),commission:a.commission+Number(x.commission||0),paid:a.paid+Number(x.paid||0),due:a.due+Number(x.due||0),sales:a.sales+Number(x.sales_count||0)}),{gross:0,returns:0,net:0,commission:0,paid:0,due:0,sales:0});
  const ordered=[...rows].reverse();
  const max=Math.max(1,...ordered.flatMap(x=>[Number(x.revenue)||0,Number(x.commission)||0]));
  const chart=ordered.length?`<div class="commission-chart">${ordered.map(x=>`<div class="commission-month"><div class="commission-bars"><div class="commission-bar revenue" style="height:${Math.max(4,(Number(x.revenue)||0)/max*100)}%" title="Netto ${euro(x.revenue)}"></div><div class="commission-bar commission" style="height:${Math.max(4,(Number(x.commission)||0)/max*100)}%" title="Provvigione ${euro(x.commission)}"></div></div><span>${String(x.period).slice(5)}/${String(x.period).slice(2,4)}</span></div>`).join('')}</div><div class="chart-legend"><span><i class="legend-dot revenue"></i>Fatturato netto</span><span><i class="legend-dot commission"></i>Provvigione</span></div>`:'<p class="muted">Nessun dato disponibile.</p>';
  const body=`<div class="commission-dashboard"><div class="grid three commission-kpis"><div class="card stat"><span class="muted">Fatturato netto complessivo</span><strong>${euro(totals.net)}</strong><small>${totals.sales} vendite</small></div><div class="card stat"><span class="muted">Provvigioni maturate</span><strong>${euro(totals.commission)}</strong><small>Calcolo progressivo</small></div><div class="card stat"><span class="muted">Da incassare</span><strong>${euro(totals.due)}</strong><small>Pagate ${euro(totals.paid)}</small></div></div><div class="card commission-chart-card"><div class="section-title"><div><h3>Andamento mensile</h3><p class="muted">Confronto tra fatturato netto e provvigioni di ogni mese</p></div></div>${chart}</div><div class="table-wrap commission-table"><table><thead><tr><th>Mese</th><th>N. vendite</th><th>Lordo</th><th>Resi</th><th>Netto</th><th>10% fino a 5.000 €</th><th>12% fino a 7.500 €</th><th>15% oltre 7.500 €</th><th>Provvigione</th><th>Pagata</th><th>Da incassare</th><th></th></tr></thead><tbody>${rows.map(x=>{const p=progressiveCommissionParts(x.revenue);return `<tr><td><strong>${monthLabel(x.period)}</strong></td><td>${x.sales_count||0}</td><td>${euro(x.gross_revenue)}</td><td>${euro(x.returns_amount)}</td><td><strong>${euro(x.revenue)}</strong></td><td>${euro(p.first)}</td><td>${euro(p.second)}</td><td>${euro(p.third)}</td><td><strong>${euro(x.commission)}</strong></td><td>${euro(x.paid)}${x.paid_at?`<br><small>${new Date(x.paid_at).toLocaleDateString('it-IT')}</small>`:''}</td><td><strong>${euro(x.due)}</strong></td><td><button class="btn ghost pay" data-period="${x.period}" data-amount="${x.commission}" ${Number(x.due)<=0?'disabled':''}>${Number(x.due)<=0?'Pagata':'Segna pagata'}</button></td></tr>`}).join('')||'<tr><td colspan="12">Nessuna provvigione disponibile.</td></tr>'}</tbody></table></div></div>`;
  const m=modal({title:'Provvigioni e statistiche mensili',body});
  m.querySelector('.modal-panel')?.classList.add('modal-wide');
  m.querySelectorAll('.pay').forEach(b=>b.onclick=async()=>{if(!confirm(`Confermi il pagamento della provvigione di ${monthLabel(b.dataset.period)}?`))return;await api('/api/commissions/pay',{method:'POST',body:JSON.stringify({period:b.dataset.period,amount:+b.dataset.amount})});m.remove();openCommissions()})
}
async function openAudit(){const rows=await api('/api/audit');modal({title:'Registro attività',body:`<div class="table-wrap"><table><thead><tr><th>Data</th><th>Utente</th><th>Azione</th><th>Elemento</th><th>Riferimento</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${new Date(x.created_at).toLocaleString('it-IT')}</td><td>${actorLabels[x.actor]||x.actor||'Sistema'}</td><td><span class="badge">${auditActionLabels[x.action]||x.action||'Operazione'}</span></td><td>${auditEntityLabels[x.entity_type]||x.entity_type||'Elemento'}</td><td>${x.entity_id?`#${x.entity_id}`:'—'}</td></tr>`).join('')||'<tr><td colspan="5">Nessuna attività registrata.</td></tr>'}</tbody></table></div>`})}
function exportMenu(){const rows=state.sales.map(s=>({Codice:s.sale_code,Data:s.occurred_at,Articoli:s.items_count,Subtotale:s.subtotal,Sconto:s.discount_total,Totale:s.total,Stato:s.status}));const ws=XLSX.utils.json_to_sheet(rows);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Vendite');XLSX.writeFile(wb,'report-vendite-mb.xlsx');const pdf=new jsPDF();pdf.text('Gestionale MB - Report vendite',14,18);rows.slice(0,45).forEach((r,i)=>pdf.text(`${r.Data.slice(0,10)}  ${r.Codice}  EUR ${r.Totale}`,14,30+i*5));pdf.save('report-vendite-mb.pdf')}
function queue(item){const q=JSON.parse(localStorage.getItem('mb_queue')||'[]');q.push({...item,queued_at:new Date().toISOString()});localStorage.setItem('mb_queue',JSON.stringify(q))}
async function syncQueue(){const q=JSON.parse(localStorage.getItem('mb_queue')||'[]');if(!q.length)return;const rest=[];for(const x of q){try{if(x.type==='product_create')await api('/api/products',{method:'POST',body:JSON.stringify(x.data)});if(x.type==='product_update')await api(`/api/products/${x.id}`,{method:'PUT',body:JSON.stringify(x.data)});if(x.type==='sale_create')await api('/api/sales',{method:'POST',body:JSON.stringify(x.data)})}catch{rest.push(x)}}localStorage.setItem('mb_queue',JSON.stringify(rest));refresh()}



// === Gestionale MB v1.7: strumenti operativi amministratore ===
Object.assign(state,{salesFilter:'all',salesDateFrom:'',salesDateTo:'',activeInventory:null});

function shell(content){return `<div class="app"><header class="topbar"><div><div class="brand">Gestionale MB</div><div class="muted">${state.admin?'Area amministratore':'Area store'}</div></div><div>${state.online?'<span class="badge ok">Online</span>':'<span class="badge warn">Offline</span>'} ${state.admin?'<button class="btn ghost" id="globalSearchBtn">⌕ Cerca</button> <button class="btn ghost" id="logout">Esci</button>':'<button class="btn ghost" id="adminLogin">Admin</button>'}</div></header><main class="container">${!state.online?'<div class="notice offline">Sei offline: le operazioni verranno salvate e sincronizzate appena torna Internet.</div>':''}${content}</main>${nav()}</div>`}

function adminHome(d){
  const max=Math.max(...(d.trend||[]).map(x=>x.revenue),1);
  return `<div class="admin-quick-grid">
    <button class="card quick-admin" id="globalSearchBtn2"><strong>Ricerca globale</strong><span>Prodotti, vendite e resi</span></button>
    <button class="card quick-admin" id="inventoryBtn"><strong>Inventario</strong><span>Confronta stock e realtà</span></button>
    <button class="card quick-admin" id="analyticsBtn"><strong>Analisi vendite</strong><span>Marchi, taglie e categorie</span></button>
    <button class="card quick-admin" id="trashBtn"><strong>Cestino</strong><span>Ripristina articoli rimossi</span></button>
  </div><div class="grid two" style="margin-top:14px"><div class="card"><h3>Andamento ultimi 12 mesi</h3><div class="chart">${(d.trend||[]).map(x=>`<div class="bar" style="height:${Math.max(8,x.revenue/max*100)}%"><span>${x.period.slice(5)}</span></div>`).join('')||'<span class="muted">Nessun dato</span>'}</div></div><div class="card"><h3>Prodotti più venduti</h3>${(d.top||[]).slice(0,6).map(x=>`<button class="list-link productDetail" data-id="${x.id}"><span>${x.brand} ${x.name}</span><strong>${x.qty}</strong></button>`).join('')||'<span class="muted">Nessuna vendita</span>'}</div></div><div class="card" style="margin-top:14px"><h3>Prodotti fermi da oltre 90 giorni</h3>${(d.stale||[]).length?d.stale.map(x=>`<button class="list-link productDetail" data-id="${x.id}"><span>${x.brand} ${x.name}</span><span class="muted">${x.current_qty} pz</span></button>`).join(''):'<span class="muted">Nessun prodotto fermo.</span>'}</div>`
}

function productsV17(){return `<div class="section-title"><h2>Magazzino</h2><button class="btn" id="addProduct">＋ Nuovo</button></div><div class="toolbar admin-product-toolbar"><input class="input" id="productSearch" placeholder="Cerca codice, marca, categoria, modello..."><select class="input" id="stockFilter"><option value="all">Tutti</option><option value="available">Disponibili</option><option value="out">Esauriti</option><option value="stale">Fermi da 90 giorni</option></select><button class="btn secondary" id="importBtn">Importa CSV/XLSX</button></div><div class="table-wrap"><table><thead><tr><th>Prodotto</th><th>Codice</th><th>Taglia</th><th>Prezzo</th><th>Quantità</th><th>Stato</th><th></th></tr></thead><tbody>${state.products.map(p=>`<tr data-stock="${p.current_qty>0?'available':'out'}" data-updated="${p.updated_at}"><td><strong>${p.brand||''} ${p.model||p.name||'Senza modello'}</strong><br><small class="muted">${p.category||''} ${p.color||''}</small></td><td>${p.barcode||p.internal_code}</td><td>${p.size||'—'}</td><td><small class="muted">Listino ${euro(p.list_price)}</small><br><strong>${euro(baseSalePrice(p))}</strong></td><td>${p.current_qty}</td><td><span class="badge ${p.current_qty>0?'ok':'bad'}">${p.current_qty>0?'Disponibile':'Esaurito'}</span></td><td><div class="row-actions"><button class="btn ghost productDetail" data-id="${p.id}">Apri</button><button class="btn ghost editProduct" data-id="${p.id}">Modifica</button>${state.admin?`<button class="btn ghost duplicateProduct" data-id="${p.id}">Duplica</button><button class="btn danger deleteProduct" data-id="${p.id}">Elimina</button>`:''}</div></td></tr>`).join('')}</tbody></table></div>`}

function more(){return `<h2>Strumenti</h2><div class="grid two"><button class="card btn secondary" id="movementsBtn">Storico movimenti</button><button class="card btn secondary" id="returnsBtn">Registro resi</button>${state.admin?'<button class="card btn secondary" id="commissionsBtn">Provvigioni</button><button class="card btn secondary" id="analyticsBtn">Analisi vendite</button><button class="card btn secondary" id="inventoryBtn">Inventario fisico</button><button class="card btn secondary" id="trashBtn">Cestino prodotti</button><button class="card btn secondary" id="auditBtn">Registro attività</button><button class="card btn secondary" id="backupBtn">Backup completo</button><button class="card btn secondary" id="exportBtn">Esporta report</button>':''}</div><div class="card" style="margin-top:14px"><h3>Installazione su iPhone</h3><p class="muted">Apri il sito in Safari, premi Condividi e scegli “Aggiungi alla schermata Home”.</p></div>`}

function bindCommonV17(){
  document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{state.page=b.dataset.page;render()});
  document.querySelectorAll('[data-sales-view]').forEach(b=>b.onclick=()=>{state.salesView=b.dataset.salesView;render()});
  document.querySelector('#scanNav')?.addEventListener('click',()=>openScanner('sale'));
  document.querySelectorAll('#addProduct').forEach(b=>b.onclick=()=>openScanner('product'));
  document.querySelectorAll('#newSale').forEach(b=>b.onclick=()=>openScanner('sale'));
  document.querySelector('#adminLogin')?.addEventListener('click',openLogin);
  document.querySelector('#logout')?.addEventListener('click',async()=>{await api('/api/auth/logout',{method:'POST'});state.admin=false;render()});
  document.querySelectorAll('.editProduct').forEach(b=>b.onclick=()=>openProduct(state.products.find(x=>x.id==b.dataset.id)));
  document.querySelectorAll('.productDetail').forEach(b=>b.onclick=()=>openProductDetail(b.dataset.id));
  document.querySelectorAll('.duplicateProduct').forEach(b=>b.onclick=()=>duplicateProduct(b.dataset.id));
  document.querySelectorAll('.deleteProduct').forEach(b=>b.onclick=()=>deleteProduct(b.dataset.id));
  document.querySelectorAll('.saleDetail').forEach(b=>b.onclick=()=>openSaleDetail(b.dataset.id));
  document.querySelectorAll('.deleteSale').forEach(b=>b.onclick=()=>deleteSale(b.dataset.id,b.dataset.code));
  document.querySelectorAll('#globalSearchBtn,#globalSearchBtn2').forEach(b=>b.onclick=openGlobalSearch);
  document.querySelectorAll('#inventoryBtn').forEach(b=>b.onclick=openInventory);
  document.querySelectorAll('#analyticsBtn').forEach(b=>b.onclick=openAnalytics);
  document.querySelectorAll('#trashBtn').forEach(b=>b.onclick=openTrash);
  document.querySelector('#backupBtn')?.addEventListener('click',downloadBackup);
  const ps=document.querySelector('#productSearch'); const sf=document.querySelector('#stockFilter');
  const filterProducts=()=>{const q=(ps?.value||'').toLowerCase();const f=sf?.value||'all';document.querySelectorAll('tbody tr').forEach(r=>{const stale=Date.now()-new Date(r.dataset.updated||Date.now()).getTime()>90*86400000;const ok=r.textContent.toLowerCase().includes(q)&&(f==='all'||r.dataset.stock===f||(f==='stale'&&stale));r.style.display=ok?'':'none'})};
  ps?.addEventListener('input',filterProducts); sf?.addEventListener('change',filterProducts);
  document.querySelector('#importBtn')?.addEventListener('click',openImport);
  document.querySelector('#movementsBtn')?.addEventListener('click',openMovements);
  document.querySelector('#returnsBtn')?.addEventListener('click',()=>{state.page='sales';state.salesView='returns';render()});
  document.querySelector('#commissionsBtn')?.addEventListener('click',openCommissions);
  document.querySelector('#auditBtn')?.addEventListener('click',openAudit);
  document.querySelector('#exportBtn')?.addEventListener('click',exportMenu);
  const selectAll=document.querySelector('#selectAllSales');const bulkBtn=document.querySelector('#bulkDeleteSales');const selections=()=>[...document.querySelectorAll('.saleSelect:checked')].map(x=>Number(x.value));const updateBulk=()=>{if(bulkBtn){const n=selections().length;bulkBtn.disabled=n===0;bulkBtn.textContent=n?`Elimina selezionate (${n})`:'Elimina selezionate'}};document.querySelectorAll('.saleSelect').forEach(x=>x.onchange=updateBulk);if(selectAll)selectAll.onchange=()=>{document.querySelectorAll('.saleSelect').forEach(x=>x.checked=selectAll.checked);updateBulk()};if(bulkBtn)bulkBtn.onclick=()=>deleteSalesBulk(selections());
}


function salesSection(){
  const now=new Date();const startOfDay=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate());
  const filtered=state.sales.filter(s=>{const d=new Date(s.occurred_at);if(state.salesFilter==='today'&&d<startOfDay(now))return false;if(state.salesFilter==='week'){const x=new Date(now);x.setDate(now.getDate()-7);if(d<x)return false}if(state.salesFilter==='month'&&(d.getMonth()!==now.getMonth()||d.getFullYear()!==now.getFullYear()))return false;if(state.salesFilter==='year'&&d.getFullYear()!==now.getFullYear())return false;if(state.salesDateFrom&&d<new Date(state.salesDateFrom+'T00:00:00'))return false;if(state.salesDateTo&&d>new Date(state.salesDateTo+'T23:59:59'))return false;return true});
  const rows=filtered.map(s=>{const st=saleDisplayStatus(s);const returned=Number(s.returned_amount)||0;const net=Math.max(0,Number(s.total)-returned);return `<tr><td>${state.admin?`<input type="checkbox" class="saleSelect" value="${s.id}" aria-label="Seleziona ${s.sale_code}">`:''}</td><td>${s.sale_code}</td><td><small>${(s.product_barcodes||'—').split(',').join('<br>')}</small></td><td>${new Date(s.occurred_at).toLocaleString('it-IT')}</td><td>${s.items_count}</td><td>${euro(s.discount_total)}</td><td><strong>${euro(s.total)}</strong></td><td><strong>${euro(net)}</strong></td><td><span class="badge ${st.cls}">${st.label}</span></td><td><div class="row-actions"><button class="btn ghost saleDetail" data-id="${s.id}">Apri</button>${state.admin?`<button class="btn danger deleteSale" data-id="${s.id}" data-code="${s.sale_code}">Elimina</button>`:''}</div></td></tr>`}).join('');
  const filterBar=`<div class="sales-filters"><label>Periodo<select class="input" id="salesPeriod"><option value="all">Tutto</option><option value="today">Oggi</option><option value="week">Ultimi 7 giorni</option><option value="month">Questo mese</option><option value="year">Quest’anno</option></select></label><label>Dal<input class="input" id="salesFrom" type="date" value="${state.salesDateFrom}"></label><label>Al<input class="input" id="salesTo" type="date" value="${state.salesDateTo}"></label><button class="btn secondary" id="clearSalesFilters">Azzera filtri</button></div>`;
  setTimeout(()=>{const p=document.querySelector('#salesPeriod');if(p){p.value=state.salesFilter;p.onchange=()=>{state.salesFilter=p.value;render()}}const f=document.querySelector('#salesFrom');if(f)f.onchange=()=>{state.salesDateFrom=f.value;render()};const t=document.querySelector('#salesTo');if(t)t.onchange=()=>{state.salesDateTo=t.value;render()};document.querySelector('#clearSalesFilters')?.addEventListener('click',()=>{state.salesFilter='all';state.salesDateFrom='';state.salesDateTo='';render()})},0);
  return `${filterBar}${state.admin?`<div class="bulk-bar"><label><input type="checkbox" id="selectAllSales"> Seleziona tutte</label><button class="btn danger" id="bulkDeleteSales" disabled>Elimina selezionate</button></div>`:''}<div class="table-wrap"><table><thead><tr><th>${state.admin?'Sel.':''}</th><th>Codice vendita</th><th>Barcode prodotti</th><th>Data</th><th>Articoli</th><th>Sconto</th><th>Vendita originale</th><th>Netto</th><th>Stato</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="10">Nessuna vendita nel periodo selezionato.</td></tr>'}</tbody></table></div>`;
}

async function openProductDetail(id){
  try{const d=await api(`/api/admin/products/${id}/detail`);const p=d.product,s=d.stats;
  const timeline=[...d.movements.map(x=>({date:x.created_at,type:movementLabels[x.type]||x.type,text:`${Number(x.quantity)>0?'+':''}${x.quantity} · ${x.previous_qty} → ${x.new_qty}`,note:x.note})),...d.sales.map(x=>({date:x.occurred_at,type:'Vendita',text:`${x.quantity} pz · ${euro(x.line_total)}`,note:x.sale_code})),...d.returns.map(x=>({date:x.created_at,type:'Reso',text:`${x.quantity} pz · ${euro(x.amount)}`,note:x.return_code}))].sort((a,b)=>new Date(b.date)-new Date(a.date));
  const body=`<div class="product-profile"><div class="grid three"><div class="card stat"><span class="muted">Disponibilità attuale</span><strong>${p.current_qty}</strong></div><div class="card stat"><span class="muted">Venduti</span><strong>${s.sold_qty||0}</strong></div><div class="card stat"><span class="muted">Resi</span><strong>${s.returned_qty||0}</strong></div><div class="card stat"><span class="muted">Ricavo netto</span><strong>${euro(s.net_revenue)}</strong></div><div class="card stat"><span class="muted">Ultima vendita</span><strong class="small-value">${s.last_sale?new Date(s.last_sale).toLocaleDateString('it-IT'):'—'}</strong></div><div class="card stat"><span class="muted">Inserito il</span><strong class="small-value">${new Date(p.created_at).toLocaleDateString('it-IT')}</strong></div></div><div class="card product-data"><h3>Anagrafica prodotto</h3><div class="data-grid">${[['Barcode',p.barcode||p.internal_code],['Marca',p.brand],['Categoria',p.category],['Modello',p.model||p.name],['Colore',p.color],['Taglia',p.size],['Listino',euro(p.list_price)],['Vendita',euro(baseSalePrice(p))],['Note',p.notes||'—']].map(x=>`<div><span>${x[0]}</span><strong>${x[1]||'—'}</strong></div>`).join('')}</div></div><div class="card"><h3>Cronologia completa</h3><div class="timeline">${timeline.map(x=>`<div class="timeline-item"><span>${new Date(x.date).toLocaleString('it-IT')}</span><strong>${x.type}</strong><b>${x.text}</b><small>${x.note||''}</small></div>`).join('')||'<p class="muted">Nessuna operazione.</p>'}</div></div></div>`;
  const m=modal({title:`${p.brand||''} ${p.model||p.name||'Prodotto'}`,body});m.querySelector('.modal-panel')?.classList.add('modal-wide');}catch(e){alert(e.message)}}

async function duplicateProduct(id){const p=state.products.find(x=>String(x.id)===String(id));if(!p)return;const m=modal({title:'Duplica prodotto',body:`<p class="muted">Verranno copiati marca, categoria, modello e prezzi. Inserisci i dati della nuova variante.</p><div class="field"><label>Nuovo barcode</label><input class="input" id="dupBarcode" autofocus></div><div class="form-grid" style="margin-top:12px"><div class="field"><label>Colore</label><input class="input" id="dupColor" value="${p.color||''}"></div><div class="field"><label>Taglia</label><input class="input" id="dupSize" value="${p.size||''}"></div><div class="field"><label>Quantità</label><input class="input" id="dupQty" type="number" min="0" value="0"></div><div class="field"><label>Prezzo vendita</label><input class="input" id="dupPrice" type="number" min="0" step="0.01" value="${baseSalePrice(p)}"></div></div><button class="btn" id="confirmDup" style="width:100%;margin-top:16px">Crea variante</button>`});m.querySelector('#confirmDup').onclick=async()=>{try{await api(`/api/admin/products/${id}/duplicate`,{method:'POST',body:JSON.stringify({barcode:m.querySelector('#dupBarcode').value.trim(),color:m.querySelector('#dupColor').value,size:m.querySelector('#dupSize').value,quantity:m.querySelector('#dupQty').value,sale_price:m.querySelector('#dupPrice').value})});m.remove();refresh()}catch(e){alert(e.message)}}}

async function openGlobalSearch(){const m=modal({title:'Ricerca globale',body:`<input class="input global-search-input" id="globalQ" placeholder="Barcode, marca, modello, codice vendita o reso..." autofocus><div id="globalResults"><p class="muted">Scrivi almeno 2 caratteri.</p></div>`});let t;m.querySelector('#globalQ').oninput=e=>{clearTimeout(t);const q=e.target.value.trim();if(q.length<2)return m.querySelector('#globalResults').innerHTML='<p class="muted">Scrivi almeno 2 caratteri.</p>';t=setTimeout(async()=>{const r=await api(`/api/admin/search?q=${encodeURIComponent(q)}`);m.querySelector('#globalResults').innerHTML=`<h3>Prodotti</h3>${r.products.map(x=>`<button class="search-result open-search-product" data-id="${x.id}"><span><strong>${x.brand||''} ${x.model||x.name||''}</strong><small>${x.barcode||x.internal_code} · ${x.current_qty} pz${x.deleted_at?' · Nel cestino':''}</small></span></button>`).join('')||'<p class="muted">Nessuno</p>'}<h3>Vendite</h3>${r.sales.map(x=>`<button class="search-result open-search-sale" data-id="${x.id}"><span><strong>${x.sale_code}</strong><small>${new Date(x.occurred_at).toLocaleString('it-IT')} · ${euro(x.total)}</small></span></button>`).join('')||'<p class="muted">Nessuna</p>'}<h3>Resi</h3>${r.returns.map(x=>`<div class="search-result"><span><strong>${x.return_code}</strong><small>${x.product_snapshot||x.barcode_snapshot} · ${euro(x.amount)}</small></span></div>`).join('')||'<p class="muted">Nessuno</p>'}`;m.querySelectorAll('.open-search-product').forEach(b=>b.onclick=()=>{m.remove();openProductDetail(b.dataset.id)});m.querySelectorAll('.open-search-sale').forEach(b=>b.onclick=()=>{m.remove();openSaleDetail(b.dataset.id)})},250)}}

async function openTrash(){const rows=await api('/api/admin/trash');const m=modal({title:'Cestino prodotti',body:`<p class="muted">Gli articoli eliminati restano qui e possono essere ripristinati.</p><div class="table-wrap"><table><thead><tr><th>Prodotto</th><th>Barcode</th><th>Eliminato il</th><th></th></tr></thead><tbody>${rows.map(x=>`<tr><td>${x.brand||''} ${x.model||x.name||''}</td><td>${x.barcode||x.internal_code}</td><td>${new Date(x.deleted_at).toLocaleString('it-IT')}</td><td><button class="btn restoreProduct" data-id="${x.id}">Ripristina</button></td></tr>`).join('')||'<tr><td colspan="4">Cestino vuoto.</td></tr>'}</tbody></table></div>`});m.querySelectorAll('.restoreProduct').forEach(b=>b.onclick=async()=>{const qty=prompt('Quantità da ripristinare:','0');if(qty===null)return;await api(`/api/admin/products/${b.dataset.id}/restore`,{method:'POST',body:JSON.stringify({quantity:qty})});m.remove();refresh()})}

async function openInventoryV17(){const start=await api('/api/admin/inventories',{method:'POST',body:JSON.stringify({})});state.activeInventory=start.id;const m=modal({title:`Inventario ${start.code}`,body:`<p class="muted">Scansiona ogni capo presente fisicamente. Ogni scansione aumenta il conteggio di una unità.</p><div class="manual-row"><input class="input" id="invCode" placeholder="Scansiona o inserisci barcode"><button class="btn" id="invAdd">Aggiungi</button></div><div id="invLast" class="notice" style="display:none"></div><div id="invSummary"></div><button class="btn secondary" id="invRefresh" style="margin-top:12px">Aggiorna confronto</button><button class="btn" id="invClose" style="width:100%;margin-top:12px">Chiudi inventario</button>`});
  const refreshInv=async()=>{const d=await api(`/api/admin/inventories/${start.id}`);const missing=d.items.filter(x=>x.counted_qty<x.expected_qty),extra=d.items.filter(x=>x.counted_qty>x.expected_qty),ok=d.items.filter(x=>x.counted_qty===x.expected_qty);m.querySelector('#invSummary').innerHTML=`<div class="grid three" style="margin-top:14px"><div class="card stat"><span class="muted">Corretti</span><strong>${ok.length}</strong></div><div class="card stat"><span class="muted">Mancanti</span><strong>${missing.length}</strong></div><div class="card stat"><span class="muted">In eccesso</span><strong>${extra.length}</strong></div></div><div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Prodotto</th><th>Atteso</th><th>Contati</th><th>Differenza</th></tr></thead><tbody>${d.items.filter(x=>x.counted_qty!==x.expected_qty).map(x=>`<tr><td>${x.brand||''} ${x.model||x.name||''}<br><small>${x.barcode||x.internal_code}</small></td><td>${x.expected_qty}</td><td>${x.counted_qty}</td><td><strong>${x.counted_qty-x.expected_qty>0?'+':''}${x.counted_qty-x.expected_qty}</strong></td></tr>`).join('')||'<tr><td colspan="4">Nessuna differenza.</td></tr>'}</tbody></table></div>`};
  const scan=async()=>{const code=m.querySelector('#invCode').value.trim();if(!code)return;try{const r=await api(`/api/admin/inventories/${start.id}/scan`,{method:'POST',body:JSON.stringify({code})});m.querySelector('#invLast').style.display='block';m.querySelector('#invLast').textContent=`Aggiunto: ${r.product.brand||''} ${r.product.model||r.product.name||''} · conteggio ${r.item.counted_qty}`;m.querySelector('#invCode').value='';m.querySelector('#invCode').focus()}catch(e){alert(e.message)}};m.querySelector('#invAdd').onclick=scan;m.querySelector('#invCode').onkeydown=e=>{if(e.key==='Enter')scan()};m.querySelector('#invRefresh').onclick=refreshInv;m.querySelector('#invClose').onclick=async()=>{const apply=confirm('Vuoi applicare automaticamente le differenze al magazzino?\nOK = rettifica quantità\nAnnulla = chiudi senza modificare lo stock');await api(`/api/admin/inventories/${start.id}/close`,{method:'POST',body:JSON.stringify({apply_adjustments:apply})});m.remove();refresh()};refreshInv()}

async function openAnalytics(){const d=await api('/api/admin/analytics');const list=(title,rows,value='revenue')=>`<div class="card"><h3>${title}</h3>${rows.map((x,i)=>`<div class="rank-row"><span><b>${i+1}</b> ${x.label||`${x.brand||''} ${x.model||x.name||''}`}</span><strong>${value==='revenue'?euro(x[value]):x[value]}</strong></div>`).join('')||'<p class="muted">Nessun dato.</p>'}</div>`;const body=`<div class="grid three analytics-kpis"><div class="card stat"><span class="muted">Sconto medio</span><strong>${d.discounts.avg_percent||0}%</strong></div><div class="card stat"><span class="muted">Sconto medio in euro</span><strong>${euro(d.discounts.avg_amount)}</strong></div><div class="card stat"><span class="muted">Prodotti top analizzati</span><strong>${d.top.length}</strong></div></div><div class="grid two" style="margin-top:14px">${list('Marchi per fatturato',d.brands)}${list('Categorie più vendute',d.categories,'qty')}${list('Taglie più richieste',d.sizes,'qty')}${list('Colori ancora in stock',d.colors,'stock')}${list('Resi per marca',d.returns_by_brand,'returned_qty')}<div class="card"><h3>Top 10 prodotti</h3>${d.top.map((x,i)=>`<button class="rank-row productDetail" data-id="${x.id}"><span><b>${i+1}</b> ${x.brand||''} ${x.model||x.name||''}</span><strong>${euro(x.revenue)}</strong></button>`).join('')}</div></div>`;const m=modal({title:'Analisi operativa delle vendite',body});m.querySelector('.modal-panel')?.classList.add('modal-wide');m.querySelectorAll('.productDetail').forEach(b=>b.onclick=()=>openProductDetail(b.dataset.id))}

async function performBackupDownload(){const data=await api('/api/admin/backup');const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`backup-gestionale-mb-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href)}
function downloadBackup(){const m=modal({title:'Backup e ripristino',body:`<div class="grid two"><button class="card btn secondary" id="downloadBackupNow">Scarica backup completo</button><label class="card btn secondary backup-upload">Ripristina da backup<input type="file" id="restoreBackupFile" accept=".json" hidden></label></div><div class="notice warn" style="margin-top:14px">Il ripristino sostituisce tutti i dati attuali. Prima scarica sempre un backup aggiornato.</div>`});m.querySelector('#downloadBackupNow').onclick=async()=>{try{await performBackupDownload()}catch(e){alert(e.message)}};m.querySelector('#restoreBackupFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;if(!confirm('Confermi il ripristino completo? Tutti i dati attuali verranno sostituiti.'))return;try{const data=JSON.parse(await f.text());const r=await api('/api/admin/backup/restore',{method:'POST',body:JSON.stringify(data)});alert(`Ripristino completato. Record ripristinati: ${r.restored}`);m.remove();refresh()}catch(err){alert(`Ripristino non riuscito: ${err.message}`)}}}



// ===== V2.2: cataloghi guidati e magazzino per categorie =====
const PRODUCT_CATEGORIES=[
  'Magliette','Polo','Camicie','Maglie maniche lunghe','Felpe','Maglioni e cardigan',
  'Giacche','Cappotti e piumini','Gilet','Pantaloncini','Pantaloni','Jeans','Tute',
  'Completi','Abiti','Gonne','Leggings','Intimo','Costumi da bagno','Scarpe','Borse',
  'Cinture','Cappelli','Sciarpe e guanti','Occhiali','Orologi','Gioielli e bijoux',
  'Portafogli','Accessori','Oggetti e articoli vari'
];
const COMMON_BRANDS=[
  'Adidas','Armani Exchange','Calvin Klein','Colmar','Diesel','Emporio Armani','Fila',
  'Fred Perry','Guess','Hugo Boss','Jack & Jones','Lacoste',"Levi's",'Liu Jo','Moncler',
  'Nike','Only','Peuterey','Puma','Ralph Lauren','Replay','Tommy Hilfiger',
  'Under Armour','Vans','Versace Jeans Couture'
];
const COMMON_MODELS=[
  'Basic','Logo','Oversize','Regular Fit','Slim Fit','Skinny','Straight','Cargo','Jogger',
  'Chino','Mom Fit','Crop','Bomber','Blazer','Parka','Piumino','Coordinato','Classico'
];
const uniqSorted=values=>[...new Set(values.filter(Boolean).map(x=>String(x).trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'it'));
const datalist=(id,values)=>`<datalist id="${id}">${uniqSorted(values).map(x=>`<option value="${String(x).replace(/"/g,'&quot;')}"></option>`).join('')}</datalist>`;
const categoryRank=value=>{const i=PRODUCT_CATEGORIES.findIndex(x=>x.toLowerCase()===String(value||'').toLowerCase());return i<0?999:i};

// ===== V2.0: modelli e varianti =====
function groupedProducts(){
  const map=new Map();
  for(const p of state.products){
    const key=String(p.group_id||`legacy-${p.id}`);
    if(!map.has(key))map.set(key,{id:p.group_id||p.id,brand:p.brand,category:p.category,model:p.model||p.name,name:p.name,notes:p.notes,list_price:p.list_price,sale_price:p.sale_price,cost_price:p.cost_price,updated_at:p.updated_at,variants:[],current_qty:0});
    const g=map.get(key);g.variants.push(p);g.current_qty+=Number(p.current_qty)||0;
    if(new Date(p.updated_at)>new Date(g.updated_at))g.updated_at=p.updated_at;
  }
  return [...map.values()];
}

function products(){
  const groups=groupedProducts();
  const categoryNames=uniqSorted([...PRODUCT_CATEGORIES,...groups.map(g=>g.category||'Senza categoria')]);
  const sections=new Map();
  for(const g of groups){
    const category=(g.category||'Senza categoria').trim()||'Senza categoria';
    if(!sections.has(category))sections.set(category,[]);
    sections.get(category).push(g);
  }
  const ordered=[...sections.entries()].sort((a,b)=>categoryRank(a[0])-categoryRank(b[0])||a[0].localeCompare(b[0],'it'));
  const renderGroup=g=>`<section class="card model-card" data-stock="${g.current_qty>0?'available':'out'}" data-updated="${g.updated_at}" data-category="${g.category||'Senza categoria'}">
    <div class="model-head"><div><h3>${g.brand||''} ${g.model||g.name||'Modello senza nome'}</h3><p class="muted">${g.variants.length} varianti · ${g.current_qty} pezzi</p></div><div class="row-actions"><button class="btn secondary addVariant" data-group="${g.id}">＋ Aggiungi variante</button></div></div>
    <div class="variant-grid">${g.variants.map(v=>`<div class="variant-row"><div><strong>${v.color||'Colore N/D'} · ${v.size||'Taglia N/D'}</strong><small>${v.barcode||v.internal_code}</small></div><div><span>${euro(baseSalePrice(v))}</span><strong>${v.current_qty} pz</strong></div><div class="row-actions"><button class="btn ghost productDetail" data-id="${v.id}">Apri</button><button class="btn ghost editProduct" data-id="${v.id}">Modifica</button>${state.admin?`<button class="btn danger deleteProduct" data-id="${v.id}">Elimina</button>`:''}</div></div>`).join('')}</div>
  </section>`;
  return `<div class="section-title"><h2>Magazzino</h2><button class="btn" id="addProduct">＋ Carica prodotto</button></div>
  <div class="toolbar warehouse-toolbar"><input class="input" id="productSearch" placeholder="Cerca barcode, marca o modello..."><select class="input" id="categoryFilter"><option value="all">Tutte le categorie</option>${categoryNames.map(c=>`<option value="${c}">${c}</option>`).join('')}</select><select class="input" id="stockFilter"><option value="all">Tutte le disponibilità</option><option value="available">Disponibili</option><option value="out">Esauriti</option><option value="stale">Fermi da 90 giorni</option></select><button class="btn secondary" id="importBtn">Importa CSV/XLSX</button></div>
  <div class="category-list">${ordered.map(([category,items])=>`<details class="category-section" data-category-section="${category}" open><summary><span>${category}</span><small>${items.length} modelli · ${items.reduce((n,g)=>n+g.current_qty,0)} pezzi</small></summary><div class="model-list">${items.map(renderGroup).join('')}</div></details>`).join('')||'<div class="card"><p class="muted">Nessun prodotto registrato.</p></div>'}</div>`;
}
async function scanSingleBarcode(title='Scansiona barcode'){
  return new Promise(resolve=>{
    const m=modal({title,body:`<div class="scanner"><video id="singleScanVideo"></video><div class="scanner-tip">Inquadra una sola etichetta della variante.</div></div><div class="manual-row"><input id="singleManual" class="input" inputmode="numeric" placeholder="Oppure inserisci il barcode"><button class="btn" id="singleGo">Continua</button></div>`});
    let done=false;const finish=code=>{code=String(code||'').trim();if(!code||done)return;done=true;try{state.scanner?.reset?.()}catch{}state.scanner=null;m.remove();resolve(code)};
    m.querySelector('#singleGo').onclick=()=>finish(m.querySelector('#singleManual').value);
    m.querySelector('#singleManual').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();finish(e.target.value)}};
    (async()=>{try{const reader=new BrowserMultiFormatReader();const controls=await reader.decodeFromVideoDevice(undefined,m.querySelector('#singleScanVideo'),result=>{if(result)finish(result.getText())});state.scanner={reset:()=>controls.stop()}}catch{m.querySelector('.scanner-tip').textContent='Fotocamera non disponibile. Inserisci il codice manualmente.'}})();
  });
}


function openProductLoadMenu(){
  const groups=groupedProducts();
  const m=modal({title:'Carica prodotto',body:`<p class="muted">Scegli cosa devi registrare.</p><div class="grid two load-choice-grid"><button class="card btn secondary" id="createModelChoice"><strong>Nuovo modello</strong><span>Prima variante di un articolo mai registrato</span></button><button class="card btn secondary" id="addVariantChoice" ${groups.length?'':'disabled'}><strong>Nuova variante</strong><span>Nuovo colore o nuova taglia di un modello esistente</span></button></div>${groups.length?'':'<div class="notice" style="margin-top:12px">Prima registra almeno un modello.</div>'}`});
  m.querySelector('#createModelChoice').onclick=()=>{m.remove();createNewModel()};
  const add=m.querySelector('#addVariantChoice');
  if(add)add.onclick=()=>{m.remove();chooseGroupForVariant()};
}

function chooseGroupForVariant(){
  const groups=groupedProducts();
  const m=modal({title:'Scegli il modello',body:`<div class="field"><label>Cerca modello</label><input class="input" id="groupVariantSearch" placeholder="Marca, categoria o modello"></div><div class="group-choice-list" id="groupChoiceList">${groups.map(g=>`<button class="group-choice" data-group="${g.id}"><span><strong>${g.brand||''} ${g.model||g.name||'Modello senza nome'}</strong><small>${g.category||'Senza categoria'} · ${g.variants.length} varianti</small></span><b>＋</b></button>`).join('')||'<p class="muted">Nessun modello disponibile.</p>'}</div>`});
  const bind=()=>m.querySelectorAll('.group-choice').forEach(b=>b.onclick=()=>{const id=b.dataset.group;m.remove();addVariantToGroup(id)});bind();
  m.querySelector('#groupVariantSearch').oninput=e=>{const q=e.target.value.toLowerCase();m.querySelectorAll('.group-choice').forEach(b=>b.style.display=b.textContent.toLowerCase().includes(q)?'':'none')};
}

async function createNewModel(){
  const barcode=await scanSingleBarcode('Prima variante: scansiona il barcode');
  try{await api(`/api/products/lookup/${encodeURIComponent(barcode)}`);alert('Questo barcode è già registrato.');return}catch{}
  openProduct({barcode},{newModel:true});
}

function openProduct(p={},options={}){
  const isEdit=Boolean(p.id); const isNewModel=options.newModel||!isEdit; const barcode=p.barcode||options.barcode||'';
  const m=modal({title:isEdit?'Modifica variante':'Nuovo modello e prima variante',body:`<form id="productForm">
    <div class="barcode-confirm"><span>Barcode variante</span><strong>${barcode||p.internal_code||'—'}</strong></div><input type="hidden" name="barcode" value="${barcode}">
    <h3>Dati del modello</h3><div class="form-grid"><div class="field"><label>Marca</label><input class="input" name="brand" list="brandOptions" autocomplete="off" placeholder="Seleziona o scrivi una marca" value="${p.brand??''}">${datalist('brandOptions',[...COMMON_BRANDS,...state.products.map(x=>x.brand)])}</div><div class="field"><label>Categoria</label><input class="input" name="category" list="categoryOptions" autocomplete="off" placeholder="Seleziona una categoria" value="${p.category??''}">${datalist('categoryOptions',PRODUCT_CATEGORIES)}</div><div class="field"><label>Modello / nome articolo</label><input class="input" name="model" list="modelOptions" autocomplete="off" placeholder="Seleziona o scrivi il modello" value="${p.model??p.name??''}">${datalist('modelOptions',[...COMMON_MODELS,...state.products.map(x=>x.model||x.name)])}</div><div class="field"><label>Prezzo listino</label><input class="input" name="list_price" type="number" min="0" step="0.01" value="${p.list_price??''}"></div><div class="field"><label>Prezzo vendita</label><input class="input" name="sale_price" type="number" min="0" step="0.01" value="${p.sale_price??p.list_price??''}"></div><div class="field full"><label>Note</label><textarea class="input" name="notes" rows="3">${p.notes??''}</textarea></div></div>
    <h3>Dati della variante</h3><div class="form-grid"><div class="field"><label>Colore</label><input class="input" name="color" value="${p.color??''}"></div><div class="field"><label>Taglia</label><input class="input" name="size" value="${p.size??''}"></div><div class="field"><label>Quantità totale</label><input class="input" name="${isEdit?'current_qty':'quantity'}" type="number" min="0" step="1" value="${isEdit?p.current_qty??0:0}"></div></div>
    <button class="btn" style="width:100%;margin-top:16px">${isEdit?'Salva modifiche':'Crea modello'}</button></form>`});
  m.querySelector('form').onsubmit=async e=>{e.preventDefault();const o=Object.fromEntries(new FormData(e.target));o.name=o.model||o.category||'';try{
    if(isEdit){await api(`/api/products/${p.id}`,{method:'PUT',body:JSON.stringify(o)});m.remove();refresh();return}
    const r=await api('/api/product-groups',{method:'POST',body:JSON.stringify({...o,variants:[{barcode:o.barcode,color:o.color,size:o.size,quantity:o.quantity}]})});m.remove();await refresh();if(confirm('Modello creato. Vuoi aggiungere subito un’altra variante colore/taglia?'))addVariantToGroup(r.id);
  }catch(err){alert(err.message)}};
}

async function addVariantToGroup(groupId){
  const barcode=await scanSingleBarcode('Scansiona il barcode della nuova variante');
  try{await api(`/api/products/lookup/${encodeURIComponent(barcode)}`);alert('Questo barcode è già registrato.');return}catch{}
  const m=modal({title:'Aggiungi variante',body:`<form id="variantForm"><div class="barcode-confirm"><span>Barcode</span><strong>${barcode}</strong></div><div class="form-grid"><div class="field"><label>Colore</label><input class="input" name="color" autofocus></div><div class="field"><label>Taglia</label><input class="input" name="size"></div><div class="field"><label>Quantità totale</label><input class="input" name="quantity" type="number" min="0" step="1" value="0"></div></div><button class="btn" style="width:100%;margin-top:16px">Salva variante</button></form>`});
  m.querySelector('form').onsubmit=async e=>{e.preventDefault();const o=Object.fromEntries(new FormData(e.target));try{await api(`/api/product-groups/${groupId}/variants`,{method:'POST',body:JSON.stringify({...o,barcode})});m.remove();refresh()}catch(err){alert(err.message)}};
}

async function openInventory(){
  const start=await api('/api/admin/inventories',{method:'POST',body:JSON.stringify({})});state.activeInventory=start.id;
  const m=modal({title:`Inventario ${start.code}`,body:`<p class="muted">Scansiona una sola etichetta per ogni variante e inserisci la quantità fisicamente presente. Non devi scansionare ogni capo.</p><button class="btn large" id="invCamera" style="width:100%">⌁ Scansiona variante</button><div class="manual-row"><input class="input" id="invCode" placeholder="Oppure inserisci il barcode"><button class="btn secondary" id="invManual">Continua</button></div><div id="invLast" class="notice" style="display:none"></div><div id="invSummary"></div><button class="btn secondary" id="invRefresh" style="margin-top:12px">Aggiorna confronto</button><button class="btn" id="invClose" style="width:100%;margin-top:12px">Chiudi inventario</button>`});
  const refreshInv=async()=>{const d=await api(`/api/admin/inventories/${start.id}`);const missing=d.items.filter(x=>x.counted_qty<x.expected_qty),extra=d.items.filter(x=>x.counted_qty>x.expected_qty),ok=d.items.filter(x=>x.counted_qty===x.expected_qty);m.querySelector('#invSummary').innerHTML=`<div class="grid three" style="margin-top:14px"><div class="card stat"><span class="muted">Corretti</span><strong>${ok.length}</strong></div><div class="card stat"><span class="muted">Mancanti</span><strong>${missing.length}</strong></div><div class="card stat"><span class="muted">In eccesso</span><strong>${extra.length}</strong></div></div><div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Variante</th><th>Atteso</th><th>Contati</th><th>Differenza</th></tr></thead><tbody>${d.items.filter(x=>x.counted_qty!==x.expected_qty).map(x=>`<tr><td>${x.brand||''} ${x.model||x.name||''}<br><small>${x.color||'N/D'} · ${x.size||'N/D'} · ${x.barcode||x.internal_code}</small></td><td>${x.expected_qty}</td><td>${x.counted_qty}</td><td><strong>${x.counted_qty-x.expected_qty>0?'+':''}${x.counted_qty-x.expected_qty}</strong></td></tr>`).join('')||'<tr><td colspan="4">Nessuna differenza.</td></tr>'}</tbody></table></div>`};
  const countCode=async code=>{code=String(code||'').trim();if(!code)return;try{const p=await api(`/api/products/lookup/${encodeURIComponent(code)}`);const qty=prompt(`Quantità fisicamente presente:\n${productLabel(p)}\nBarcode: ${code}`,String(p.current_qty??0));if(qty===null)return;const n=Math.max(0,parseInt(qty)||0);const r=await api(`/api/admin/inventories/${start.id}/scan`,{method:'POST',body:JSON.stringify({code,counted_qty:n})});m.querySelector('#invLast').style.display='block';m.querySelector('#invLast').textContent=`Conteggiata: ${productLabel(r.product)} · ${n} pezzi`;m.querySelector('#invCode').value='';await refreshInv()}catch(e){alert(e.message)}};
  m.querySelector('#invCamera').onclick=async()=>countCode(await scanSingleBarcode('Inventario: scansiona una variante'));
  m.querySelector('#invManual').onclick=()=>countCode(m.querySelector('#invCode').value);m.querySelector('#invCode').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();countCode(e.target.value)}};
  m.querySelector('#invRefresh').onclick=refreshInv;m.querySelector('#invClose').onclick=async()=>{const apply=confirm('Vuoi applicare automaticamente le differenze al magazzino?\nOK = rettifica quantità\nAnnulla = chiudi senza modificare lo stock');await api(`/api/admin/inventories/${start.id}/close`,{method:'POST',body:JSON.stringify({apply_adjustments:apply})});m.remove();refresh()};refreshInv();
}

function bindCommon(){
  document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{state.page=b.dataset.page;render()});document.querySelectorAll('[data-sales-view]').forEach(b=>b.onclick=()=>{state.salesView=b.dataset.salesView;render()});
  document.querySelector('#scanNav')?.addEventListener('click',()=>openScanner('sale'));document.querySelectorAll('#addProduct').forEach(b=>b.onclick=openProductLoadMenu);document.querySelectorAll('#newSale').forEach(b=>b.onclick=()=>openScanner('sale'));
  document.querySelector('#adminLogin')?.addEventListener('click',openLogin);document.querySelector('#logout')?.addEventListener('click',async()=>{await api('/api/auth/logout',{method:'POST'});state.admin=false;render()});
  document.querySelectorAll('.editProduct').forEach(b=>b.onclick=()=>openProduct(state.products.find(x=>x.id==b.dataset.id)));document.querySelectorAll('.productDetail').forEach(b=>b.onclick=()=>openProductDetail(b.dataset.id));document.querySelectorAll('.addVariant').forEach(b=>b.onclick=()=>addVariantToGroup(b.dataset.group));document.querySelectorAll('.deleteProduct').forEach(b=>b.onclick=()=>deleteProduct(b.dataset.id));
  document.querySelectorAll('.saleDetail').forEach(b=>b.onclick=()=>openSaleDetail(b.dataset.id));document.querySelectorAll('.deleteSale').forEach(b=>b.onclick=()=>deleteSale(b.dataset.id,b.dataset.code));document.querySelectorAll('#globalSearchBtn,#globalSearchBtn2').forEach(b=>b.onclick=openGlobalSearch);document.querySelectorAll('#inventoryBtn').forEach(b=>b.onclick=openInventory);document.querySelectorAll('#analyticsBtn').forEach(b=>b.onclick=openAnalytics);document.querySelectorAll('#trashBtn').forEach(b=>b.onclick=openTrash);document.querySelector('#backupBtn')?.addEventListener('click',downloadBackup);
  const ps=document.querySelector('#productSearch'),sf=document.querySelector('#stockFilter'),cf=document.querySelector('#categoryFilter');const filterProducts=()=>{const q=(ps?.value||'').toLowerCase(),f=sf?.value||'all',c=cf?.value||'all';document.querySelectorAll('.model-card').forEach(r=>{const stale=Date.now()-new Date(r.dataset.updated||Date.now()).getTime()>90*86400000;const categoryOk=c==='all'||String(r.dataset.category||'')===c;const ok=r.textContent.toLowerCase().includes(q)&&categoryOk&&(f==='all'||r.dataset.stock===f||(f==='stale'&&stale));r.style.display=ok?'':'none'});document.querySelectorAll('.category-section').forEach(section=>{const visible=[...section.querySelectorAll('.model-card')].some(card=>card.style.display!=='none');section.style.display=visible?'':'none';if((q||c!=='all'||f!=='all')&&visible)section.open=true})};ps?.addEventListener('input',filterProducts);sf?.addEventListener('change',filterProducts);cf?.addEventListener('change',filterProducts);
  document.querySelector('#importBtn')?.addEventListener('click',openImport);document.querySelector('#movementsBtn')?.addEventListener('click',openMovements);document.querySelector('#returnsBtn')?.addEventListener('click',()=>{state.page='sales';state.salesView='returns';render()});document.querySelector('#commissionsBtn')?.addEventListener('click',openCommissions);document.querySelector('#auditBtn')?.addEventListener('click',openAudit);document.querySelector('#exportBtn')?.addEventListener('click',exportMenu);
  const selectAll=document.querySelector('#selectAllSales'),bulkBtn=document.querySelector('#bulkDeleteSales'),selections=()=>[...document.querySelectorAll('.saleSelect:checked')].map(x=>Number(x.value)),updateBulk=()=>{if(bulkBtn){const n=selections().length;bulkBtn.disabled=n===0;bulkBtn.textContent=n?`Elimina selezionate (${n})`:'Elimina selezionate'}};document.querySelectorAll('.saleSelect').forEach(x=>x.onchange=updateBulk);if(selectAll)selectAll.onchange=()=>{document.querySelectorAll('.saleSelect').forEach(x=>x.checked=selectAll.checked);updateBulk()};if(bulkBtn)bulkBtn.onclick=()=>deleteSalesBulk(selections());
}

(async()=>{try{const me=await api('/api/auth/me');state.admin=me.authenticated}catch{}await refresh();syncQueue()})();
