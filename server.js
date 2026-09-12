/**
 * Florescer API — Express + Postgres (Supabase)
 * Versão migrada do SQLite (better-sqlite3) para pg
 * Porta padrão: 3001
 */
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const { db, transaction } = require("./db");

// Dependências de segurança (opcionais no require para não quebrar se npm install falhar)
let helmet, rateLimit;
try { helmet = require("helmet"); } catch (_) { helmet = null; }
try { rateLimit = require("express-rate-limit"); } catch (_) { rateLimit = null; }

const app = express();
const PORT = process.env.PORT || 3001;

// JWT Secret: usa variável de ambiente, senão gera um temporário (só para não quebrar)
const JWT_SECRET = process.env.JWT_SECRET || ("dev-" + crypto.randomBytes(24).toString("hex"));
if (!process.env.JWT_SECRET) {
  console.warn("[AVISO] JWT_SECRET não definido. Defina no Render (Environment) para produção.");
}

/* ---------- Segurança básica ---------- */
app.set("trust proxy", 1);
app.disable("x-powered-by");

if (helmet) {
  app.use(helmet({
    contentSecurityPolicy: false, // evita quebrar o front
    crossOriginEmbedderPolicy: false
  }));
}

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json({ limit: "200kb" }));

// Rate limit só nas rotas de login/register
const authLimiter = rateLimit
  ? rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 30,
      standardHeaders: true,
      legacyHeaders: false,
      message: { erro: "Muitas tentativas. Aguarde alguns minutos." }
    })
  : (req, res, next) => next();

// Frontend estático
const frontendDir = fs.existsSync(path.join(__dirname, "index.html"))
  ? __dirname
  : path.join(__dirname, "..", "frontend");
app.use(express.static(frontendDir));

/* ---------- Helpers ---------- */
function uid() {
  return crypto.randomBytes(5).toString("hex");
}

async function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ erro: "Não autenticado" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const { rows } = await db.query("SELECT * FROM usuarios WHERE id = $1", [payload.id]);
    const user = rows[0];
    if (!user) return res.status(401).json({ erro: "Usuário inválido" });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ erro: "Token inválido ou expirado" });
  }
}

async function optionalAuth(req, _res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const { rows } = await db.query("SELECT * FROM usuarios WHERE id = $1", [payload.id]);
      req.user = rows[0] || null;
    } catch {
      req.user = null;
    }
  }
  next();
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    nome: u.nome,
    email: u.email,
    brotos: u.brotos,
    criadoEm: u.criado_em,
    endereco: {
      cep: u.cep || "",
      rua: u.rua || "",
      bairro: u.bairro || "",
      cidade: u.cidade || "",
      complemento: u.complemento || ""
    }
  };
}

function clean(str, max = 200) {
  if (typeof str !== "string") return "";
  return str.trim().slice(0, max);
}

/* ---------- Auth ---------- */
app.post("/api/auth/register", authLimiter, async (req, res, next) => {
  try {
    const nome = clean(req.body?.nome, 80);
    const email = clean(req.body?.email, 120).toLowerCase();
    const senha = req.body?.senha || "";

    if (!nome || nome.length < 3) return res.status(400).json({ erro: "Informe o nome completo." });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ erro: "E-mail inválido." });
    if (!senha || senha.length < 6) return res.status(400).json({ erro: "Senha mínima de 6 caracteres." });
    if (senha.length > 72) return res.status(400).json({ erro: "Senha muito longa." });

    const { rows: existsRows } = await db.query("SELECT id FROM usuarios WHERE email = $1", [email]);
    if (existsRows[0]) return res.status(409).json({ erro: "Já existe conta com este e-mail." });

    const hash = bcrypt.hashSync(senha, 12);
    const { rows: insertRows } = await db.query(
      "INSERT INTO usuarios (nome, email, senha_hash, brotos) VALUES ($1, $2, $3, 100) RETURNING id",
      [nome, email, hash]
    );

    const { rows: userRows } = await db.query("SELECT * FROM usuarios WHERE id = $1", [insertRows[0].id]);
    const user = userRows[0];
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, usuario: publicUser(user) });
  } catch (err) { next(err); }
});

