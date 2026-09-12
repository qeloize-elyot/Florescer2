/**
 * Flora — rotas da assistente de cultivo (versão com conhecimento de cuidados)
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

  /** Dicas extras de cultivo por planta do catálogo */
  const DICAS_EXTRA = {
  "Costela-de-adão": "Gosta de tutor/mastro com musgo. Folhas sem furos = luz fraca ou planta jovem. Ponta marrom = ar seco ou excesso de sol.",
  "Espada-de-são-jorge": "Regue pouco. Rizomas apodrecem com água em excesso. Tolera esquecimento. Mantenha longe de pets (tóxica se mastigada).",
  "Samambaia-americana": "Nunca deixe o substrato secar por completo. Banheiro com janela é ideal. Pontas secas = ar seco; borrife as folhas.",
  "Jiboia-verde": "Pode viver em água ou vaso. Amarela por excesso de água. Tóxica para pets. Pode podar e replantar as mudas.",
  "Zamioculca": "Menos água ainda é melhor. Folhas amarelas quase sempre são excesso de rega. Luz baixa ok.",
  "Lírio-da-paz": "Avise quando quer água: folhas caídas. Não deixe encharcado. Flor branca some com pouca luz. Tóxica para pets.",
  "Suculenta Echeveria": "Sol da manhã. Regue só quando o substrato estiver seco. Evite água nas rosetas. Pouca umidade.",
  "Ficus Lyrata": "Odeia mudança de lugar e excesso de água. Folhas caem com estresse. Limpe as folhas e dê luz forte indireta.",
  "Manjericão": "Sol e rega regular. Colha as pontas para ramificar. Não gosta de frio. Bom em vaso na cozinha.",
  "Peperômia-melancia": "Luz indireta. Rega moderada. Folhas enrugadas = sede; moles/amarelas = excesso de água.",
  "Antúrio Vermelho": "Luz indireta e umidade. Não molhe o centro da planta. Flores desbotam com pouca luz.",
  "Cacto Mandacaru": "Muito sol e quase nenhuma água no inverno. Substrato bem drenado. Nunca encharcar.",
  "Maranta-tricolor": "Luz indireta, umidade alta. Folhas se fecham à noite (normal). Pontas secas = ar seco.",
  "Lavanda": "Sol pleno e solo seco entre regas. Não tolera encharcamento. Pode as flores secas.",
  "Pilea Chinesa": "Luz indireta. Gira o vaso para crescer redonda. Filhotes nas laterais podem ser separados.",
  "Orquídea Phalaenopsis": "Luz filtrada. Regue quando as raízes prateadas; se verdes, espere. Nunca deixe água no cachepô.",
  "Alocásia Orelha-de-elefante": "Umidade e luz indireta. Pode hibernar no frio (sumir e voltar). Tóxica para pets.",
  "Rosa-do-deserto": "Sol forte e pouca água. Cuidado com o látex. No inverno regue bem menos.",
  "Jiboia-prateada": "Como a jiboia-verde: fácil, luz indireta, rega semanal. Tóxica para pets.",
  "Calathea Orbifolia": "Umidade alta, luz filtrada. Água filtrada se possível (sensível a cloro). Folhas se fecham à noite.",
  "Begônia-maculata": "Luz indireta, rega quando a superfície secar. Evite molhar as folhas. Pontas secas = ar seco.",
  "Colar-de-pérolas": "Luz forte e rega espaçada. Pendente. Pérolas murchas = sede; translúcidas/estourando = excesso de água.",
  "Hortelã-pimenta": "Sol ou meia-sombra, terra sempre levemente úmida. Cresce invasiva — melhor em vaso.",
  "Flor-de-maio": "Luz indireta. Rega moderada. Florada no outono/inverno. Após florir, reduza um pouco a água.",
  "Guaimbê": "Luz indireta forte, rega regular. Parecida com costela-de-adão em cuidados. Tóxica se ingerida.",
  "Flor-de-cera": "Luz indireta a sol suave. Deixe secar entre regas. Floresce melhor um pouco 'apertada' no vaso.",
  "Espada-de-santa-bárbara": "Como a espada-de-são-jorge: pouca água, luz flexível, tóxica para pets.",
  "Lança-de-são-jorge": "Mesmo grupo das sansevierias: rega rara, muito resistente, tóxica se mastigada.",
  "Alecrim": "Sol pleno e solo drenado. Não encharcar. Pode as pontas para ficar denso. Aroma forte.",
  "Orelha-de-coelho": "Suculenta: muita luz e pouca água. Folhas moles = sede; amarelas/transparentes = excesso de água."
};

  /** Guia geral de sintomas (conhecimento de cultivo, não só ficha de produto) */
  const GUIA_SINTOMAS = {
    amarela: {
      titulo: "Folhas amarelas",
      texto:
        "Folha amarela costuma vir de: (1) excesso de água / raiz sem oxigênio, (2) falta de luz, (3) falta de nutriente depois de muito tempo no mesmo vaso, ou (4) envelhecimento natural das folhas de baixo. " +
        "Regra prática: enfie o dedo 2–3 cm no substrato. Se ainda estiver úmido, NÃO regue. Tire água parada do prato. Se as folhas de baixo amarelam uma a uma e o resto está bem, pode ser só troca natural."
    },
    ponta: {
      titulo: "Pontas secas ou marrons",
      texto:
        "Ponta seca quase sempre é ar seco, vento de ar-condicionado/ventilador, ou pouca umidade. Borrife as folhas (se a espécie gostar de umidade), afaste de ar-condicionado e, se possível, use um prato com pedras e água sob o vaso (sem o fundo do vaso tocar a água). Sol direto forte também queima a ponta."
    },
    queda: {
      titulo: "Queda de folhas",
      texto:
        "Queda de folhas aparece com mudança brusca de lugar, excesso de água, frio ou choque de luminosidade. Evite trocar a planta de canto toda semana. Confira se o substrato não está encharcado."
    },
    mole: {
      titulo: "Folhas moles / murchas",
      texto:
        "Folha mole pode ser sede OU raiz apodrecendo por excesso de água (parecem iguais). Toque o substrato: seco = regue devagar; molhado e fedendo = pare de regar, melhore a drenagem e, se gravíssimo, troque o substrato."
    },
    praga: {
      titulo: "Pragas",
      texto:
        "Cochonilha, pulgão e ácaro são os mais comuns em casa. Isole a planta. Limpe folhas com pano úmido e sabão neutro diluído. Em casos leves, óleo de neem (seguindo o rótulo) ajuda. Evite remédios fortes em ambiente fechado com pets/crianças."
    },
    rega: {
      titulo: "Como regar certo",
      texto:
        "Não regue no 'calendário cego'. Use o teste do dedo: 2–3 cm secos na superfície (ou mais fundo em suculentas/cactos) antes de regar de novo. Regue até sair um pouco pelo fundo e esvazie o prato depois de 10–15 minutos. Vaso sem furo aumenta muito o risco de apodrecer a raiz."
    },
    luz: {
      titulo: "Luz",
      texto:
        "Luz indireta forte = perto de janela clara, sem sol batendo direto nas folhas ao meio-dia. Meia-sombra = um pouco mais longe da janela. Sol pleno = sol de verdade várias horas (suculentas, cactos, lavanda, alecrim)."
    },
    replante: {
      titulo: "Quando replantar",
      texto:
        "Replante quando a raiz sair pelos furos, a planta tombar, ou a terra secar em poucas horas. Suba só 2–4 cm no diâmetro do vaso. Use substrato adequado (suculenta/cacto ≠ planta tropical)."
    }
  };

  function floraSystemPrompt(plantasCtx) {
    return `Você é a Flora, assistente de cultivo do viveiro digital Florescer.
Fale em português do Brasil, acolhedora, clara e prática — como uma amiga que entende de plantas.
Seu papel NÃO é só repetir a ficha do produto. Você ENSINA: explica o porquê, dá passo a passo e ajuda a diagnosticar sintomas (folha amarela, ponta seca, queda, praga, rega, luz).

Regras:
- Use o catálogo abaixo como referência principal das espécies da loja (luz, água, pet, porte).
- Complete com conhecimento geral seguro de cultivo doméstico.
- Se souber a planta, personalize a dica (ex.: zamioculca e excesso de água; samambaia e umidade).
- Se não souber a planta, dê orientação geral e peça o nome.
- Nunca invente que uma planta tóxica é segura para pets.
- Não receite veneno agrícola forte; prefira isolamento, limpeza e óleo de neem em casos leves.
- Em ingestão por pet/criança: oriente procurar veterinário/ajuda e não minimize.
- Respostas médias (cerca de 80–160 palavras), humanas, sem parecer manual robótico.
- Termine com uma pergunta útil quando fizer sentido (ex.: "O substrato está úmido ou seco?").

Catálogo Florescer (contexto):
${plantasCtx || "(nenhuma planta específica — oriente em geral e peça o nome)"}`;
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
    const partes = [];

    if (plantas.length) {
      const p = plantas[0];
      const pet = p.petFriendly
        ? "No catálogo Florescer ela é pet friendly."
        : "Atenção: no catálogo ela NÃO é pet friendly — mantenha longe de mastigação de gatos/cães.";
      const extra = DICAS_EXTRA[p.nome] || "";
      partes.push(
        `Sobre a ${p.nome} (${p.cientifico || "espécie do catálogo"}): luz — ${p.luz}; água — ${p.agua}; umidade — ${p.umidade}; dificuldade — ${p.dificuldade}. ${pet}`
      );
      if (extra) partes.push(extra);
    }

    if (sintomas.length) {
      sintomas.slice(0, 2).forEach((s) => {
        const g = GUIA_SINTOMAS[s];
        if (g) partes.push(`${g.titulo}: ${g.texto}`);
      });
    }

    if (plantas.length && sintomas.includes("amarela")) {
      const nome = (plantas[0].nome || "").toLowerCase();
      if (/zamioculca|espada|sansevier|cacto|suculenta|echeveria|colar|orelha|rosa-do-deserto/.test(nome)) {
        partes.push("Nessa espécie, folha amarela quase sempre grita excesso de água. Segure a rega e confira a drenagem.");
      }
      if (/samambaia|calathea|maranta|lírio|lirio/.test(nome)) {
        partes.push("Nessa espécie, além da rega, confira umidade do ar e se o substrato não seca demais entre uma rega e outra.");
      }
    }

    if (/pet|gato|cachorro|cão|cao|dog|cat/.test(msg)) {
      if (plantas.length) {
        partes.push(
          plantas[0].petFriendly
            ? "Para pets: ainda assim evite que o animal coma em quantidade — qualquer planta pode incomodar o estômago."
            : "Para pets: melhor trocar por opção pet friendly do catálogo (ex.: samambaia-americana, se for o caso) ou deixar bem fora de alcance."
        );
      } else {
        partes.push("Me diga o nome da planta que eu confiro no catálogo se ela é pet friendly.");
      }
    }

    if (!partes.length) {
      return (
        "Posso te ajudar de verdade com cultivo: folha amarela, ponta seca, rega, luz, pragas e se a planta é segura para pets. " +
        "Qual o nome da planta (do catálogo Florescer, se tiver) e o que está acontecendo com ela?"
      );
    }

    if (!plantas.length && sintomas.length) {
      partes.push("Se você me disser o nome da planta, eu afino a dica para a espécie certinha do nosso catálogo.");
    } else if (plantas.length && !sintomas.length) {
      partes.push("O que você quer ajustar nela: rega, luz, folhas amarelas, pontas secas ou segurança para pets?");
    }

    return partes.join(" ");
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

    const top = scored.slice(0, 4).map((x) => x.p);
    return top.length ? top : [];
  }

  function formatPlantasCtx(plantas) {
    return plantas
      .map((p) => {
        const extra = DICAS_EXTRA[p.nome] || "";
        return (
          `- ${p.nome} (${p.cientifico}): categoria ${p.categoria}, ambiente ${p.ambiente}, luz ${p.luz}, água ${p.agua}, umidade ${p.umidade}, porte ${p.porte}, dificuldade ${p.dificuldade}, petFriendly ${p.petFriendly ? "sim" : "não"}. Resumo: ${p.resumo || ""}. Dica extra: ${extra}`
        );
      })
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
        temperature: 0.55,
        max_tokens: 550,
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
      parts: [{ text: "Entendido. Sou a Flora e vou ensinar cultivo com base no catálogo Florescer e boas práticas." }]
    });

    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" +
      encodeURIComponent(key);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        generationConfig: { temperature: 0.55, maxOutputTokens: 550 }
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
