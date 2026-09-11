/* =========================================================
Florescer — Lógica da aplicação (API + banco de dados)
Persistência: backend SQLite via REST API
========================================================= */

const API = "/api";
const TOKEN_KEY = "rf_token";

/* ---------------- utilidades ---------------- */
const $ = (s, ctx = document) => ctx.querySelector(s);
const $$ = (s, ctx = document) => [...ctx.querySelectorAll(s)];
const brl = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const uid = () => Math.random().toString(36).slice(2, 10);

function toast(msg, erro = false) {
const el = document.createElement("div");
el.className = "toast" + (erro ? " erro" : "");
el.textContent = msg;
$("#toasts").appendChild(el);
setTimeout(() => el.remove(), 3600);
}

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function setToken(t) {
if (t) localStorage.setItem(TOKEN_KEY, t);
else localStorage.removeItem(TOKEN_KEY);
}

async function api(path, opts = {}) {
const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
const token = getToken();
if (token) headers.Authorization = "Bearer " + token;
const res = await fetch(API + path, { ...opts, headers });
const data = await res.json().catch(() => ({}));
if (!res.ok) {
const err = new Error(data.erro || "Erro na requisição");
err.status = res.status;
err.data = data;
throw err;
}
return data;
}

/** HTML da imagem da planta (fallback limpo, sem emoji) */
function figPlanta(p, className = "") {
if (p.imagem) {
return `<img src="${p.imagem}" alt="${p.nome}" loading="lazy" class="${className}"
onerror="this.style.display='none';this.nextElementSibling&&(this.nextElementSibling.style.display='grid')" />
<span class="emoji-fallback" style="display:none">${(p.nome||"P").charAt(0)}</span>`;
}
return `<span class="emoji-fallback">${(p.nome||"P").charAt(0)}</span>`;
}

/* ---------------- estado em memória ---------------- */
let usuario = null;
let CATALOGO = [];
let CURSOS = [];
let RECOMPENSAS = [];
let FAQ = [];
let carrinho = [];
let freteCalc = null;
let metodoPagamento = "pix";
let parcelas = 1;
let recompensasAplicadas = [];
let notaSelecionada = 5;
let resgatesUsuario = [];
let avaliacoesCache = [];

const REGIOES_FRETE = [
{ faixa: [1000000, 19999999], nome: "São Paulo", base: 18.9, prazo: [2, 4] },
{ faixa: [20000000, 28999999], nome: "Rio de Janeiro", base: 22.9, prazo: [2, 5] },
{ faixa: [29000000, 29999999], nome: "Espírito Santo", base: 26.9, prazo: [3, 6] },
{ faixa: [30000000, 39999999], nome: "Minas Gerais", base: 24.9, prazo: [3, 6] },
{ faixa: [40000000, 48999999], nome: "Bahia", base: 34.9, prazo: [5, 9] },
{ faixa: [49000000, 56999999], nome: "Nordeste (SE/PE/AL)", base: 37.9, prazo: [5, 10] },
{ faixa: [57000000, 63999999], nome: "Nordeste (AL/CE)", base: 39.9, prazo: [6, 10] },
{ faixa: [64000000, 69999999], nome: "Norte", base: 49.9, prazo: [7, 13] },
{ faixa: [70000000, 76999999], nome: "Centro-Oeste (DF/GO)", base: 29.9, prazo: [4, 7] },
{ faixa: [77000000, 79999999], nome: "Centro-Oeste (TO/MS)", base: 33.9, prazo: [5, 8] },
{ faixa: [80000000, 87999999], nome: "Paraná", base: 23.9, prazo: [3, 6] },
{ faixa: [88000000, 89999999], nome: "Santa Catarina", base: 25.9, prazo: [3, 6] },
{ faixa: [90000000, 99999999], nome: "Rio Grande do Sul", base: 28.9, prazo: [4, 7] }
];

/* ---------------- navegação ---------------- */
function irPara(secao) {
$$(".secao").forEach((s) => s.classList.remove("ativa"));
$("#sec-" + secao)?.classList.add("ativa");
$$("#menu button, #menuMobile button").forEach((b) => {
b.classList.toggle("ativo", b.dataset.secao === secao);
});
// Fecha menu mobile ao navegar
$("#menuMobile")?.classList.remove("aberto");
$("#btnMenu")?.classList.remove("aberto");
window.scrollTo({ top: 0, behavior: "smooth" });
if (secao === "carrinho") { renderCarrinho(); preencherEnderecoDoUsuario(); }
if (secao === "conta") renderConta();
if (secao === "brotos") renderBrotos();
if (secao === "avaliacoes") renderAvaliacoes();
if (secao === "cursos") renderCursos();
}

/* ---------------- catálogo ---------------- */
function planta(id) { return CATALOGO.find((p) => p.id === id); }

function cardPlanta(p) {
const tagPet = p.petFriendly
? '<span class="tag pet">Pet friendly</span>'
: '<span class="tag toxica">Tóxica p/ pets</span>';
return `
<article class="card" data-planta-id="${p.id}">
<div class="card-figura">${figPlanta(p)}</div>
<div class="card-corpo">
<div>
<h3>${p.nome}</h3>
<div class="nome-cientifico">${p.cientifico}</div>
</div>
<div class="tags">
<span class="tag">${p.categoria}</span>
<span class="tag">${p.ambiente}</span>
${tagPet}
</div>
<p class="small muted">${(p.resumo || "").slice(0, 92)}…</p>
<div class="preco">${brl(p.preco)}</div>
<div class="card-rodape">
<button class="btn btn-sm" data-add="${p.id}">Adicionar</button>
<button class="btn btn-ghost btn-sm" data-detalhe="${p.id}">Detalhes</button>
</div>
</div>
</article>`;
}

function renderCatalogo() {
const termo = $("#busca").value.trim().toLowerCase();
const cat = $("#filtroCategoria").value;
const amb = $("#filtroAmbiente").value;
const luz = $("#filtroLuz").value;
const pet = $("#filtroPet").checked;
const ordem = $("#filtroOrdem").value;

let lista = CATALOGO.filter((p) => {
if (termo && !(p.nome + p.cientifico + p.categoria).toLowerCase().includes(termo)) return false;
if (cat && p.categoria !== cat) return false;
if (amb && p.ambiente !== amb) return false;
if (pet && !p.petFriendly) return false;
if (luz) {
const l = (p.luz || "").toLowerCase();
if (luz === "sol" && !l.includes("sol direto") && !l.includes("sol pleno")) return false;
if (luz === "indireta" && !l.includes("indireta")) return false;
if (luz === "sombra" && !l.includes("sombra")) return false;
}
return true;
});

if (ordem === "menor") lista.sort((a, b) => a.preco - b.preco);
if (ordem === "maior") lista.sort((a, b) => b.preco - a.preco);
if (ordem === "nome") lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

$("#grade").innerHTML = lista.map(cardPlanta).join("");
$("#vazioCatalogo").style.display = lista.length ? "none" : "block";
}