app.post("/api/auth/login", authLimiter, async (req, res, next) => {
  try {
    const email = clean(req.body?.email, 120).toLowerCase();
    const senha = req.body?.senha || "";

    const { rows } = await db.query("SELECT * FROM usuarios WHERE email = $1", [email]);
    const user = rows[0];
    if (!user || !bcrypt.compareSync(senha, user.senha_hash)) {
      return res.status(401).json({ erro: "E-mail ou senha incorretos." });
    }

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, usuario: publicUser(user) });
  } catch (err) { next(err); }
});

app.get("/api/me", auth, (req, res) => {
  res.json({ usuario: publicUser(req.user) });
});

/* ---------- Catálogo ---------- */
app.get("/api/plantas", async (req, res, next) => {
  try {
    const { busca, categoria, ambiente, luz, pet, ordem } = req.query;
    let sql = "SELECT * FROM plantas WHERE ativo = 1";
    const params = [];
    let i = 0;
    const ph = () => { i += 1; return `$${i}`; };

    if (busca && typeof busca === "string") {
      const t = `%${busca.toLowerCase().slice(0, 80)}%`;
      sql += ` AND (lower(nome) LIKE ${ph()} OR lower(cientifico) LIKE ${ph()} OR lower(categoria) LIKE ${ph()})`;
      params.push(t, t, t);
    }
    if (categoria) { sql += ` AND categoria = ${ph()}`; params.push(String(categoria).slice(0, 50)); }
    if (ambiente) { sql += ` AND ambiente = ${ph()}`; params.push(String(ambiente).slice(0, 50)); }
    if (pet === "1" || pet === "true") { sql += " AND pet_friendly = 1"; }
    if (luz) {
      if (luz === "sol") sql += " AND (lower(luz) LIKE '%sol direto%' OR lower(luz) LIKE '%sol pleno%')";
      else if (luz === "indireta") sql += " AND lower(luz) LIKE '%indireta%'";
      else if (luz === "sombra") sql += " AND lower(luz) LIKE '%sombra%'";
    }

    // Postgres não tem COLLATE NOCASE do SQLite: usamos lower() para ordenar sem diferenciar maiúsc/minúsc.
    if (ordem === "menor") sql += " ORDER BY preco ASC";
    else if (ordem === "maior") sql += " ORDER BY preco DESC";
    else if (ordem === "nome") sql += " ORDER BY lower(nome) ASC";
    else sql += " ORDER BY id ASC";

    const { rows } = await db.query(sql, params);
    res.json(rows.map(mapPlanta));
  } catch (err) { next(err); }
});

app.get("/api/plantas/:id", async (req, res, next) => {
  try {
    const { rows } = await db.query("SELECT * FROM plantas WHERE id = $1", [String(req.params.id).slice(0, 20)]);
    const p = rows[0];
    if (!p) return res.status(404).json({ erro: "Planta não encontrada" });
    res.json(mapPlanta(p));
  } catch (err) { next(err); }
});

function mapPlanta(p) {
  return {
    id: p.id,
    nome: p.nome,
    cientifico: p.cientifico,
    emoji: p.emoji,
    imagem: p.imagem || null,
    preco: p.preco,
    categoria: p.categoria,
    ambiente: p.ambiente,
    luz: p.luz,
    agua: p.agua,
    umidade: p.umidade,
    porte: p.porte,
    dificuldade: p.dificuldade,
    petFriendly: !!p.pet_friendly,
    resumo: p.resumo,
    historia: p.historia
  };
}

