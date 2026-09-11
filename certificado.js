/* certificado.js — certificado visual + cartão-presente (carrega após app.js) */
(function () {
  // estado extra
  if (typeof pedidosCache === "undefined") window.pedidosCache = [];
  else { /* already declared in app if updated */ }

  const LOGO_MARK_SVG = `<svg class="logo-mark-svg" viewBox="0 0 64 64" fill="none" aria-hidden="true">
<path d="M32 8c13.255 0 24 10.745 24 24 0 8.284-4.197 15.57-10.5 19.8" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" fill="none"/>
<path d="M32 8C18.745 8 8 18.745 8 32c0 8.284 4.197 15.57 10.5 19.8" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" fill="none"/>
<path d="M32 48V28" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
<path d="M32 32c-7-5-12-3-13.5 2.5 3-1.5 8-1 10.5 4.5" fill="currentColor"/>
<path d="M32 32c7-5 12-3 13.5 2.5-3-1.5-8-1-10.5 4.5" fill="currentColor"/>
<circle cx="48" cy="16" r="5" fill="#E8A99A"/>
</svg>`;

  window.mostrarCertificado = function (c) {
    const reg = c.progresso || {};
    const data = reg.dataConclusao
      ? new Date(reg.dataConclusao).toLocaleDateString("pt-BR")
      : new Date().toLocaleDateString("pt-BR");
    const codigo = reg.codigo || "—";
    const nome = (typeof usuario !== "undefined" && usuario?.nome) || "Aluno(a)";
    const aulas = (c.aulas || []).length;
    const $ = (s) => document.querySelector(s);

    $("#modalCertificado").innerHTML = `
<button class="fechar" data-fechar>✕</button>
<div class="certificado-visual" id="certificadoPrintavel">
  <div class="cert-header">
    ${LOGO_MARK_SVG}
    <span class="cert-brand">florescer</span>
  </div>
  <p class="cert-tagline">Plantas · Conexões · Cultivo</p>
  <h2 class="cert-titulo">Certificado de Conclusão</h2>
  <p class="cert-sub">Certificamos que</p>
  <div class="cert-nome">${nome}</div>
  <p class="cert-sub">concluiu com aproveitamento o curso livre</p>
  <h3 class="cert-curso">${c.titulo}</h3>
  <p class="cert-meta">Carga horária: ${c.duracao} · Nível ${c.nivel} · ${aulas} aula${aulas !== 1 ? "s" : ""}</p>
  <div class="cert-footer">
    <div class="cert-selo">
      <div class="selo-circulo">Florescer<br/>oficial</div>
      <span class="small muted" style="margin-top:4px">Emitido em ${data}</span>
    </div>
    <div class="cert-codigo" title="Código de validação">Cód. ${codigo}</div>
    <div class="cert-assinatura">
      <div class="linha"></div>
      <div class="nome-ass">Equipe Florescer</div>
      <div class="cargo">Educação &amp; cultivo</div>
    </div>
  </div>
</div>
<div class="cert-acoes">
  <button class="btn" onclick="window.print()">Imprimir / salvar em PDF</button>
  <button class="btn btn-ghost" data-fechar>Fechar</button>
</div>`;
    $("#overlayCertificado").classList.add("aberto");
  };

  window.mostrarCartaoPresente = function (presente, pedidoId) {
    if (!presente) return;
    const para = presente.para || "—";
    const de = presente.de || "Alguém especial";
    const msg = (presente.mensagem || "").trim() || "Que esta plantinha floresça junto com você.";
    const id = pedidoId ? ` · Pedido ${pedidoId}` : "";
    const $ = (s) => document.querySelector(s);

    $("#modalCartaoPresente").innerHTML = `
<button class="fechar" data-fechar>✕</button>
<div class="cartao-presente-visual" id="cartaoPrintavel">
  <div class="faixa-topo"></div>
  <div class="cartao-header">
    ${LOGO_MARK_SVG}
    <span class="cartao-label">Cartão-presente</span>
  </div>
  <h2 class="cartao-titulo">Um presente com carinho</h2>
  <div class="cartao-campos">
    <div class="cartao-campo">
      <label>Para</label>
      <div class="valor">${para}</div>
    </div>
    <div class="cartao-campo">
      <label>De</label>
      <div class="valor">${de}</div>
    </div>
    <div class="cartao-mensagem">“${msg.replace(/"/g, "&quot;")}”</div>
  </div>
  <p class="cartao-rodape">florescer${id} · plantas escolhidas com cuidado</p>
</div>
<div class="cert-acoes">
  <button class="btn" onclick="window.print()">Imprimir / salvar em PDF</button>
  <button class="btn btn-ghost" data-fechar>Fechar</button>
</div>`;
    $("#overlayCartaoPresente").classList.add("aberto");
  };

  // Clique em "Ver cartão" nos pedidos
  document.addEventListener("click", function (e) {
    const t = e.target;
    const cartaoBtn = t.closest && t.closest("[data-cartao-presente]");
    if (cartaoBtn) {
      const id = cartaoBtn.dataset.cartaoPresente;
      const lista = (typeof pedidosCache !== "undefined" && pedidosCache) || window.__pedidosCache || [];
      const pedido = lista.find((p) => p.id === id);
      if (pedido?.presente) window.mostrarCartaoPresente(pedido.presente, pedido.id);
    }
  });

  function tryPatch() {
    if (typeof renderConta !== "function") return false;
    const original = renderConta;
    window.renderConta = async function () {
      await original.apply(this, arguments);
      try {
        if (typeof api === "function" && typeof getToken === "function" && getToken()) {
          const pedidos = await api("/pedidos");
          window.pedidosCache = pedidos;
          window.__pedidosCache = pedidos;
          document.querySelectorAll(".pedido").forEach((el) => {
            const strong = el.querySelector("strong");
            if (!strong) return;
            const pid = strong.textContent.trim();
            const p = pedidos.find((x) => x.id === pid);
            if (p?.presente && !el.querySelector("[data-cartao-presente]")) {
              const line = document.createElement("div");
              line.className = "small";
              line.style.cssText = "display:flex;align-items:center;gap:8px;flex-wrap:wrap";
              line.innerHTML = `🎁 Presente para ${p.presente.para} <button class="btn btn-sm btn-ghost" data-cartao-presente="${p.id}">Ver cartão</button>`;
              el.appendChild(line);
            }
          });
        }
      } catch (err) { /* ignore */ }
    };
    return true;
  }

  if (!tryPatch()) {
    document.addEventListener("DOMContentLoaded", () => setTimeout(tryPatch, 100));
    setTimeout(tryPatch, 500);
  }
})();