async function abrirDetalhe(id) {
const p = planta(id);
if (!p) return;
let avs = [];
try {
const todas = await api("/avaliacoes");
avs = todas.filter((a) => a.plantaId === id);
} catch { /* ignore */ }
const media = avs.length ? (avs.reduce((s, a) => s + a.nota, 0) / avs.length).toFixed(1) : null;

$("#modalDetalhe").innerHTML = `
<button class="fechar" data-fechar>✕</button>
<div class="detalhe-topo">
<div class="detalhe-figura">${figPlanta(p)}</div>
<div>
<h2>${p.nome}</h2>
<div class="nome-cientifico">${p.cientifico}</div>
<div class="tags" style="margin-top:10px">
<span class="tag">${p.categoria}</span><span class="tag">${p.ambiente}</span>
<span class="tag">${p.dificuldade}</span>
${p.petFriendly ? '<span class="tag pet">Seguro para pets</span>' : '<span class="tag toxica">Tóxica para pets</span>'}
</div>
<div class="preco" style="margin-top:12px">${brl(p.preco)}</div>
${media ? `<div class="small"><span class="estrelas">${"★".repeat(Math.round(media))}</span> ${media} · ${avs.length} avaliação(ões)</div>` : '<div class="small muted">Ainda sem avaliações</div>'}
</div>
</div>
<h3 style="font-size:1rem">Do que ela gosta</h3>
<p class="muted" style="margin-top:6px">${p.resumo}</p>
<div class="blocos-info">
<div class="bloco-info"><span>Luz</span><strong>☀️ ${p.luz}</strong></div>
<div class="bloco-info"><span>Água / chuva</span><strong>💧 ${p.agua}</strong></div>
<div class="bloco-info"><span>Umidade</span><strong>🌫️ ${p.umidade}</strong></div>
<div class="bloco-info"><span>Porte adulto</span><strong>📏 ${p.porte}</strong></div>
<div class="bloco-info"><span>Dificuldade</span><strong>🧑‍🌾 ${p.dificuldade}</strong></div>
<div class="bloco-info"><span>Famílias com animais</span><strong>${p.petFriendly ? "Recomendada" : "Não recomendada"}</strong></div>
</div>
<h3 style="font-size:1rem">Um pouco da história</h3>
<div class="historia">${p.historia}</div>
<div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap">
<button class="btn" data-add="${p.id}">Adicionar ao carrinho</button>
<button class="btn btn-ghost" data-fechar>Continuar navegando</button>
</div>
${avs.length ? `<h3 style="font-size:1rem;margin-top:22px">O que dizem</h3>${avs.map(cardAvaliacao).join("")}` : ""}
`;
$("#overlayDetalhe").classList.add("aberto");
}

/* ---------------- carrinho ---------------- */
async function addCarrinho(id) {
const item = carrinho.find((i) => i.id === id);
if (item) item.qtd++;
else carrinho.push({ id, qtd: 1 });
await salvarCarrinho();
atualizarBadge();
toast(`${planta(id)?.nome || "Planta"} adicionada ao carrinho.`);
}

function atualizarBadge() {
const n = carrinho.reduce((s, i) => s + i.qtd, 0);
const b = $("#badgeCarrinho");
b.textContent = n;
b.classList.toggle("hidden", n === 0);
}

async function salvarCarrinho() {
if (!usuario) {
sessionStorage.setItem("rf_cart_visitante", JSON.stringify(carrinho));
return;
}
try {
await api("/carrinho", { method: "PUT", body: JSON.stringify(carrinho) });
} catch (e) {
console.warn("Falha ao salvar carrinho:", e.message);
}
}

async function carregarCarrinho() {
if (!usuario) {
carrinho = JSON.parse(sessionStorage.getItem("rf_cart_visitante") || "[]");
return;
}
try {
const itens = await api("/carrinho");
carrinho = itens.map((i) => ({ id: i.id, qtd: i.qtd }));
} catch {
carrinho = [];
}
}

function subtotal() {
return carrinho.reduce((s, i) => s + (planta(i.id)?.preco || 0) * i.qtd, 0);
}

function calcularTotais() {
const sub = subtotal();
let frete = freteCalc ? freteCalc.valor : 0;
let desconto = 0;
let embalagem = $("#chkPresente")?.checked ? 12.9 : 0;
const brindes = [];

recompensasAplicadas.forEach((rid) => {
const r = RECOMPENSAS.find((x) => x.id === rid);
if (!r) return;
if (r.tipo === "frete" || r.tipo === "expresso") frete = 0;
if (r.tipo === "desconto") desconto += r.valor;
if (r.tipo === "percentual") desconto += sub * (r.valor / 100);
if (r.tipo === "brinde") {
brindes.push(r.nome);
if (r.id === "r7") embalagem = 0;
}
});

if (sub >= 299 && freteCalc && freteCalc.modalidade === "padrao") frete = 0;
desconto = Math.min(desconto, sub);

let descontoPix = 0;
const baseAntesPix = sub - desconto + frete + embalagem;
if (metodoPagamento === "pix") descontoPix = baseAntesPix * 0.05;

const total = Math.max(0, baseAntesPix - descontoPix);
return { sub, frete, desconto, embalagem, descontoPix, total, brindes };
}


/** Preenche o formulário do carrinho com o endereço salvo na conta (só campos vazios). */
function preencherEnderecoDoUsuario() {
if (!usuario?.endereco) return;
const e = usuario.endereco;
const setIfEmpty = (id, val) => {
const el = $(id);
if (!el || !val) return;
if (!String(el.value || "").trim()) el.value = val;
};

setIfEmpty("#cep", e.cep);
setIfEmpty("#bairro", e.bairro);
setIfEmpty("#cidade", e.cidade);
setIfEmpty("#complemento", e.complemento);

// Na conta, "rua" pode vir junto com o número (ex.: "Rua X, 123")
let rua = (e.rua || "").trim();
let numero = (e.numero || "").trim();
if (!numero && rua) {
const m = rua.match(/^(.*?)[,\s]+(\d+[A-Za-z\-\/]*)$/);
if (m) {
rua = m[1].trim();
numero = m[2].trim();
}
}
setIfEmpty("#rua", rua);
setIfEmpty("#numero", numero);
}