/* ---------- Cursos ---------- */
app.get("/api/cursos", optionalAuth, async (req, res, next) => {
  try {
    const { rows: cursos } = await db.query("SELECT * FROM cursos ORDER BY id");

    const out = [];
    for (const c of cursos) {
      const { rows: aulasRows } = await db.query(
        "SELECT titulo, ordem FROM curso_aulas WHERE curso_id = $1 ORDER BY ordem",
        [c.id]
      );
      const aulas = aulasRows.map((a) => a.titulo);

      let progresso = { aulas: [], concluido: false, codigo: null, dataConclusao: null };
      if (req.user) {
        const { rows: progRows } = await db.query(
          "SELECT * FROM usuario_cursos WHERE usuario_id = $1 AND curso_id = $2",
          [req.user.id, c.id]
        );
        const reg = progRows[0];
        if (reg) {
          progresso = {
            aulas: JSON.parse(reg.aulas_feitas || "[]"),
            concluido: !!reg.concluido,
            codigo: reg.codigo,
            dataConclusao: reg.data_conclusao
          };
        }
      }

      out.push({
        id: c.id,
        titulo: c.titulo,
        nivel: c.nivel,
        duracao: c.duracao,
        emoji: c.emoji,
        imagem: c.imagem || null,
        descricao: c.descricao,
        link: c.link,
        brotos: c.brotos,
        aulas,
        progresso
      });
    }
    res.json(out);
  } catch (err) { next(err); }
});

app.post("/api/cursos/:id/aulas", auth, async (req, res, next) => {
  try {
    const { rows: cursoRows } = await db.query("SELECT * FROM cursos WHERE id = $1", [String(req.params.id).slice(0, 20)]);
    const curso = cursoRows[0];
    if (!curso) return res.status(404).json({ erro: "Curso não encontrado" });

    const { indice, marcado } = req.body || {};
    const { rows: regRows } = await db.query(
      "SELECT * FROM usuario_cursos WHERE usuario_id = $1 AND curso_id = $2",
      [req.user.id, curso.id]
    );
    let reg = regRows[0];

    if (!reg) {
      await db.query(
        "INSERT INTO usuario_cursos (usuario_id, curso_id, aulas_feitas) VALUES ($1, $2, '[]')",
        [req.user.id, curso.id]
      );
      reg = { aulas_feitas: "[]" };
    }

    const set = new Set(JSON.parse(reg.aulas_feitas || "[]"));
    if (marcado) set.add(Number(indice));
    else set.delete(Number(indice));
    const aulas = [...set].sort((a, b) => a - b);

    await db.query(
      "UPDATE usuario_cursos SET aulas_feitas = $1 WHERE usuario_id = $2 AND curso_id = $3",
      [JSON.stringify(aulas), req.user.id, curso.id]
    );

    res.json({ aulas });
  } catch (err) { next(err); }
});

app.post("/api/cursos/:id/concluir", auth, async (req, res, next) => {
  try {
    const { rows: cursoRows } = await db.query("SELECT * FROM cursos WHERE id = $1", [String(req.params.id).slice(0, 20)]);
    const curso = cursoRows[0];
    if (!curso) return res.status(404).json({ erro: "Curso não encontrado" });

    const { rows: countRows } = await db.query(
      "SELECT COUNT(*) AS n FROM curso_aulas WHERE curso_id = $1",
      [curso.id]
    );
    const totalAulas = Number(countRows[0].n); // COUNT(*) vem como string no pg

    const { rows: regRows } = await db.query(
      "SELECT * FROM usuario_cursos WHERE usuario_id = $1 AND curso_id = $2",
      [req.user.id, curso.id]
    );
    const reg = regRows[0];
    if (!reg) return res.status(400).json({ erro: "Nenhum progresso registrado." });
    const feitas = JSON.parse(reg.aulas_feitas || "[]");
    if (feitas.length < totalAulas) return res.status(400).json({ erro: "Complete todas as aulas." });

    let codigo = reg.codigo;
    let brotosGanhos = 0;
    if (!reg.concluido) {
      codigo = "FL-" + curso.id.toUpperCase() + "-" + uid().toUpperCase();
      await db.query(
        "UPDATE usuario_cursos SET concluido = 1, data_conclusao = NOW(), codigo = $1 WHERE usuario_id = $2 AND curso_id = $3",
        [codigo, req.user.id, curso.id]
      );
      await db.query("UPDATE usuarios SET brotos = brotos + $1 WHERE id = $2", [curso.brotos, req.user.id]);
      brotosGanhos = curso.brotos;
    }

    const { rows: userRows } = await db.query("SELECT * FROM usuarios WHERE id = $1", [req.user.id]);
    const user = userRows[0];
    res.json({
      codigo,
      brotosGanhos,
      brotos: user.brotos,
      dataConclusao: new Date().toISOString(),
      usuario: publicUser(user)
    });
  } catch (err) { next(err); }
});

