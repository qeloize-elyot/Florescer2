/**
 * Flora — assistente de cultivo (respostas diretas + catálogo)
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

  const DICAS_EXTRA = {
    "Costela-de-adão": "Gosta de tutor com musgo. Folhas sem furos = luz fraca ou planta jovem. Ponta marrom = ar seco ou sol forte.",
    "Espada-de-são-jorge": "Regue pouco. Rizoma apodrece com excesso de água. Tóxica se mastigada.",
    "Samambaia-americana": "Nunca deixe o substrato secar por completo. Banheiro com janela é ideal. Pontas secas = ar seco.",
    "Jiboia-verde": "Pode viver em água ou vaso. Amarela por excesso de água. Tóxica para pets.",
    "Zamioculca": "Menos água é melhor. Folha amarela quase sempre é excesso de rega.",
    "Lírio-da-paz": "Folhas caídas pedem água. Não encharque. Tóxica para pets.",
    "Suculenta Echeveria": "Sol da manhã. Regue só com substrato seco. Evite água nas rosetas.",
    "Ficus Lyrata": "Odeia mudança de lugar e excesso de água. Luz forte indireta.",
    "Manjericão": "Sol e rega regular. Colha as pontas para ramificar.",
    "Peperômia-melancia": "Luz indireta. Folha enrugada = sede; mole/amarela = excesso de água.",
    "Antúrio Vermelho": "Luz indireta e umidade. Não molhe o centro da planta.",
    "Cacto Mandacaru": "Muito sol e pouca água. Nunca encharcar.",
    "Maranta-tricolor": "Luz indireta, umidade alta. Folhas se fecham à noite (normal).",
    "Lavanda": "Sol pleno e solo seco entre regas.",
    "Pilea Chinesa": "Luz indireta. Gire o vaso para crescer redonda.",
    "Orquídea Phalaenopsis": "Regue quando raízes prateadas; se verdes, espere. Sem água no cachepô.",
    "Alocásia Orelha-de-elefante": "Umidade e luz indireta. Tóxica para pets.",
    "Rosa-do-deserto": "Sol forte e pouca água. Cuidado com o látex.",
    "Jiboia-prateada": "Como a jiboia-verde: fácil, luz indireta, rega semanal. Tóxica para pets.",
    "Calathea Orbifolia": "Umidade alta, luz filtrada. Preferir água filtrada.",
    "Begônia-maculata": "Luz indireta. Evite molhar as folhas.",
    "Colar-de-pérolas": "Luz forte e rega espaçada. Pérolas murchas = sede; translúcidas = excesso de água.",
    "Hortelã-pimenta": "Terra levemente úmida. Melhor em vaso (cresce muito).",
    "Flor-de-maio": "Luz indireta. Após florir, reduza um pouco a água.",
    "Guaimbê": "Luz indireta forte, rega regular. Tóxica se ingerida.",
    "Flor-de-cera": "Deixe secar entre regas. Floresce melhor um pouco apertada no vaso.",
    "Espada-de-santa-bárbara": "Pouca água, luz flexível, tóxica para pets.",
    "Lança-de-são-jorge": "Rega rara, muito resistente, tóxica se mastigada.",
    "Alecrim": "Sol pleno e solo drenado. Não encharcar.",
    "Orelha-de-coelho": "Muita luz e pouca água. Folhas moles = sede; transparentes = excesso de água."
  };

  function floraSystemPrompt(plantasCtx) {
    return `Você é a Flora, assistente de cultivo do Florescer.
Fale em português do Brasil, natural e direta.

REGRA DE OURO: responda SOMENTE o que a pessoa perguntou. Não despeje ficha completa (luz, água, porte, dificuldade) a menos que ela peça "me fala tudo sobre" ou cuidados gerais.

Exemplos:
- Folha amarela → causas e o que fazer. Sem listar porte.
- Pode ter com gato? → só toxicidade/pet.
- Como regar a jiboia? → só rega.

Use o catálogo abaixo como referência interna.
Nunca diga que planta tóxica é segura para pets.
Pragas leves: isolamento, sabão neutro, óleo de neem.
Ingestão por pet: oriente veterinário.
Respostas curtas (40–100 palavras). Uma pergunta útil no máximo, se precisar.

Referência interna do catálogo:
${plantasCtx || "(nenhuma planta específica)"}`;
  }

  function detectarSintomas(msg) {
    const m = (msg || "").toLowerCase();
    const hits = [];
    if (/amarel|amarelo|amarela/.test(m)) hits.push("amarela");
    if (/ponta|marrom|seca|queimad|crocant/.test(m)) hits.push("ponta");
    if (/caindo|queda|caiu|drop/.test(m)) hits.push("queda");
    if (/mole|murch|ca[ií]da|sem for[cç]a|murcho/.test(m)) hits.push("mole");
    if (/praga|bicho|cochonilha|pulg[aã]o|ácaro|acaro|fungo|mofo/.test(m)) hits.push("praga");
    if (/regar|rega|água|agua|encharc|molhad/.test(m)) hits.push("rega");
    if (/luz|sol|sombra|escuro|janela/.test(m)) hits.push("luz");
    if (/replant|vaso|substrato|terra/.test(m)) hits.push("replante");
    return hits;
  }

  function floraOfflineReply(mensagem, plantas) {
    const msg = (mensagem || "").toLowerCase();
    const sintomas = detectarSintomas(msg);
    const p = plantas[0] || null;
    const extra = p && DICAS_EXTRA[p.nome] ? DICAS_EXTRA[p.nome] : "";
    const querTudo = /tudo sobre|cuidados gerais|me fala d[ea]|ficha|informações completas|informacoes completas/.test(msg);

    if (querTudo && p) {
      const pet = p.petFriendly ? "É pet friendly no catálogo." : "Não é pet friendly — tóxica se mastigada.";
      return `${p.nome}: luz ${p.luz}; água ${p.agua}; umidade ${p.umidade}; ${pet} ${extra}`.trim();
    }

    if (/pet|gato|cachorro|cão|cao|dog|cat/.test(msg) && !sintomas.length) {
      if (!p) return "Me diga o nome da planta que eu confiro se é segura para pets.";
      return p.petFriendly
        ? `A ${p.nome} é pet friendly no nosso catálogo. Mesmo assim, evite que o animal coma em quantidade.`
        : `A ${p.nome} NÃO é pet friendly — pode fazer mal se o pet mastigar. Melhor longe do alcance.`;
    }

    if (sintomas.includes("amarela")) {
      if (p && /zamioculca|espada|sansevier|cacto|suculenta|echeveria|colar|orelha|rosa-do-deserto/.test((p.nome || "").toLowerCase())) {
        return `Na ${p.nome}, folha amarela quase sempre é excesso de água. Pare de regar até secar uns 3 cm, esvazie o prato e confira se o vaso tem furo.`;
      }
      if (p && /samambaia|calathea|maranta|lírio|lirio/.test((p.nome || "").toLowerCase())) {
        return `Na ${p.nome}, amarelo pode ser rega irregular ou ar seco. Terra encharcada = segure a água; terra seca demais = regue e aumente um pouco a umidade.`;
      }
      if (p) {
        return `Folha amarela na ${p.nome} costuma ser excesso de água, pouca luz ou folha velha de baixo. Teste do dedo (2–3 cm): se ainda úmido, não regue.`;
      }
      return "Folha amarela em geral é excesso de água, pouca luz ou troca natural das folhas de baixo. Qual o nome da planta?";
    }

    if (sintomas.includes("ponta")) {
      if (p) {
        return `Ponta seca na ${p.nome} costuma ser ar seco, ar-condicionado ou sol direto demais. Afaste de vento forte; se ela gosta de umidade, borrife as folhas.`;
      }
      return "Ponta marrom/seca quase sempre é ar seco ou sol forte demais. Qual o nome da planta?";
    }

    if (sintomas.includes("mole") || sintomas.includes("queda")) {
      if (p) {
        return `Folha mole ou caindo na ${p.nome}: pode ser sede ou raiz apodrecendo. Substrato seco = regue; molhado = pare a rega e confira drenagem.`;
      }
      return "Folha mole pode ser sede ou excesso de água. O substrato está seco ou encharcado? Qual a planta?";
    }

    if (sintomas.includes("praga")) {
      return "Isole a planta, limpe as folhas com pano úmido e sabão neutro diluído. Em caso leve, óleo de neem (conforme o rótulo). Evite veneno forte com pets em casa.";
    }

    if (sintomas.includes("rega")) {
      if (p) return `Para regar a ${p.nome}: ${p.agua}. Use o teste do dedo — não regue no automático. Esvazie o prato depois.`;
      return "Regue quando os 2–3 cm de cima estiverem secos (mais fundo em suculenta/cacto). Qual planta?";
    }

    if (sintomas.includes("luz")) {
      if (p) return `A ${p.nome} pede: ${p.luz}. Evite mudar ela de canto toda semana.`;
      return "Me diga o nome da planta que eu te falo a luz ideal.";
    }

    if (sintomas.includes("replante")) {
      return "Replante quando a raiz sair pelo fundo ou a terra secar em poucas horas. Suba só um pouco o vaso.";
    }

    if (p) {
      if (extra) return `Sobre a ${p.nome}: ${extra} O que você quer saber — rega, luz, folha amarela, pontas ou pets?`;
      return `Vi que você falou da ${p.nome}. O que está acontecendo — amarela, ponta seca, rega, luz ou pet?`;
    }

    return "Me conta o nome da planta e o que está rolando (amarela, ponta seca, rega, pet…). Eu respondo só isso.";
  }

  async function buscarPlantasRelevantes(mensagem) {
    const raw = String(mensagem || "").toLowerCase().slice(0, 200);
    const tokens = raw.split(/[^a-záàâãéêíóôõúç0-9]+/i).filter((t) => t.length >= 3);
    let all = [];
    try {
      const { rows } = await db.query(`SELECT * FROM plantas WHERE ativo = 1 ORDER BY id ASC LIMIT 80`);
      all = rows.map(mapPlanta);
    } catch (e) {
      console.warn("[Flora] busca DB falhou", e.message);
      all = [];
    }
    if (!all.length) return [];
    if (!tokens.length) return all.slice(0, 3);

    const scored = all
      .map((p) => {
        const blob = `${p.nome} ${p.cientifico} ${p.categoria} ${p.resumo} ${p.historia} ${p.luz} ${p.agua}`.toLowerCase();
        let score = 0;
        tokens.forEach((t) => {
          if (blob.includes(t)) score += t.length >= 5 ? 3 : 1;
        });
        const nome = (p.nome || "").toLowerCase();
        if (raw.includes(nome)) score += 12;
        if (/monstera|costela/.test(raw) && /costela|monstera/.test(nome)) score += 10;
        if (/jiboia|jibóia|pothos|epipremnum/.test(raw) && /jiboia|epipremnum/.test(nome + (p.cientifico || "").toLowerCase())) score += 10;
        if (/zamioculca|zz/.test(raw) && /zamioculca/.test(nome)) score += 10;
        if (/samambaia/.test(raw) && /samambaia/.test(nome)) score += 10;
        if (/espada|sansevier|são-jorge|sao-jorge/.test(raw) && /espada|lança|santa-bárbara/.test(nome)) score += 8;
        return { p, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, 4).map((x) => x.p);
  }

  function formatPlantasCtx(plantas) {
    return plantas
      .map((p) => {
        const extra = DICAS_EXTRA[p.nome] || "";
        return `- ${p.nome} (${p.cientifico}): luz ${p.luz}, água ${p.agua}, umidade ${p.umidade}, petFriendly ${p.petFriendly ? "sim" : "não"}. ${p.resumo || ""} ${extra}`;
      })
      .join("\n");
  }

  function groqKey() {
    return (
      process.env.GROQ_API_KEY ||
      process.env.GROQ_KEY ||
      process.env.groq_api_key ||
      ""
    ).trim();
  }

  async function chamarGroq(system, messages) {
    const key = groqKey();
    if (!key) {
      console.warn("[Flora/Groq] sem chave (GROQ_API_KEY vazia no ambiente)");
      return null;
    }

    const models = [
      process.env.FLORA_MODEL,
      "llama-3.1-8b-instant",
      "llama-3.3-70b-versatile",
      "openai/gpt-oss-20b",
      "qwen/qwen3-32b",
      "groq/compound-mini"
    ].filter(Boolean);
    const seen = new Set();
    const list = models.filter((m) => (seen.has(m) ? false : (seen.add(m), true)));

    for (const model of list) {
      try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + key
          },
          body: JSON.stringify({
            model,
            temperature: 0.5,
            max_tokens: 350,
            messages: [{ role: "system", content: system }, ...messages]
          })
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          console.warn("[Flora/Groq]", model, res.status, errText.slice(0, 180));
          continue;
        }
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text) {
          console.log("[Flora/Groq] ok com modelo", model);
          return text;
        }
      } catch (e) {
        console.warn("[Flora/Groq]", model, e.message);
      }
    }
    return null;
  }

  async function chamarGemini(system, messages) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return null;
    try {
      const contents = messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }]
      }));
      contents.unshift({ role: "user", parts: [{ text: system }] });
      contents.splice(1, 0, {
        role: "model",
        parts: [{ text: "Entendido. Respondo só o que foi perguntado, com base no catálogo Florescer." }]
      });
      const url =
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" +
        encodeURIComponent(key);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          generationConfig: { temperature: 0.5, maxOutputTokens: 350 }
        })
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.warn("[Flora/Gemini]", res.status, errText.slice(0, 200));
        return null;
      }
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
    } catch (e) {
      console.warn("[Flora/Gemini]", e.message);
      return null;
    }
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

      let modo = "catalogo";
      let resposta = await chamarGroq(system, messages);
      if (resposta) modo = "ia";
      if (!resposta) {
        resposta = await chamarGemini(system, messages);
        if (resposta) modo = "ia";
      }
      if (!resposta) resposta = floraOfflineReply(mensagem, plantas);

      res.json({
        resposta,
        plantas: plantas.map((p) => ({ id: p.id, nome: p.nome })),
        modo
      });
    } catch (err) {
      console.error("[Flora]", err);
      res.status(500).json({ erro: "A Flora tropeçou. Tente de novo." });
    }
  });
};