function renderCarrinho() {
const cont = $("#itensCarrinho");
if (!carrinho.length) {
cont.innerHTML = `<div class="carrinho-vazio">
<div class="vaso-ico" aria-hidden="true">
<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M18 28c0-2 1.5-4 4-5.5C26 20 30 18 32 18s6 2 10 4.5c2.5 1.5 4 3.5 4 5.5v2H18v-2z" fill="currentColor" opacity="0.25"/>
<path d="M20 30h24l-2.5 22a4 4 0 01-4 3.5H26.5a4 4 0 01-4-3.5L20 30z" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" fill="currentColor" opacity="0.18"/>
<path d="M20 30h24l-2.5 22a4 4 0 01-4 3.5H26.5a4 4 0 01-4-3.5L20 30z" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>
<path d="M24 30v-1.5c0-3 3.5-6 8-6s8 3 8 6V30" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
<circle cx="32" cy="14" r="2.5" fill="currentColor" opacity="0.35"/>
<path d="M32 16.5v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity="0.5"/>
</svg>
</div>
<p>Seu carrinho ainda está vazio — que tal escolher a primeira plantinha?</p>
<button class="btn btn-sm" data-ir="catalogo">Explorar o catálogo</button>
</div>`;
} else {
cont.innerHTML = carrinho.map((i) => {
const p = planta(i.id);
if (!p) return "";
return `<div class="linha-item">
<div class="mini-figura">${figPlanta(p)}</div>
<div>
<strong>${p.nome}</strong>
<div class="nome-cientifico">${p.cientifico}</div>
<div class="qtd" style="margin-top:6px">
<button data-menos="${p.id}">−</button><span>${i.qtd}</span><button data-mais="${p.id}">+</button>
</div>
</div>
<div style="text-align:right">
<div class="preco" style="font-size:1rem">${brl(p.preco * i.qtd)}</div>
<button class="btn btn-ghost btn-sm" data-remover="${p.id}" style="margin-top:6px">Remover</button>
</div>
</div>`;
}).join("");
}
renderRecompensasCarrinho();
renderPagamento();
renderResumo();
preencherEnderecoDoUsuario();
}

function renderResumo() {
const t = calcularTotais();
const linhas = [
`<div class="resumo-linha"><span>Subtotal</span><span>${brl(t.sub)}</span></div>`,
t.embalagem ? `<div class="resumo-linha"><span>Embalagem presente</span><span>${brl(t.embalagem)}</span></div>` : "",
`<div class="resumo-linha"><span>Frete${freteCalc ? " · " + freteCalc.regiao : ""}</span><span>${freteCalc ? (t.frete === 0 ? "Grátis" : brl(t.frete)) : "calcule o CEP"}</span></div>`,
t.desconto ? `<div class="resumo-linha"><span>Recompensas</span><span>− ${brl(t.desconto)}</span></div>` : "",
t.descontoPix ? `<div class="resumo-linha"><span>Desconto Pix (5%)</span><span>− ${brl(t.descontoPix)}</span></div>` : "",
t.brindes.length ? `<div class="resumo-linha"><span>Brindes</span><span>${t.brindes.length} item(ns)</span></div>` : "",
`<div class="resumo-linha total"><span>Total</span><span>${brl(t.total)}</span></div>`,
`<p class="small muted" style="margin-top:8px">Você ganhará <strong>${Math.floor(t.total)} Brotos</strong> nesta compra.</p>`,
t.brindes.length ? `<div class="aviso" style="margin-top:10px">🎁 ${t.brindes.join(" · ")}</div>` : ""
];
$("#resumo").innerHTML = linhas.join("");
}

/* ---------------- frete ---------------- */
function calcularFrete() {
const cepRaw = $("#cep").value.replace(/\D/g, "");
if (cepRaw.length !== 8) { toast("Informe um CEP válido com 8 dígitos.", true); return; }
if (!carrinho.length) { toast("Adicione itens antes de calcular o frete.", true); return; }

const num = parseInt(cepRaw, 10);
const reg = REGIOES_FRETE.find((r) => num >= r.faixa[0] && num <= r.faixa[1])
|| { nome: "Região não mapeada", base: 44.9, prazo: [6, 12] };

const pecas = carrinho.reduce((s, i) => s + i.qtd, 0);
const pesoEstimado = carrinho.reduce((s, i) => {
const p = planta(i.id);
const peso = p?.porte?.startsWith("Grande") ? 6 : p?.porte?.startsWith("Médio") ? 3 : 1.2;
return s + peso * i.qtd;
}, 0);

const modalidade = $("#modalidade").value;
let valor = reg.base + Math.max(0, pesoEstimado - 3) * 2.4 + Math.max(0, pecas - 2) * 3.5;
let prazo = [...reg.prazo];

if (modalidade === "expressa") { valor *= 1.6; prazo = [Math.max(1, prazo[0] - 1), Math.max(2, prazo[1] - 3)]; }
if (modalidade === "retirada") { valor = 0; prazo = [1, 2]; }
valor = Math.round(valor * 100) / 100;

freteCalc = { valor, prazo, regiao: reg.nome, modalidade, peso: pesoEstimado.toFixed(1) };

const gratis = subtotal() >= 299 && modalidade === "padrao";
$("#resultadoFrete").innerHTML = `
<div class="aviso">
<strong>${reg.nome}</strong> · peso estimado ${pesoEstimado.toFixed(1)} kg · ${pecas} volume(s)<br />
${modalidade === "retirada" ? "Retirada no viveiro" : modalidade === "expressa" ? "Envio expresso" : "Envio padrão"}:
<strong>${gratis || valor === 0 ? "Grátis" : brl(valor)}</strong> — chega em ${prazo[0]} a ${prazo[1]} dias úteis.
${gratis ? "<br />Frete padrão grátis por compras acima de R$ 299." : ""}
</div>`;
renderResumo();
renderPagamento();
}

/* ---------------- pagamento ---------------- */
function renderPagamento() {
const t = calcularTotais();
const el = $("#detalhePagamento");

if (metodoPagamento === "pix") {
el.innerHTML = `
<div style="display:grid;grid-template-columns:180px 1fr;gap:18px;align-items:center">
<canvas id="qrcodePix" width="180" height="180"></canvas>
<div>
<strong>Pix — aprovação imediata</strong>
<p class="small muted">Escaneie o QR Code ou copie o código abaixo. Válido por 30 minutos.</p>
<div class="codigo-pix" id="codigoPix" style="margin:10px 0"></div>
<button class="btn btn-ghost btn-sm" id="btnCopiarPix">Copiar código Pix</button>
<p class="small" style="margin-top:8px">Total no Pix: <strong>${brl(t.total)}</strong> (5% já aplicado)</p>
</div>
</div>
<p class="small muted" style="margin-top:10px">QR Code meramente ilustrativo — nenhuma cobrança real é gerada.</p>`;
const codigo = gerarCodigoPix(t.total);
$("#codigoPix").textContent = codigo;
desenharQR($("#qrcodePix"), codigo);
$("#btnCopiarPix").onclick = () => {
navigator.clipboard?.writeText(codigo);
toast("Código Pix copiado!");
};
} else if (metodoPagamento === "cartao") {
const opcoes = [];
for (let n = 1; n <= 12; n++) {
const juros = n <= 6 ? 0 : 0.0199;
const totalP = t.total * Math.pow(1 + juros, n > 6 ? n - 6 : 0);
opcoes.push(`<option value="${n}" ${n === parcelas ? "selected" : ""}>${n}x de ${brl(totalP / n)}${juros ? " (com juros)" : " sem juros"} — total ${brl(totalP)}</option>`);
}
el.innerHTML = `
<div class="campos">
<div><label class="rot">Número do cartão</label><input type="text" id="cardNum" maxlength="19" placeholder="0000 0000 0000 0000" /></div>
<div class="campos campos-2">
<div><label class="rot">Validade</label><input type="text" id="cardVal" maxlength="5" placeholder="MM/AA" /></div>
<div><label class="rot">CVV</label><input type="text" id="cardCvv" maxlength="4" placeholder="123" /></div>
</div>
<div><label class="rot">Nome impresso no cartão</label><input type="text" id="cardNome" placeholder="Como está no cartão" /></div>
<div><label class="rot">Parcelamento</label><select id="selParcelas">${opcoes.join("")}</select></div>
</div>
<p class="small muted" style="margin-top:8px">Sem juros até 6x. Acima disso, 1,99% ao mês. Dados não são enviados a lugar nenhum.</p>`;
$("#selParcelas").onchange = (e) => { parcelas = +e.target.value; };
$("#cardNum").oninput = (e) => {
e.target.value = e.target.value.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
};
$("#cardVal").oninput = (e) => {
const v = e.target.value.replace(/\D/g, "").slice(0, 4);
e.target.value = v.length > 2 ? v.slice(0, 2) + "/" + v.slice(2) : v;
};
} else {
const venc = new Date(Date.now() + 3 * 864e5).toLocaleDateString("pt-BR");
el.innerHTML = `
<div class="aviso">
<strong>Boleto bancário</strong><br />
Vencimento em ${venc}. O pedido é separado após a compensação (até 2 dias úteis).<br />
Valor: <strong>${brl(t.total)}</strong>
</div>
<div class="codigo-pix" style="margin-top:10px">34191.79001 01043.510047 91020.150008 ${Math.floor(Math.random() * 9) + 1} ${Math.floor(Math.random() * 8999999 + 1000000)}0000${Math.floor(t.total * 100)}</div>`;
}
}