/* ---------- Recompensas ---------- */
app.get("/api/recompensas", async (req, res, next) => {
  try {
    const { rows } = await db.query("SELECT * FROM recompensas ORDER BY custo ASC");
    res.json(rows.map((r) => ({
      id: r.id, nome: r.nome, desc: r.descricao, custo: r.custo,
      emoji: r.emoji, tipo: r.tipo, valor: r.valor
    })));
  } catch (err) { next(err); }
});

app.get("/api/resgates", auth, async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT rg.*, r.nome, r.emoji, r.descricao, r.tipo, r.valor, r.custo
      FROM resgates rg
      JOIN recompensas r ON r.id = rg.recompensa_id
      WHERE rg.usuario_id = $1
      ORDER BY rg.data DESC
    `, [req.user.id]);
    res.json(rows.map((r) => ({
      id: r.id,
      recompensaId: r.recompensa_id,
      usado: !!r.usado,
      data: r.data,
      recompensa: {
        id: r.recompensa_id, nome: r.nome, emoji: r.emoji,
        desc: r.descricao, tipo: r.tipo, valor: r.valor, custo: r.custo
      }
    })));
  } catch (err) { next(err); }
});

app.post("/api/resgates", auth, async (req, res, next) => {
  try {
    const recompensaId = String(req.body?.recompensaId || "").slice(0, 20);
    const { rows: rRows } = await db.query("SELECT * FROM recompensas WHERE id = $1", [recompensaId]);
    const r = rRows[0];
    if (!r) return res.status(404).json({ erro: "Recompensa não encontrada" });
    if (req.user.brotos < r.custo) return res.status(400).json({ erro: "Brotos insuficientes." });

    const id = uid();
    await transaction(async (client) => {
      await client.query("UPDATE usuarios SET brotos = brotos - $1 WHERE id = $2", [r.custo, req.user.id]);
      await client.query(
        "INSERT INTO resgates (id, usuario_id, recompensa_id, usado) VALUES ($1, $2, $3, 0)",
        [id, req.user.id, r.id]
      );
    });

    const { rows: userRows } = await db.query("SELECT * FROM usuarios WHERE id = $1", [req.user.id]);
    const user = userRows[0];
    res.json({ id, brotos: user.brotos, usuario: publicUser(user) });
  } catch (err) { next(err); }
});

/* ---------- Carrinho ---------- */
app.get("/api/carrinho", auth, async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT c.planta_id AS id, c.quantidade AS qtd, p.nome, p.preco, p.emoji, p.cientifico
      FROM carrinho_itens c
      JOIN plantas p ON p.id = c.planta_id
      WHERE c.usuario_id = $1
    `, [req.user.id]);
    res.json(rows);
  } catch (err) { next(err); }
});

