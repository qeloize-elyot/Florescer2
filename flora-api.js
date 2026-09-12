/**
 * Flora — rotas da assistente de cultivo
 * Uso: require("./flora-api")(app, { db, mapPlanta, clean, rateLimit });
 */
module.exports = function registerFlora(app, deps) {
  const { db, mapPlanta, clean, rateLimit } = deps;

  const floraLimiter = rateLimit
    ? rateLimit({
        windowMs: 60 * 1000,
        max: 20,
        standardHeaders: true,
        legacyHeaders: false,
        message: { erro: "Muitas mensagens. Espere um minutinho." }
      })
    : (req, res, next) => next();

  function floraSystemPrompt(plantasCtx) {
    return `Você é a Flora, assistente de cultivo do viveiro digital Florescer.
Fale em português do Brasil, de forma acolhedora, clara e prática.
Use prioritariamente as plantas do catálogo abaixo. Se a pergunta for genérica (folha amarela, ponta seca, etc.), dê orientações gerais seguras e peça o nome da planta se ajudar.
Não invente plantas que não estejam no contexto. Não receite agrotóxicos perigosos nem diagnósticos definitivos.
Se envolver pet + planta tóxica, alerte com cuidado e sugira veterinário se houver ingestão.
Respostas curtas a médias (até ~180 palavras). Tom humano.

Catálogo relevante:
${plantasCtx || "(nenhuma planta específica encontrada — oriente de forma geral e peça o nome)"}`;
  }

  function floraOfflineReply(mensagem, plantas) {
    const msg = (mensagem || "").toLowerCase();
    if (!plantas.length) {
      if (/amarel|amarela|amarelo/.test(msg)) {
        return "Folha amarela costuma apontar para excesso de água, falta de luz ou substrato compactado. Me diga o nome da planta (ou se ela está no catálogo Florescer) que eu afino a dica — rega, luz e se é segura para pets.";
      }
      if (/pet|gato|cachorro|cão|cao/.test(msg)) {
        return "Posso checar se uma planta do nosso catálogo é pet friendly. Qual o nome dela?";
      }
      return "Posso ajudar com as plantas do catálogo Florescer: luz, rega, porte e segurança para pets. Qual planta você tem em casa, ou o que está acontecendo com ela?";
    }
    const p = plantas[0];
    const pet = p.petFriendly
      ? "É considerada pet friendly no nosso catálogo."
      : "Atenção: no catálogo ela NÃO é indicada como pet friendly (pode ser tóxica para animais).";
    let extra = "";
    if (/amarel|amarela|amarelo/.test(msg)) {
      extra = ` Sobre folhas amarelas: confira se a rega está alinhada ao que ela gosta (“${p.agua}”) e se a luz está como indicado (“${p.luz}”). Evite deixar o prato com água parada.`;
    }
    if (/pet|gato|cachorro|cão|cao/.test(msg)) extra = " " + pet;
    return `${p.nome} (${p.cientifico}) — ${p.resumo || ""} Luz: ${p.luz}. Água: ${p.agua}. Umidade: ${p.umidade}. Porte: ${p.porte}. Dificuldade: ${p.dificuldade}. ${pet}${extra}`;
  }

  async function buscarPlantasRelevantes(mensagem) {
    const raw = String(mensagem || "").toLowerCase().slice(0, 200);
    const tokens = raw.split(/[^a-záàâãéêíóôõúç0-9]+/i).filter((t) => t.length >= 3);
    const { rows } = await db.query(`SELECT * FROM plantas WHERE ativo = 1 ORDER BY id ASC LIMIT 80`);
    const all = rows.map(mapPlanta);
    if (!tokens.length) return all.slice(0, 3);

    const scored = all
      .map((p) => {
        const blob = `${p.nome} ${p.cientifico} ${p.categoria} ${p.resumo} ${p.historia} ${p.luz} ${p.agua}`.toLowerCase();
        let score = 0;
        tokens.forEach((t) => {
          if (blob.includes(t)) score += t.length >= 5 ? 3 : 1;
        });
        if (raw.includes((p.nome || "").toLowerCase())) score += 10;
        return { p, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);

    const top = scored.slice(0, 4).map((x) => x.p);
    return top.length ? top : all.slice(0, 2);
  }

  function formatPlantasCtx(plantas) {
    return plantas
      .map(
        (p) =>
          `- ${p.nome} (${p.cientifico}): categoria ${p.categoria}, ambiente ${p.ambiente}, luz ${p.luz}, água ${p.agua}, umidade ${p.umidade}, porte ${p.porte}, dificuldade ${p.dificuldade}, petFriendly ${p.petFriendly ? "sim" : "não"}. Resumo: ${p.resumo || ""}`
      )
      .join("\n");
  }

  async function chamarGroq(system, messages) {
    const key = process.env.GROQ_API_KEY;
    if (!key) return null;
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + key
      },
      body: JSON.stringify({
        model: process.env.FLORA_MODEL || "llama-3.1-8b-instant",
        temperature: 0.5,
        max_tokens: 450,
        messages: [{ role: "system", content: system }, ...messages]
      })
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn("[Flora/Groq]", res.status, errText.slice(0, 200));
      return null;
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  }

  async function chamarGemini(system, messages) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return null;
    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));
    contents.unshift({ role: "user", parts: [{ text: system }] });
    contents.splice(1, 0, {
      role: "model",
      parts: [{ text: "Entendido. Sou a Flora e vou ajudar com base no catálogo Florescer." }]
    });

    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" +
      encodeURIComponent(key);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        generationConfig: { temperature: 0.5, maxOutputTokens: 450 }
      })
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn("[Flora/Gemini]", res.status, errText.slice(0, 200));
      return null;
    }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  }

  app.post("/api/flora/chat", floraLimiter, async (req, res) => {
    try {
      const mensagem = clean(req.body?.mensagem, 500);
      if (!mensagem || mensagem.length < 2) {
        return res.status(400).json({ erro: "Escreva uma pergunta para a Flora." });
      }
      const historicoIn = Array.isArray(req.body?.historico) ? req.body.historico.slice(-8) : [];
      const historico = historicoIn
        .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .map((m) => ({ role: m.role, content: clean(m.content, 800) }));

      const plantas = await buscarPlantasRelevantes(mensagem);
      const ctx = formatPlantasCtx(plantas);
      const system = floraSystemPrompt(ctx);
      const messages = [...historico, { role: "user", content: mensagem }];

      let resposta = await chamarGroq(system, messages);
      if (!resposta) resposta = await chamarGemini(system, messages);
      if (!resposta) resposta = floraOfflineReply(mensagem, plantas);

      res.json({
        resposta,
        plantas: plantas.map((p) => ({ id: p.id, nome: p.nome })),
        modo: process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY ? "ia" : "catalogo"
      });
    } catch (err) {
      console.error("[Flora]", err);
      res.status(500).json({ erro: "A Flora tropeçou. Tente de novo." });
    }
  });
};