function gerarCodigoPix(valor) {
const chave = "florescer@pix.exemplo";
const v = valor.toFixed(2);
return `00020126580014BR.GOV.BCB.PIX0136${chave}5204000053039865802BR5916FLORESCER6009SAO PAULO54${String(v.length).padStart(2, "0")}${v}62070503***6304${uid().toUpperCase().slice(0, 4)}`;
}

function desenharQR(canvas, texto) {
const ctx = canvas.getContext("2d");
const N = 29, size = canvas.width, cell = size / N;
ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size, size);
let seed = 0;
for (let i = 0; i < texto.length; i++) seed = (seed * 31 + texto.charCodeAt(i)) >>> 0;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
ctx.fillStyle = "#1d3326";
for (let y = 0; y < N; y++) {
for (let x = 0; x < N; x++) {
const emOlho = (x < 8 && y < 8) || (x > N - 9 && y < 8) || (x < 8 && y > N - 9);
if (emOlho) continue;
if (rnd() > 0.52) ctx.fillRect(x * cell, y * cell, cell, cell);
}
}
const olho = (ox, oy) => {
ctx.fillStyle = "#1d3326";
ctx.fillRect(ox * cell, oy * cell, 7 * cell, 7 * cell);
ctx.fillStyle = "#fff";
ctx.fillRect((ox + 1) * cell, (oy + 1) * cell, 5 * cell, 5 * cell);
ctx.fillStyle = "#1d3326";
ctx.fillRect((ox + 2) * cell, (oy + 2) * cell, 3 * cell, 3 * cell);
};
olho(0, 0); olho(N - 7, 0); olho(0, N - 7);
}

/* ---------------- recompensas / brotos ---------------- */
async function carregarResgates() {
if (!usuario) { resgatesUsuario = []; return; }
try { resgatesUsuario = await api("/resgates"); }
catch { resgatesUsuario = []; }
}

async function renderBrotos() {
await carregarResgates();
const saldo = usuario ? usuario.brotos : 0;
$("#saldoBrotosPainel").textContent = saldo;
const proxima = RECOMPENSAS.filter((r) => r.custo > saldo).sort((a, b) => a.custo - b.custo)[0];
const pct = proxima ? Math.min(100, (saldo / proxima.custo) * 100) : 100;
$("#barraNivel").style.width = pct + "%";
$("#textoNivel").textContent = !usuario
? "Faça login para começar a acumular Brotos."
: proxima ? `Faltam ${proxima.custo - saldo} Brotos para: ${proxima.nome}.` : "Você pode resgatar todas as recompensas!";

$("#listaRecompensas").innerHTML = RECOMPENSAS.map((r) => {
const pode = usuario && saldo >= r.custo;
return `<div class="recompensa ${pode ? "" : "bloqueada"}">
<div style="display:flex;gap:12px;align-items:center">
<div><strong>${r.nome}</strong><div class="small muted">${r.desc}</div></div>
</div>
<div style="text-align:right">
<div class="custo">${r.custo} Brotos</div>
<button class="btn btn-sm" data-resgatar="${r.id}" ${pode ? "" : "disabled"} style="margin-top:6px">Resgatar</button>
</div>
</div>`;
}).join("");

const disponiveis = resgatesUsuario.filter((r) => !r.usado);
$("#meusResgates").innerHTML = disponiveis.length
? disponiveis.map((rg) => {
const r = rg.recompensa || RECOMPENSAS.find((x) => x.id === rg.recompensaId);
return `<div class="passo"><strong>${r?.nome || rg.recompensaId}</strong> <span class="small muted">· disponível no carrinho</span></div>`;
}).join("")
: '<p class="muted small">Nenhum resgate disponível. Resgate uma recompensa ao lado.</p>';
}

async function resgatar(id) {
if (!usuario) return abrirAuth("login");
try {
const data = await api("/resgates", { method: "POST", body: JSON.stringify({ recompensaId: id }) });
usuario = data.usuario;
atualizarHeader();
await renderBrotos();
toast("Resgatado! Aplique no carrinho.");
} catch (e) {
toast(e.message, true);
}
}

function renderRecompensasCarrinho() {
const cont = $("#recompensasCarrinho");
if (!usuario) {
cont.innerHTML = '<p class="muted small">Entre na sua conta para usar Brotos e recompensas.</p>';
return;
}
const disp = resgatesUsuario.filter((r) => !r.usado);
if (!disp.length) {
cont.innerHTML = `<p class="muted small">Você não tem recompensas resgatadas. <button class="btn btn-sm btn-ghost" data-ir="brotos">Ver recompensas</button></p>`;
return;
}
cont.innerHTML = disp.map((rg) => {
const r = rg.recompensa || RECOMPENSAS.find((x) => x.id === rg.recompensaId);
const rid = r?.id || rg.recompensaId;
const ativo = recompensasAplicadas.includes(rid);
return `<label class="check" style="padding:9px 0">
<input type="checkbox" data-aplicar="${rid}" ${ativo ? "checked" : ""} />
<strong>${r?.nome || ""}</strong> <span class="small muted">— ${r?.desc || ""}</span>
</label>`;
}).join("");
}

