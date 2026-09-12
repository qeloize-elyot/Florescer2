/* =========================================================
   Flora — Assistente de cultivo do Florescer
   ========================================================= */

(function () {
  const FLORA_HIST_KEY = "rf_flora_hist";
  const MAX_HIST = 12;

  let floraVozLigada = true;
  try {
    const v = localStorage.getItem("rf_flora_voz");
    if (v === "0") floraVozLigada = false;
    if (v === "1") floraVozLigada = true;
  } catch (_) {}

  function falarFlora(texto) {
    if (!floraVozLigada) return;
    if (!window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(texto || ""));
      u.lang = "pt-BR";
      u.rate = 0.92;
      u.pitch = 1.05;
      const voices = window.speechSynthesis.getVoices() || [];
      const pt = voices.find((v) => /pt-BR/i.test(v.lang))
        || voices.find((v) => /pt/i.test(v.lang));
      if (pt) u.voice = pt;
      window.speechSynthesis.speak(u);
    } catch (_) {}
  }

  function pararFala() {
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (_) {}
  }

  function $(s, ctx) { return (ctx || document).querySelector(s); }

  function loadHist() {
    try { return JSON.parse(sessionStorage.getItem(FLORA_HIST_KEY) || "[]"); }
    catch { return []; }
  }
  function saveHist(h) {
    sessionStorage.setItem(FLORA_HIST_KEY, JSON.stringify(h.slice(-MAX_HIST)));
  }

  function ensureUI() {
    if ($("#flora-root")) return;

    const root = document.createElement("div");
    root.id = "flora-root";
    root.innerHTML = `
      <button type="button" id="flora-bubble" class="flora-bubble" aria-label="Abrir chat com a Flora">
        <span class="flora-bubble-avatar" aria-hidden="true">
          <img id="flora-avatar-img" src="flora-avatar.jpg" alt=""
            onerror="this.style.display='none';this.nextElementSibling.style.display='grid'" />
          <span class="flora-avatar-fallback" style="display:none">
            <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
              <circle cx="32" cy="32" r="30" fill="#E8EFE4"/>
              <path d="M18 38c4-10 10-16 14-18 4 2 10 8 14 18" fill="#9AAB8E" opacity=".35"/>
              <circle cx="32" cy="26" r="10" fill="#F5D5CC"/>
              <path d="M22 28c2 6 6 10 10 10s8-4 10-10" stroke="#D4897A" stroke-width="1.2" fill="none"/>
              <path d="M12 22c6-2 10 2 12 6-4 2-8 2-12 0v-6z" fill="#9AAB8E" opacity=".7"/>
              <path d="M52 22c-6-2-10 2-12 6 4 2 8 2 12 0v-6z" fill="#9AAB8E" opacity=".7"/>
              <path d="M28 18c-2-6 0-10 4-12 4 2 6 6 4 12" fill="#E8A99A" opacity=".8"/>
            </svg>
          </span>
        </span>
        <span class="flora-bubble-pulse" aria-hidden="true"></span>
      </button>

      <div id="flora-panel" class="flora-panel" hidden style="display:none">
        <header class="flora-panel-head">
          <div class="flora-panel-who">
            <div class="flora-panel-avatar">
              <img src="flora-avatar.jpg" alt=""
                onerror="this.style.display='none';this.nextElementSibling.style.display='grid'" />
              <span class="flora-avatar-fallback" style="display:none">
                <svg viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="30" fill="#E8EFE4"/><circle cx="32" cy="26" r="10" fill="#F5D5CC"/><path d="M12 22c6-2 10 2 12 6-4 2-8 2-12 0v-6z" fill="#9AAB8E" opacity=".7"/><path d="M52 22c-6-2-10 2-12 6 4 2 8 2 12 0v-6z" fill="#9AAB8E" opacity=".7"/></svg>
              </span>
            </div>
            <div>
              <strong>Flora</strong>
              <span class="flora-panel-status">Assistente de cultivo · Florescer</span>
            </div>
          </div>
          <div class="flora-head-actions">
            <button type="button" id="flora-voz" class="flora-voz" aria-pressed="true" title="Ligar ou desligar a voz da Flora">🔊 Voz</button>
            <button type="button" id="flora-close" class="flora-close" aria-label="Fechar">✕</button>
          </div>
        </header>

        <div id="flora-messages" class="flora-messages" role="log" aria-live="polite"></div>

        <form id="flora-form" class="flora-form" autocomplete="off">
          <input type="text" id="flora-input" maxlength="500"
            placeholder="Ex.: minha jiboia está amarela..." aria-label="Mensagem para a Flora" />
          <button type="submit" class="flora-send" aria-label="Enviar">Enviar</button>
        </form>
        <p class="flora-disclaimer">Dicas gerais de cultivo · Não substitui profissional</p>
      </div>
    `;
    document.body.appendChild(root);

    $("#flora-bubble").addEventListener("click", openPanel);
    $("#flora-close").addEventListener("click", closePanel);
    $("#flora-form").addEventListener("submit", onSubmit);
    const btnVoz = $("#flora-voz");
    if (btnVoz) {
      const syncVoz = () => {
        btnVoz.setAttribute("aria-pressed", floraVozLigada ? "true" : "false");
        btnVoz.textContent = floraVozLigada ? "🔊 Voz" : "🔇 Voz";
        btnVoz.classList.toggle("off", !floraVozLigada);
      };
      syncVoz();
      btnVoz.addEventListener("click", () => {
        floraVozLigada = !floraVozLigada;
        try { localStorage.setItem("rf_flora_voz", floraVozLigada ? "1" : "0"); } catch (_) {}
        if (!floraVozLigada) pararFala();
        syncVoz();
      });
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }

    const hist = loadHist();
    if (!hist.length) {
      addMsg("flora", "Olá! Eu sou a Flora. Posso ajudar com as plantas do catálogo Florescer — luz, rega, pets e sintomas comuns. O que está acontecendo com a sua planta?");
    } else {
      hist.forEach((m) => addMsg(m.role, m.text, false));
    }
  }

  function openPanel() {
    const panel = $("#flora-panel");
    if (!panel) return;
    panel.hidden = false;
    panel.style.display = "flex";
    void panel.offsetWidth;
    panel.classList.add("aberto");
    $("#flora-bubble")?.classList.add("escondido");
    setTimeout(() => {
      try { $("#flora-input")?.focus(); } catch (_) {}
    }, 250);
  }

  function closePanel() {
    pararFala();
    const panel = $("#flora-panel");
    if (!panel) return;
    panel.classList.remove("aberto");
    $("#flora-bubble")?.classList.remove("escondido");
    setTimeout(() => {
      panel.hidden = true;
      panel.style.display = "none";
    }, 220);
  }

  function addMsg(role, text, store = true) {
    const box = $("#flora-messages");
    if (!box) return;
    const el = document.createElement("div");
    el.className = "flora-msg flora-msg-" + role;
    el.textContent = text;
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
    if (store) {
      const h = loadHist();
      h.push({ role, text });
      saveHist(h);
    }
    if (role === "flora" && store) falarFlora(text);
  }

  function setTyping(on) {
    const box = $("#flora-messages");
    let t = $("#flora-typing");
    if (on) {
      if (t) return;
      t = document.createElement("div");
      t.id = "flora-typing";
      t.className = "flora-msg flora-msg-flora flora-typing";
      t.textContent = "Flora está pensando…";
      box.appendChild(t);
      box.scrollTop = box.scrollHeight;
    } else if (t) t.remove();
  }

  async function onSubmit(e) {
    e.preventDefault();
    const input = $("#flora-input");
    const text = (input.value || "").trim();
    if (!text) return;
    input.value = "";
    addMsg("user", text);
    setTyping(true);

    const hist = loadHist()
      .filter((m) => m.role === "user" || m.role === "flora")
      .slice(-8)
      .map((m) => ({ role: m.role === "flora" ? "assistant" : "user", content: m.text }));

    try {
      const res = await fetch("/api/flora/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagem: text, historico: hist })
      });
      const data = await res.json().catch(() => ({}));
      setTyping(false);
      if (!res.ok) {
        addMsg("flora", data.erro || "Não consegui responder agora. Tente de novo em instantes.");
        return;
      }
      addMsg("flora", data.resposta || "Não encontrei uma boa resposta. Pode me contar o nome da planta?");
    } catch {
      setTyping(false);
      addMsg("flora", "Falha de conexão. Verifique a internet e tente outra vez.");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureUI);
  } else {
    ensureUI();
  }
})();
