/**
 * Popula o banco (Supabase/Postgres) com catálogo, cursos, recompensas e FAQ
 * Rode: node seed.js
 */
const { db } = require("./db");
const path = require("path");
const fs = require("fs");
const vm = require("vm");

// Carrega os dados estáticos do frontend (mesmo arquivo de sempre)
const dadosPathFlat = path.join(__dirname, "dados.js");
const dadosPathNested = path.join(__dirname, "..", "frontend", "dados.js");
const dadosPath = fs.existsSync(dadosPathFlat) ? dadosPathFlat : dadosPathNested;
const codigo = fs.readFileSync(dadosPath, "utf8");

// Avalia de forma segura o módulo dados.js (só declara const)
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  codigo + "\n; this.CATALOGO = CATALOGO; this.CURSOS = CURSOS; this.RECOMPENSAS = RECOMPENSAS; this.FAQ = FAQ;",
  sandbox
);

const { CATALOGO, CURSOS, RECOMPENSAS, FAQ } = sandbox;

async function seed() {
  // curso_aulas e faq são recriadas do zero a cada seed
  await db.query("DELETE FROM curso_aulas");
  await db.query("DELETE FROM faq");

  for (const p of CATALOGO) {
    await db.query(
      `
      INSERT INTO plantas (id, nome, cientifico, emoji, imagem, preco, categoria, ambiente, luz, agua, umidade, porte, dificuldade, pet_friendly, resumo, historia)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      ON CONFLICT (id) DO UPDATE SET
        nome=EXCLUDED.nome, cientifico=EXCLUDED.cientifico, emoji=EXCLUDED.emoji, imagem=EXCLUDED.imagem,
        preco=EXCLUDED.preco, categoria=EXCLUDED.categoria, ambiente=EXCLUDED.ambiente, luz=EXCLUDED.luz,
        agua=EXCLUDED.agua, umidade=EXCLUDED.umidade, porte=EXCLUDED.porte, dificuldade=EXCLUDED.dificuldade,
        pet_friendly=EXCLUDED.pet_friendly, resumo=EXCLUDED.resumo, historia=EXCLUDED.historia
      `,
      [
        p.id, p.nome, p.cientifico, p.emoji, p.imagem || null, p.preco, p.categoria, p.ambiente,
        p.luz, p.agua, p.umidade, p.porte, p.dificuldade, p.petFriendly ? 1 : 0, p.resumo, p.historia
      ]
    );
  }

  for (const c of CURSOS) {
    await db.query(
      `
      INSERT INTO cursos (id, titulo, nivel, duracao, emoji, imagem, descricao, link, brotos)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (id) DO UPDATE SET
        titulo=EXCLUDED.titulo, nivel=EXCLUDED.nivel, duracao=EXCLUDED.duracao, emoji=EXCLUDED.emoji,
        imagem=EXCLUDED.imagem, descricao=EXCLUDED.descricao, link=EXCLUDED.link, brotos=EXCLUDED.brotos
      `,
      [c.id, c.titulo, c.nivel, c.duracao, c.emoji, c.imagem || null, c.descricao, c.link, c.brotos]
    );

    for (let i = 0; i < c.aulas.length; i++) {
      await db.query(
        "INSERT INTO curso_aulas (curso_id, ordem, titulo) VALUES ($1, $2, $3) ON CONFLICT (curso_id, ordem) DO NOTHING",
        [c.id, i, c.aulas[i]]
      );
    }
  }

  for (const r of RECOMPENSAS) {
    await db.query(
      `
      INSERT INTO recompensas (id, nome, descricao, custo, emoji, tipo, valor)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (id) DO UPDATE SET
        nome=EXCLUDED.nome, descricao=EXCLUDED.descricao, custo=EXCLUDED.custo, emoji=EXCLUDED.emoji,
        tipo=EXCLUDED.tipo, valor=EXCLUDED.valor
      `,
      [r.id, r.nome, r.desc, r.custo, r.emoji, r.tipo, r.valor ?? null]
    );
  }

  for (let i = 0; i < FAQ.length; i++) {
    await db.query("INSERT INTO faq (pergunta, resposta, ordem) VALUES ($1, $2, $3)", [FAQ[i].q, FAQ[i].a, i]);
  }

  console.log(
    `Seed OK: ${CATALOGO.length} plantas, ${CURSOS.length} cursos, ${RECOMPENSAS.length} recompensas, ${FAQ.length} FAQs.`
  );
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Erro no seed:", err);
    process.exit(1);
  });