/* ---------------- finalizar compra ---------------- */
async function finalizarCompra() {
if (!usuario) { toast("Entre na sua conta para finalizar.", true); return abrirAuth("login"); }
if (!carrinho.length) return toast("Seu carrinho está vazio.", true);
if (!freteCalc) return toast("Calcule o frete informando o CEP.", true);
if (!$("#rua").value.trim() || !$("#numero").value.trim() || !$("#cidade").value.trim())
return toast("Preencha rua, número e cidade.", true);
if (metodoPagamento === "cartao") {
const num = ($("#cardNum")?.value || "").replace(/\s/g, "");
if (num.length < 16 || !$("#cardCvv")?.value || !$("#cardNome")?.value.trim())
return toast("Complete os dados do cartão.", true);
}
if ($("#chkPresente").checked && !$("#presenteNome").value.trim())
return toast("Informe o nome de quem vai receber o presente.", true);

const payload = {
itens: carrinho,
frete: freteCalc,
endereco: {
cep: $("#cep").value, rua: $("#rua").value, numero: $("#numero").value,
bairro: $("#bairro").value, cidade: $("#cidade").value, complemento: $("#complemento").value
},
pagamento: { metodo: metodoPagamento, parcelas: metodoPagamento === "cartao" ? parcelas : 1 },
presente: $("#chkPresente").checked ? {
para: $("#presenteNome").value, de: $("#presenteDe").value,
mensagem: $("#presenteMsg").value, ocultarValores: $("#presenteOcultar").checked
} : null,
recompensasAplicadas
};

try {
const data = await api("/pedidos", { method: "POST", body: JSON.stringify(payload) });
usuario = data.usuario;
carrinho = [];
recompensasAplicadas = [];
freteCalc = null;
atualizarHeader();
atualizarBadge();

const pedido = data.pedido;
$("#modalPedido").innerHTML = `
<button class="fechar" data-fechar>✕</button>
<div class="center">
<div class="pedido-sucesso-img"><img src="https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=200&h=200&q=80" alt="Pedido confirmado" /></div>
<h2>Pedido confirmado!</h2>
<p class="muted">Número <strong>${pedido.id}</strong></p>
<p style="font-size:1.4rem;font-family:Fraunces,serif;font-weight:700;margin:12px 0">${brl(pedido.total)}</p>
<p class="small">Você ganhou <strong>+${pedido.brotosGanhos} Brotos</strong></p>
<p class="small muted" style="margin-top:14px">Entrega estimada em ${pedido.frete?.prazo?.[0] || "?"} a ${pedido.frete?.prazo?.[1] || "?"} dias úteis para ${pedido.frete?.regiao || ""}.</p>
<div style="display:flex;gap:10px;justify-content:center;margin-top:18px;flex-wrap:wrap">
<button class="btn" data-ir-fechar="avaliacoes">Avaliar minha compra</button>
<button class="btn btn-ghost" data-ir-fechar="conta">Ver meus pedidos</button>
</div>
</div>`;
$("#overlayPedido").classList.add("aberto");
renderCarrinho();
} catch (e) {
toast(e.message, true);
}
}

/* ---------------- cursos ---------------- */
function renderCursos() {
$("#gradeCursos").innerHTML = CURSOS.map((c) => {
const feitas = c.progresso?.aulas?.length || 0;
const total = c.aulas?.length || 1;
const pct = Math.round((feitas / total) * 100);
const concluido = c.progresso?.concluido;
const capa = c.imagem
? `<img src="${c.imagem}" alt="${c.titulo}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling&&(this.nextElementSibling.style.display='grid')" /><span class="emoji-fallback" style="display:none">${c.emoji || ""}</span>`
: `<span class="emoji-fallback">${c.emoji || ""}</span>`;
return `<article class="card">
<div class="card-figura">${capa}</div>
<div class="card-corpo">
<div class="tags"><span class="tag">${c.nivel}</span><span class="tag">${c.duracao}</span><span class="tag">${c.brotos} Brotos</span></div>
<h3>${c.titulo}</h3>
<p class="small muted">${c.descricao}</p>
<div class="barra" style="margin-top:6px"><div style="width:${pct}%"></div></div>
<div class="small muted">${feitas}/${total} aulas ${concluido ? "· concluído" : ""}</div>
<div class="card-rodape">
<button class="btn btn-sm" data-curso="${c.id}">${concluido ? "Ver certificado" : "Acessar curso"}</button>
</div>
</div>
</article>`;
}).join("");
}

function abrirCurso(id) {
const c = CURSOS.find((x) => x.id === id);
if (!c) return;
const feitas = c.progresso?.aulas || [];
const concluido = c.progresso?.concluido;
$("#modalCurso").innerHTML = `
<button class="fechar" data-fechar>✕</button>
<div class="tags"><span class="tag">${c.nivel}</span><span class="tag">${c.duracao}</span><span class="tag">${c.brotos} Brotos</span></div>
${c.imagem ? `<div class="curso-capa-modal"><img src="${c.imagem}" alt="${c.titulo}" /></div>` : ""}
<h2 style="margin:10px 0 6px">${c.titulo}</h2>
<p class="muted">${c.descricao}</p>
<a class="btn btn-terra" href="${c.link}" target="_blank" rel="noopener" style="margin:16px 0">▶ Assistir no YouTube</a>
<h3 style="font-size:1rem;margin-top:8px">Aulas — marque conforme assistir</h3>
<div class="curso-passos">
${(c.aulas || []).map((a, i) => `<label class="passo"><input type="checkbox" data-aula="${c.id}|${i}" ${feitas.includes(i) ? "checked" : ""} ${usuario ? "" : "disabled"} /> ${i + 1}. ${a}</label>`).join("")}
</div>
${!usuario ? '<p class="small muted">Entre na sua conta para registrar o progresso e emitir o certificado.</p>' : ""}
<button class="btn btn-block" id="btnCertificado" ${feitas.length === (c.aulas || []).length && usuario ? "" : "disabled"}>
${concluido ? "Emitir certificado novamente" : "Concluir curso e emitir certificado"}
</button>`;
$("#overlayCurso").classList.add("aberto");
$("#btnCertificado").onclick = () => concluirCurso(c);
}

async function marcarAula(chave, marcado) {
if (!usuario) return;
const [cid, idx] = chave.split("|");
try {
const data = await api(`/cursos/${cid}/aulas`, {
method: "POST",
body: JSON.stringify({ indice: +idx, marcado })
});
const c = CURSOS.find((x) => x.id === cid);
if (c) {
c.progresso = c.progresso || {};
c.progresso.aulas = data.aulas;
}
const feitas = data.aulas.length;
const total = c?.aulas?.length || 0;
const btn = $("#btnCertificado");
if (btn) btn.disabled = feitas !== total;
renderCursos();
} catch (e) {
toast(e.message, true);
}
}

async function concluirCurso(c) {
try {
const data = await api(`/cursos/${c.id}/concluir`, { method: "POST", body: "{}" });
usuario = data.usuario;
c.progresso = {
...(c.progresso || {}),
concluido: true,
codigo: data.codigo,
dataConclusao: data.dataConclusao,
aulas: (c.aulas || []).map((_, i) => i)
};
atualizarHeader();
if (data.brotosGanhos) toast(`Curso concluído! +${data.brotosGanhos} Brotos`);
$("#overlayCurso").classList.remove("aberto");
mostrarCertificado(c);
renderCursos();
} catch (e) {
toast(e.message, true);
}
}

