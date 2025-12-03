import { PoolClient } from "pg";

type SubidaNivelParams = {
  viewerId: number;
  usuarioId: number;
  streamId: number;
  billeteraId?: number;
  puntosTotales: number;
  nivelActual: number;
};

export type SubidaNivelResultado = {
  subioNivel: boolean;
  nuevoNivel?: number;
  recompensaCoins?: number;
  saldoCoins?: number;
  notificacionId?: number;
};

/**
 * Revisa reglas_nivel_viewer y, si el viewer alcanzo un nuevo nivel,
 * actualiza nivel_actual, otorga recompensa_coins en billetera y crea
 * un mensaje de sistema en mensajes_chat para notificar.
 */
export async function aplicarSubidaNivelViewer(
  client: PoolClient,
  params: SubidaNivelParams
): Promise<SubidaNivelResultado> {
  const { rows } = await client.query(
    `SELECT nivel, recompensa_coins
     FROM reglas_nivel_viewer
     WHERE activo = TRUE AND puntos_requeridos <= $1
     ORDER BY nivel DESC
     LIMIT 1`,
    [params.puntosTotales]
  );

  if (!rows.length) return { subioNivel: false };

  const regla = rows[0];
  const nuevoNivel = Number(regla.nivel);
  const recompensaCoins = Number(regla.recompensa_coins) || 0;

  if (nuevoNivel <= params.nivelActual) return { subioNivel: false };

  await client.query(
    `UPDATE perfiles_viewer
     SET nivel_actual = $1
     WHERE id = $2`,
    [nuevoNivel, params.viewerId]
  );

  let saldoCoins: number | undefined;
  if (params.billeteraId && recompensaCoins > 0) {
    await client.query(
      `SELECT setval(
          pg_get_serial_sequence('movimientos_billetera','id'),
          GREATEST(
            (SELECT COALESCE(MAX(id),0) FROM movimientos_billetera),
            (SELECT last_value FROM movimientos_billetera_id_seq)
          ),
          true
        )`
    );

    const billeteraRes = await client.query(
      `UPDATE billeteras
       SET saldo_coins = saldo_coins + $1, actualizado_en = NOW()
       WHERE id = $2
       RETURNING saldo_coins`,
      [recompensaCoins, params.billeteraId]
    );
    saldoCoins = Number(billeteraRes.rows[0].saldo_coins);

    await client.query(
      `INSERT INTO movimientos_billetera (billetera_id, tipo, monto, referencia_tipo, referencia_id, creado_en)
       VALUES ($1, 'recarga', $2, 'recompensa_nivel', $3, NOW())`,
      [params.billeteraId, recompensaCoins, nuevoNivel]
    );
  }

  await client.query(
    `SELECT setval(
        pg_get_serial_sequence('mensajes_chat','id'),
        GREATEST(
          (SELECT COALESCE(MAX(id),0) FROM mensajes_chat),
          (SELECT last_value FROM mensajes_chat_id_seq)
        ),
        true
      )`
  );

  const mensaje = `Felicidades, subiste al nivel ${nuevoNivel}`;
  const msgRes = await client.query(
    `INSERT INTO mensajes_chat (stream_id, usuario_id, tipo, mensaje, badge, nivel_usuario, creado_en)
     VALUES ($1, $2, 'sistema', $3, 'none', $4, NOW())
     RETURNING id`,
    [params.streamId, params.usuarioId, mensaje, nuevoNivel]
  );

  return {
    subioNivel: true,
    nuevoNivel,
    recompensaCoins,
    saldoCoins,
    notificacionId: msgRes.rows[0].id,
  };
}