app.put("/api/carrinho", auth, async (req, res, next) => {
  try {
    const itens = Array.isArray(req.body) ? req.body.slice(0, 50) : [];
    await transaction(async (client) => {
      await client.query("DELETE FROM carrinho_itens WHERE usuario_id = $1", [req.user.id]);
      for (const i of itens) {
        const qtd = Math.min(99, Math.max(0, Number(i.qtd) || 0));
        if (qtd > 0 && i.id) {
          await client.query(
            "INSERT INTO carrinho_itens (usuario_id, planta_id, quantidade) VALUES ($1, $2, $3)",
            [req.user.id, String(i.id).slice(0, 20), qtd]
          );
        }
      }
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.post("/api/carrinho/add", auth, async (req, res, next) => {
  try {
    const id = String(req.body?.id || "").slice(0, 20);
    const qtd = Math.min(99, Math.max(1, Number(req.body?.qtd) || 1));
    const { rows: plantaRows } = await db.query("SELECT id FROM plantas WHERE id = $1", [id]);
    if (!plantaRows[0]) return res.status(404).json({ erro: "Planta não encontrada" });

    const { rows: existRows } = await db.query(
      "SELECT * FROM carrinho_itens WHERE usuario_id = $1 AND planta_id = $2",
      [req.user.id, id]
    );
    const exist = existRows[0];

    if (exist) {
      await db.query("UPDATE carrinho_itens SET quantidade = quantidade + $1 WHERE id = $2", [qtd, exist.id]);
    } else {
      await db.query(
        "INSERT INTO carrinho_itens (usuario_id, planta_id, quantidade) VALUES ($1, $2, $3)",
        [req.user.id, id, qtd]
      );
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/* ---------- Pedidos ---------- */
app.post("/api/pedidos", auth, async (req, res, next) => {
  try {
    const body = req.body || {};
    const itens = Array.isArray(body.itens) ? body.itens.slice(0, 50) : [];
    if (!itens.length) return res.status(400).json({ erro: "Carrinho vazio." });

    let subtotal = 0;
    const itensDb = [];
    for (const i of itens) {
      const { rows: pRows } = await db.query(
        "SELECT * FROM plantas WHERE id = $1 AND ativo = 1",
        [String(i.id).slice(0, 20)]
      );
      const p = pRows[0];
      if (!p) return res.status(400).json({ erro: "Planta inválida" });
      const qtd = Math.min(99, Math.max(1, Number(i.qtd) || 1));
      subtotal += p.preco * qtd;
      itensDb.push({ id: p.id, nome: p.nome, qtd, preco: p.preco });
    }

    const recompensasIds = Array.isArray(body.recompensasAplicadas)
      ? body.recompensasAplicadas.slice(0, 10).map((id) => String(id).slice(0, 20))
      : [];
    const { rows: resgatesDisponiveis } = await db.query(
      "SELECT * FROM resgates WHERE usuario_id = $1 AND usado = 0",
      [req.user.id]
    );

    let frete = Math.max(0, Number(body.frete?.valor) || 0);
    let desconto = 0;
    let embalagem = body.presente ? 12.9 : 0;

    for (const rid of recompensasIds) {
      const rg = resgatesDisponiveis.find((x) => x.recompensa_id === rid);
      if (!rg) continue;
      const { rows: rRows } = await db.query("SELECT * FROM recompensas WHERE id = $1", [rid]);
      const r = rRows[0];
      if (!r) continue;
      if (r.tipo === "frete" || r.tipo === "expresso") frete = 0;
      if (r.tipo === "desconto") desconto += r.valor || 0;
      if (r.tipo === "percentual") desconto += subtotal * ((r.valor || 0) / 100);
      if (r.tipo === "brinde" && r.id === "r7") embalagem = 0;
    }

    if (subtotal >= 299 && body.frete?.modalidade === "padrao") frete = 0;
    desconto = Math.min(desconto, subtotal);

    const metodo = ["pix", "cartao", "boleto"].includes(body.pagamento?.metodo)
      ? body.pagamento.metodo
      : "pix";
    const baseAntesPix = subtotal - desconto + frete + embalagem;
    const descontoPix = metodo === "pix" ? baseAntesPix * 0.05 : 0;
    const total = Math.max(0, baseAntesPix - descontoPix);
    const brotosGanhos = Math.floor(total);

    const pedidoId = "FL" + Date.now().toString().slice(-8) + uid().slice(0, 4);
    const end = body.endereco || {};
    const pres = body.presente || null;

    await transaction(async (client) => {
      await client.query(`
        INSERT INTO pedidos (
          id, usuario_id, status, subtotal, frete, desconto, embalagem, desconto_pix, total, brotos_ganhos,
          frete_regiao, frete_prazo_min, frete_prazo_max, frete_modalidade,
          cep, rua, numero, bairro, cidade, complemento,
          pagamento_metodo, pagamento_parcelas,
          presente_para, presente_de, presente_msg, presente_ocultar
        ) VALUES (
          $1, $2, 'Em preparo', $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13,
          $14, $15, $16, $17, $18, $19,
          $20, $21,
          $22, $23, $24, $25
        )
      `, [
        pedidoId, req.user.id, subtotal, frete, desconto, embalagem, descontoPix, total, brotosGanhos,
        clean(body.frete?.regiao, 40) || null,
        body.frete?.prazo?.[0] ?? null,
        body.frete?.prazo?.[1] ?? null,
        clean(body.frete?.modalidade, 20) || null,
        clean(end.cep, 12), clean(end.rua, 120), clean(end.numero, 20),
        clean(end.bairro, 80), clean(end.cidade, 80), clean(end.complemento, 80),
        metodo, Math.min(12, Math.max(1, Number(body.pagamento?.parcelas) || 1)),
        clean(pres?.para, 80) || null,
        clean(pres?.de, 80) || null,
        clean(pres?.mensagem, 300) || null,
        pres?.ocultarValores ? 1 : 0
      ]);

      for (const i of itensDb) {
        await client.query(
          "INSERT INTO pedido_itens (pedido_id, planta_id, nome, quantidade, preco_unitario) VALUES ($1, $2, $3, $4, $5)",
          [pedidoId, i.id, i.nome, i.qtd, i.preco]
        );
      }

      for (const rid of recompensasIds) {
        await client.query(
          "UPDATE resgates SET usado = 1 WHERE usuario_id = $1 AND recompensa_id = $2 AND usado = 0",
          [req.user.id, rid]
        );
      }

      await client.query("UPDATE usuarios SET brotos = brotos + $1 WHERE id = $2", [brotosGanhos, req.user.id]);
      await client.query("DELETE FROM carrinho_itens WHERE usuario_id = $1", [req.user.id]);
    });

    const { rows: userRows } = await db.query("SELECT * FROM usuarios WHERE id = $1", [req.user.id]);
    const user = userRows[0];
    res.json({
      pedido: {
        id: pedidoId,
        total,
        brotosGanhos,
        frete: body.frete,
        status: "Em preparo"
      },
      usuario: publicUser(user)
    });
  } catch (err) { next(err); }
});

app.get("/api/pedidos", auth, async (req, res, next) => {
  try {
    const { rows: pedidos } = await db.query(
      "SELECT * FROM pedidos WHERE usuario_id = $1 ORDER BY data DESC",
      [req.user.id]
    );

    const out = [];
    for (const p of pedidos) {
      const { rows: itensRows } = await db.query("SELECT * FROM pedido_itens WHERE pedido_id = $1", [p.id]);
      out.push({
        id: p.id,
        data: p.data,
        status: p.status,
        totais: {
          sub: p.subtotal,
          frete: p.frete,
          desconto: p.desconto,
          embalagem: p.embalagem,
          descontoPix: p.desconto_pix,
          total: p.total
        },
        frete: {
          regiao: p.frete_regiao,
          prazo: [p.frete_prazo_min, p.frete_prazo_max],
          modalidade: p.frete_modalidade
        },
        endereco: {
          cep: p.cep, rua: p.rua, numero: p.numero,
          bairro: p.bairro, cidade: p.cidade, complemento: p.complemento
        },
        pagamento: { metodo: p.pagamento_metodo, parcelas: p.pagamento_parcelas },
        presente: p.presente_para ? {
          para: p.presente_para, de: p.presente_de,
          mensagem: p.presente_msg, ocultarValores: !!p.presente_ocultar
        } : null,
        brotosGanhos: p.brotos_ganhos,
        itens: itensRows.map((i) => ({
          id: i.planta_id, nome: i.nome, qtd: i.quantidade, preco: i.preco_unitario
        }))
      });
    }
    res.json(out);
  } catch (err) { next(err); }
});

/* ---------- Avaliações ---------- */
app.get("/api/avaliacoes", async (req, res, next) => {
  try {
    const { rows } = await db.query("SELECT * FROM avaliacoes ORDER BY data DESC LIMIT 100");
    res.json(rows.map((a) => ({
      id: a.id,
      plantaId: a.planta_id,
      nota: a.nota,
      texto: a.texto,
      autor: a.autor,
      data: a.data
    })));
  } catch (err) { next(err); }
});

app.post("/api/avaliacoes", auth, async (req, res, next) => {
  try {
    const plantaId = String(req.body?.plantaId || "").slice(0, 20);
    const nota = Math.min(5, Math.max(1, Number(req.body?.nota) || 0));
    const texto = clean(req.body?.texto, 500);

    if (!plantaId || !nota || texto.length < 10) {
      return res.status(400).json({ erro: "Dados incompletos (mín. 10 caracteres)." });
    }

    const { rows: compraRows } = await db.query(`
      SELECT 1 FROM pedido_itens pi
      JOIN pedidos p ON p.id = pi.pedido_id
      WHERE p.usuario_id = $1 AND pi.planta_id = $2
      LIMIT 1
    `, [req.user.id, plantaId]);
    if (!compraRows[0]) return res.status(400).json({ erro: "Você só pode avaliar plantas que comprou." });

    const id = uid();
    await db.query(`
      INSERT INTO avaliacoes (id, usuario_id, planta_id, nota, texto, autor)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [id, req.user.id, plantaId, nota, texto, req.user.nome]);

    await db.query("UPDATE usuarios SET brotos = brotos + 50 WHERE id = $1", [req.user.id]);
    const { rows: userRows } = await db.query("SELECT * FROM usuarios WHERE id = $1", [req.user.id]);
    const user = userRows[0];

    res.json({ id, brotos: user.brotos, usuario: publicUser(user) });
  } catch (err) { next(err); }
});

/* ---------- FAQ + meta ---------- */
app.get("/api/faq", async (req, res, next) => {
  try {
    const { rows } = await db.query("SELECT pergunta AS q, resposta AS a FROM faq ORDER BY ordem");
    res.json(rows);
  } catch (err) { next(err); }
});

app.get("/api/meta", async (req, res, next) => {
  try {
    const { rows: catRows } = await db.query("SELECT DISTINCT categoria FROM plantas ORDER BY categoria");
    const { rows: ambRows } = await db.query("SELECT DISTINCT ambiente FROM plantas ORDER BY ambiente");
    res.json({
      categorias: catRows.map((r) => r.categoria),
      ambientes: ambRows.map((r) => r.ambiente)
    });
  } catch (err) { next(err); }
});

/* ---------- Endereço ---------- */
app.put("/api/me/endereco", auth, async (req, res, next) => {
  try {
    await db.query(`
      UPDATE usuarios SET cep = $1, rua = $2, bairro = $3, cidade = $4, complemento = $5
      WHERE id = $6
    `, [
      clean(req.body?.cep, 12) || null,
      clean(req.body?.rua, 120) || null,
      clean(req.body?.bairro, 80) || null,
      clean(req.body?.cidade, 80) || null,
      clean(req.body?.complemento, 80) || null,
      req.user.id
    ]);
    const { rows } = await db.query("SELECT * FROM usuarios WHERE id = $1", [req.user.id]);
    res.json({ usuario: publicUser(rows[0]) });
  } catch (err) { next(err); }
});
/* ---------- Flora ---------- */
try {
  require("./flora-api")(app, { db, mapPlanta, clean, rateLimit });
} catch (e) {
  console.warn("[Flora] módulo não carregou:", e.message);
}
/* ---------- Fallback SPA ---------- */
app.get("*", (req, res) => {
  res.sendFile(path.join(frontendDir, "index.html"));
});

/* ---------- Handler de erro central ---------- */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ erro: "Erro interno do servidor." });
});

app.listen(PORT, () => {
  console.log(`Florescer rodando em http://localhost:${PORT}`);
});