function mostrarCertificado(c) {
const reg = c.progresso || {};
const data = reg.dataConclusao
? new Date(reg.dataConclusao).toLocaleDateString("pt-BR")
: new Date().toLocaleDateString("pt-BR");
$("#modalCertificado").innerHTML = `
<button class="fechar" data-fechar>✕</button>
<div class="certificado">
<div class="cert-logo-img"><img src="https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=120&h=120&q=80" alt="Florescer" /></div>
<p class="small" style="letter-spacing:0.2em;text-transform:uppercase">Florescer</p>
<h2>Certificado de Conclusão</h2>
<p class="muted" style="margin-top:12px">Certificamos que</p>
<div class="nome">${usuario?.nome || ""}</div>
<p class="muted">concluiu com aproveitamento o curso livre</p>
<h3 style="margin:10px 0">${c.titulo}</h3>
<p class="small muted">Carga horária: ${c.duracao} · Nível ${c.nivel} · ${(c.aulas || []).length} aulas</p>
<p class="small muted" style="margin-top:16px">Emitido em ${data} · Código de validação <strong>${reg.codigo || "—"}</strong></p>
</div>
<div style="display:flex;gap:10px;justify-content:center;margin-top:18px">
<button class="btn" onclick="window.print()">Imprimir / salvar em PDF</button>
<button class="btn btn-ghost" data-fechar>Fechar</button>
</div>`;
$("#overlayCertificado").classList.add("aberto");
}

/* ---------------- avaliações ---------------- */
function cardAvaliacao(a) {
return `<div class="avaliacao">
<div style="display:flex;justify-content:space-between;align-items:center">
<strong>${a.autor}</strong>
<span class="small muted">${new Date(a.data).toLocaleDateString("pt-BR")}</span>
</div>
<div class="estrelas">${"★".repeat(a.nota)}${"☆".repeat(5 - a.nota)}</div>
<div class="small muted">${planta(a.plantaId)?.nome || "Planta"}</div>
<p style="margin-top:4px">${a.texto}</p>
</div>`;
}

async function renderAvaliacoes() {
try { avaliacoesCache = await api("/avaliacoes"); }
catch { avaliacoesCache = []; }
const todas = avaliacoesCache.slice().sort((a, b) => new Date(b.data) - new Date(a.data));
$("#listaAvaliacoes").innerHTML = todas.length
? todas.map(cardAvaliacao).join("")
: '<p class="muted small">Ainda não há avaliações. Seja a primeira pessoa a avaliar!</p>';

const form = $("#formAvaliacao");
if (!usuario) {
form.innerHTML = '<p class="muted small">Entre na sua conta para avaliar suas compras.</p>';
return;
}

let compradas = [];
try {
const pedidos = await api("/pedidos");
compradas = [...new Set(pedidos.flatMap((p) => p.itens.map((i) => i.id)))];
} catch { /* */ }

if (!compradas.length) {
form.innerHTML = '<p class="muted small">Você ainda não tem compras para avaliar. Depois do primeiro pedido, volte aqui e ganhe 50 Brotos por avaliação.</p>';
return;
}
form.innerHTML = `
<div class="campos">
<div><label class="rot">Planta comprada</label>
<select id="avPlanta">${compradas.map((id) => `<option value="${id}">${planta(id)?.nome || id}</option>`).join("")}</select>
</div>
<div><label class="rot">Sua nota</label>
<div class="estrelas-input" id="estrelasInput">${[1, 2, 3, 4, 5].map((n) => `<button data-nota="${n}" class="${n <= notaSelecionada ? "on" : ""}">★</button>`).join("")}</div>
</div>
<div><label class="rot">Comentário</label><textarea id="avTexto" rows="4" maxlength="500" placeholder="Como a planta chegou? Como ela está se adaptando?"></textarea></div>
<button class="btn" id="btnEnviarAv">Enviar avaliação (+50 Brotos)</button>
</div>`;
$("#btnEnviarAv").onclick = enviarAvaliacao;
}

async function enviarAvaliacao() {
const texto = $("#avTexto").value.trim();
if (texto.length < 10) return toast("Escreva ao menos 10 caracteres.", true);
try {
const data = await api("/avaliacoes", {
method: "POST",
body: JSON.stringify({ plantaId: $("#avPlanta").value, nota: notaSelecionada, texto })
});
usuario = data.usuario;
atualizarHeader();
toast("Obrigado pela avaliação! +50 Brotos");
notaSelecionada = 5;
renderAvaliacoes();
} catch (e) {
toast(e.message, true);
}
}

/* ---------------- conta / auth ---------------- */
function abrirAuth(modo = "login") {
const login = modo === "login";
$("#modalAuth").innerHTML = `
<button class="fechar" data-fechar>✕</button>
<h2>${login ? "Entrar na conta" : "Criar conta"}</h2>
<p class="muted small">${login ? "Bem-vindo de volta ao viveiro." : "Ganhe 100 Brotos de boas-vindas."}</p>
<div class="campos" style="margin-top:18px">
${login ? "" : '<div><label class="rot">Nome completo</label><input type="text" id="authNome" placeholder="Seu nome" /></div>'}
<div><label class="rot">E-mail</label><input type="email" id="authEmail" placeholder="voce@email.com" /></div>
<div><label class="rot">Senha</label><input type="password" id="authSenha" placeholder="Mínimo 6 caracteres" /></div>
${login ? "" : '<div><label class="rot">Confirmar senha</label><input type="password" id="authSenha2" placeholder="Repita a senha" /></div>'}
<button class="btn btn-block" id="btnAuthSubmit">${login ? "Entrar" : "Criar minha conta"}</button>
<p class="small center muted">${login ? "Ainda não tem conta?" : "Já tem conta?"}
<a href="#" id="trocarModo" style="color:var(--verde-700);font-weight:600">${login ? "Criar agora" : "Entrar"}</a></p>
</div>`;
$("#overlayAuth").classList.add("aberto");
$("#trocarModo").onclick = (e) => { e.preventDefault(); abrirAuth(login ? "cadastro" : "login"); };
$("#btnAuthSubmit").onclick = () => (login ? fazerLogin() : criarConta());
}

async function criarConta() {
const nome = $("#authNome").value.trim();
const email = $("#authEmail").value.trim().toLowerCase();
const senha = $("#authSenha").value;
const senha2 = $("#authSenha2").value;
if (nome.length < 3) return toast("Informe seu nome completo.", true);
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast("E-mail inválido.", true);
if (senha.length < 6) return toast("A senha precisa de ao menos 6 caracteres.", true);
if (senha !== senha2) return toast("As senhas não coincidem.", true);

try {
const data = await api("/auth/register", { method: "POST", body: JSON.stringify({ nome, email, senha }) });
setToken(data.token);
usuario = data.usuario;

const visitante = JSON.parse(sessionStorage.getItem("rf_cart_visitante") || "[]");
if (visitante.length) {
visitante.forEach((v) => {
const ex = carrinho.find((i) => i.id === v.id);
ex ? (ex.qtd += v.qtd) : carrinho.push(v);
});
sessionStorage.removeItem("rf_cart_visitante");
await salvarCarrinho();
}

$("#overlayAuth").classList.remove("aberto");
atualizarHeader();
atualizarBadge();
toast(`Conta criada! Bem-vindo(a), ${nome.split(" ")[0]}. +100 Brotos`);
CURSOS = await api("/cursos");
irPara("conta");
} catch (e) {
toast(e.message, true);
}
}

