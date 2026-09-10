/**
 * Florescer — conexão com o Postgres (Supabase)
 *
 * O schema agora vive no Supabase (aplicado via migration), então este
 * arquivo não recria mais tabelas ao subir o servidor — só abre a conexão.
 */
const { Pool } = require("pg");

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // necessário no Supabase
  max: 5 // pool pequeno: o pooler do Supabase já gerencia o resto
});

/**
 * Executa uma sequência de queries dentro de uma transação.
 * Uso: await transaction(async (client) => { await client.query(...); });
 * Se qualquer query lançar erro, tudo é revertido (ROLLBACK).
 */
async function transaction(callback) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { db, transaction };