async function fazerLogin() {
const email = $("#authEmail").value.trim().toLowerCase();
const senha = $("#authSenha").value;
try {
const data = await api("/auth/login", { method: "POST", body: JSON.stringify({ email, senha }) });
setToken(data.token);
usuario = data.usuario;

const visitante = JSON.parse(sessionStorage.getItem("rf_cart_visitante") || "[]");
await carregarCarrinho();
preencherEnderecoDoUsuario();
if (visitante.length) {
visitante.forEach((v) => {
const ex = carrinho.find((i) => i.id === v.id);
ex ? (ex.qtd += v.qtd) : carrinho.push(v);
});
sessionStorage.removeItem("rf_cart_visitante");
await salvarCarrinho();
}

$("#overlayAuth").classList.remove("aberto");
atualizarHeader();
atualizarBadge();
toast(`Olá de novo, ${usuario.nome.split(" ")[0]}!`);
CURSOS = await api("/cursos");
await carregarResgates();
irPara("conta");
} catch (e) {
toast(e.message, true);
}
}

function sair() {
setToken(null);
usuario = null;
carrinho = [];
recompensasAplicadas = [];
resgatesUsuario = [];
atualizarHeader();
atualizarBadge();
toast("Você saiu da conta.");
irPara("inicio");
}

async function renderConta() {
const cont = $("#conteudoConta");
if (!usuario) {
cont.innerHTML = `<div class="painel center">
<h3>Você ainda não entrou</h3>
<p class="muted">Crie sua conta para acumular Brotos, salvar endereços, acompanhar pedidos e emitir certificados.</p>
<div style="display:flex;gap:10px;justify-content:center;margin-top:16px">
<button class="btn" id="ctaEntrar">Entrar</button>
<button class="btn btn-ghost" id="ctaCriar">Criar conta</button>
</div>
</div>`;
$("#ctaEntrar").onclick = () => abrirAuth("login");
$("#ctaCriar").onclick = () => abrirAuth("cadastro");
return;
}

let pedidos = [];
try { pedidos = await api("/pedidos"); } catch { /* */ }

const cursosFeitos = CURSOS.filter((c) => c.progresso?.concluido);

cont.innerHTML = `
<div class="layout-2col">
<div>
<div class="painel">
<h3>Meus pedidos</h3>
${pedidos.length ? pedidos.map((p) => `
<div class="pedido">
<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px">
<strong>${p.id}</strong><span class="tag">${p.status}</span>
</div>
<div class="small muted">${new Date(p.data).toLocaleDateString("pt-BR")} · ${p.itens.reduce((s, i) => s + i.qtd, 0)} item(ns) · ${brl(p.totais.total)}</div>
<div class="small">${p.itens.map((i) => `${i.qtd}× ${i.nome}`).join(" · ")}</div>
<div class="small muted">Envio: ${p.frete.regiao || "—"} · ${p.frete.prazo?.[0] || "?"}–${p.frete.prazo?.[1] || "?"} dias · ${p.pagamento.metodo === "cartao" ? p.pagamento.parcelas + "x cartão" : p.pagamento.metodo}</div>
${p.presente ? `<div class="small">🎁 Presente para ${p.presente.para}</div>` : ""}
<div class="small" style="color:var(--verde-700)">+${p.brotosGanhos} Brotos</div>
</div>`).join("") : '<p class="muted small">Nenhum pedido ainda.</p>'}
</div>
<div class="painel">
<h3>Meus certificados</h3>
${cursosFeitos.length ? cursosFeitos.map((c) => `
<div class="passo" style="justify-content:space-between">
<span><strong>${c.titulo}</strong> <span class="small muted">· ${c.progresso.codigo}</span></span>
<button class="btn btn-sm btn-ghost" data-cert="${c.id}">Ver</button>
</div>`).join("") : '<p class="muted small">Conclua um curso para emitir seu primeiro certificado.</p>'}
</div>
</div>
<div>
<div class="painel">
<h3>Dados pessoais</h3>
<p><strong>${usuario.nome}</strong></p>
<p class="small muted">${usuario.email}</p>
<p class="small muted">Membro desde ${new Date(usuario.criadoEm).toLocaleDateString("pt-BR")}</p>
<div class="aviso" style="margin:14px 0">Saldo: <strong>${usuario.brotos} Brotos</strong></div>
<button class="btn btn-ghost btn-block" id="btnSair">Sair da conta</button>
</div>
<div class="painel">
<h3>Endereço salvo</h3>
<p class="small muted" style="margin-bottom:12px">Este endereço será preenchido automaticamente no carrinho na hora da compra.</p>
<div class="campos">
<div><label class="rot">CEP</label><input type="text" id="contaCep" value="${usuario.endereco?.cep || ""}" placeholder="00000-000" maxlength="9" /></div>
<div class="campos campos-2">
<div><label class="rot">Rua / logradouro</label><input type="text" id="contaRua" value="${(usuario.endereco?.rua || "").replace(/,\s*\d+[A-Za-z\-\/]*$/, "").trim() || usuario.endereco?.rua || ""}" placeholder="Rua das Palmeiras" /></div>
<div><label class="rot">Número</label><input type="text" id="contaNumero" value="${((usuario.endereco?.rua || "").match(/,\s*(\d+[A-Za-z\-\/]*)$/) || [])[1] || ""}" placeholder="123" /></div>
</div>
<div class="campos campos-2">
<div><label class="rot">Bairro</label><input type="text" id="contaBairro" value="${usuario.endereco?.bairro || ""}" /></div>
<div><label class="rot">Cidade</label><input type="text" id="contaCidade" value="${usuario.endereco?.cidade || ""}" /></div>
</div>
<div><label class="rot">Complemento (opcional)</label><input type="text" id="contaComplemento" value="${usuario.endereco?.complemento || ""}" placeholder="Apto 42" /></div>
<button class="btn" id="btnSalvarEndereco">Salvar endereço</button>
</div>
</div>
</div>
</div>`;

$("#btnSair").onclick = sair;
$("#btnSalvarEndereco").onclick = async () => {
try {
const ruaBase = ($("#contaRua").value || "").trim();
const numero = ($("#contaNumero")?.value || "").trim();
const rua = numero ? `${ruaBase}, ${numero}` : ruaBase;
const data = await api("/me/endereco", {
method: "PUT",
body: JSON.stringify({
cep: $("#contaCep").value,
rua,
bairro: $("#contaBairro").value,
cidade: $("#contaCidade").value,
complemento: $("#contaComplemento")?.value || ""
})
});
usuario = data.usuario;
toast("Endereço salvo. Ele será usado automaticamente no carrinho.");
} catch (e) {
toast(e.message, true);
}
};
}

function atualizarHeader() {
$("#saldoBrotos").textContent = usuario ? usuario.brotos : 0;
$("#btnAuth").textContent = usuario ? usuario.nome.split(" ")[0] : "Entrar";
}

/* ---------------- FAQ ---------------- */
function renderFaq() {
$("#listaFaq").innerHTML = FAQ.map((f) => `
<details class="faq-item"><summary>${f.q}</summary><p>${f.a}</p></details>`).join("");
}

/* ---------------- inicialização ---------------- */
async function init() {
$("#ano").textContent = new Date().getFullYear();

try {
CATALOGO = await api("/plantas");
CURSOS = await api("/cursos");
RECOMPENSAS = await api("/recompensas");
FAQ = await api("/faq");
const meta = await api("/meta");

meta.categorias.forEach((c) =>
$("#filtroCategoria").insertAdjacentHTML("beforeend", `<option value="${c}">${c}</option>`));
meta.ambientes.forEach((a) =>
$("#filtroAmbiente").insertAdjacentHTML("beforeend", `<option value="${a}">${a}</option>`));
} catch (e) {
console.error("Falha ao carregar dados da API:", e);
toast("Não foi possível conectar ao servidor. Rode: cd backend && npm install && node seed.js && node server.js", true);
}

if (getToken()) {
try {
const data = await api("/me");
usuario = data.usuario;
await carregarCarrinho();
await carregarResgates();
CURSOS = await api("/cursos");
} catch {
setToken(null);
usuario = null;
carrinho = JSON.parse(sessionStorage.getItem("rf_cart_visitante") || "[]");
}
} else {
carrinho = JSON.parse(sessionStorage.getItem("rf_cart_visitante") || "[]");
}

atualizarHeader();
atualizarBadge();

$("#destaques").innerHTML = CATALOGO
.filter((p) => ["p01", "p02", "p07", "p15"].includes(p.id))
.map(cardPlanta).join("");
renderCatalogo();
renderCursos();
renderFaq();

["#busca", "#filtroCategoria", "#filtroAmbiente", "#filtroLuz", "#filtroPet", "#filtroOrdem"]
.forEach((s) => {
$(s)?.addEventListener("input", renderCatalogo);
$(s)?.addEventListener("change", renderCatalogo);
});

// Menu desktop + mobile
const handleMenuClick = (e) => {
const b = e.target.closest("button[data-secao]");
if (b) irPara(b.dataset.secao);
};
$("#menu")?.addEventListener("click", handleMenuClick);
$("#menuMobile")?.addEventListener("click", handleMenuClick);

$("#btnCarrinho").onclick = () => irPara("carrinho");
$("#btnAuth").onclick = () => (usuario ? irPara("conta") : abrirAuth("login"));
// pillBrotos já tem data-ir; o listener global cobre
$("#pillBrotos")?.addEventListener("click", () => irPara("brotos"));
$("#btnCalcularFrete").onclick = calcularFrete;
$("#btnFinalizar").onclick = finalizarCompra;

$("#cep").addEventListener("input", (e) => {
const v = e.target.value.replace(/\D/g, "").slice(0, 8);
e.target.value = v.length > 5 ? v.slice(0, 5) + "-" + v.slice(5) : v;
});
$("#modalidade").addEventListener("change", () => { if (freteCalc) calcularFrete(); });

$("#chkPresente").addEventListener("change", (e) => {
$("#camposPresente").classList.toggle("hidden", !e.target.checked);
renderResumo();
});

$("#metodos").addEventListener("click", (e) => {
const m = e.target.closest(".metodo");
if (!m) return;
$$(".metodo").forEach((x) => x.classList.remove("ativo"));
m.classList.add("ativo");
metodoPagamento = m.dataset.metodo;
parcelas = 1;
renderPagamento();
renderResumo();
});

document.addEventListener("click", async (e) => {
const t = e.target;
if (t.closest("[data-fechar]")) $$(".overlay").forEach((o) => o.classList.remove("aberto"));
if (t.classList.contains("overlay")) t.classList.remove("aberto");

const add = t.closest("[data-add]"); if (add) addCarrinho(add.dataset.add);
const det = t.closest("[data-detalhe]"); if (det) abrirDetalhe(det.dataset.detalhe);
const ir = t.closest("[data-ir]"); if (ir) irPara(ir.dataset.ir);
const irF = t.closest("[data-ir-fechar]");
if (irF) { $$(".overlay").forEach((o) => o.classList.remove("aberto")); irPara(irF.dataset.irFechar); }

const mais = t.closest("[data-mais]");
if (mais) {
const it = carrinho.find((i) => i.id === mais.dataset.mais);
if (it) { it.qtd++; await salvarCarrinho(); atualizarBadge(); renderCarrinho(); }
}
const menos = t.closest("[data-menos]");
if (menos) {
const it = carrinho.find((i) => i.id === menos.dataset.menos);
if (it) {
it.qtd--;
if (it.qtd <= 0) carrinho = carrinho.filter((i) => i.id !== it.id);
await salvarCarrinho(); atualizarBadge(); renderCarrinho();
}
}
const rem = t.closest("[data-remover]");
if (rem) {
carrinho = carrinho.filter((i) => i.id !== rem.dataset.remover);
await salvarCarrinho(); atualizarBadge(); renderCarrinho();
}

const res = t.closest("[data-resgatar]"); if (res) resgatar(res.dataset.resgatar);
const cur = t.closest("[data-curso]"); if (cur) abrirCurso(cur.dataset.curso);
const cert = t.closest("[data-cert]");
if (cert) {
const c = CURSOS.find((x) => x.id === cert.dataset.cert);
if (c) mostrarCertificado(c);
}

const est = t.closest("[data-nota]");
if (est) {
notaSelecionada = +est.dataset.nota;
$$("#estrelasInput button").forEach((b) => b.classList.toggle("on", +b.dataset.nota <= notaSelecionada));
}
});

document.addEventListener("change", (e) => {
const aula = e.target.closest("[data-aula]");
if (aula) marcarAula(aula.dataset.aula, aula.checked);
const apl = e.target.closest("[data-aplicar]");
if (apl) {
const id = apl.dataset.aplicar;
recompensasAplicadas = apl.checked
? [...new Set([...recompensasAplicadas, id])]
: recompensasAplicadas.filter((x) => x !== id);
renderResumo();
renderPagamento();
}
});

document.addEventListener("keydown", (e) => {
if (e.key === "Escape") $$(".overlay").forEach((o) => o.classList.remove("aberto"));
});

// Menu mobile (hamburger)
$("#btnMenu")?.addEventListener("click", () => {
$("#menuMobile")?.classList.toggle("aberto");
$("#btnMenu")?.classList.toggle("aberto");
});


// Ano no rodapé
const anoEl = $("#ano");
if (anoEl) anoEl.textContent = new Date().getFullYear();
}

document.addEventListener("DOMContentLoaded", init);

