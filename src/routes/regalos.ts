import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db";

const router = Router();

// GET /api/streamers/:streamerId/regalos
router.get("/streamers/:streamerId/regalos", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const streamerId = Number(req.params.streamerId);
    if (Number.isNaN(streamerId)) return res.status(400).json({ message: "streamerId invalido" });

    const { rows } = await db.query(
      `SELECT id, nombre, costo_usd, costo_coins, puntos_otorgados
       FROM regalos
       WHERE activo = TRUE AND (streamer_id = $1 OR streamer_id IS NULL)
       ORDER BY costo_coins ASC, id ASC`,
      [streamerId]
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/regalos (lista global opcional)
router.get("/regalos", async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, streamer_id, nombre, costo_usd, costo_coins, puntos_otorgados
       FROM regalos
       WHERE activo = TRUE
       ORDER BY streamer_id NULLS FIRST, costo_coins ASC, id ASC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/streams/:streamId/regalos/:regaloId/enviar
// Compra/envia un regalo: descuenta coins, suma puntos y registra el envio.
router.post(
  "/streams/:streamId/regalos/:regaloId/enviar",
  async (req: Request, res: Response, next: NextFunction) => {
    const streamId = Number(req.params.streamId);
    const regaloId = Number(req.params.regaloId);
    const { viewerId, cantidad = 1, mensaje } = req.body || {};

    if (Number.isNaN(streamId)) return res.status(400).json({ message: "streamId invalido" });
    if (Number.isNaN(regaloId)) return res.status(400).json({ message: "regaloId invalido" });
    if (Number.isNaN(Number(viewerId))) return res.status(400).json({ message: "viewerId invalido" });
    if (!Number.isInteger(Number(cantidad)) || Number(cantidad) <= 0)
      return res.status(400).json({ message: "cantidad debe ser entero > 0" });

    const qty = Number(cantidad);
    const msgText = typeof mensaje === "string" && mensaje.trim() ? mensaje.trim() : null;

    const client = await db.getClient();
    try {
      await client.query("BEGIN");

      const viewerRes = await client.query(
        `SELECT pv.id, pv.usuario_id, pv.nivel_actual, pv.puntos,
                b.id AS billetera_id, b.saldo_coins
         FROM perfiles_viewer pv
         JOIN usuarios u ON u.id = pv.usuario_id
         JOIN billeteras b ON b.usuario_id = u.id
         WHERE pv.id = $1
         FOR UPDATE`,
        [Number(viewerId)]
      );
      if (!viewerRes.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "viewer no encontrado" });
      }
      const viewer = viewerRes.rows[0];

      const streamRes = await client.query(`SELECT id, streamer_id FROM streams WHERE id = $1`, [streamId]);
      if (!streamRes.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "stream no encontrado" });
      }
      const stream = streamRes.rows[0];

      const regaloRes = await client.query(
        `SELECT id, streamer_id, costo_coins, puntos_otorgados, activo
         FROM regalos
         WHERE id = $1 AND activo = TRUE`,
        [regaloId]
      );
      if (!regaloRes.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "regalo no encontrado o inactivo" });
      }
      const regalo = regaloRes.rows[0];

      if (regalo.streamer_id && regalo.streamer_id !== stream.streamer_id) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "regalo no pertenece a este streamer" });
      }

      const totalCoins = Number(regalo.costo_coins) * qty;
      const totalPuntos = Number(regalo.puntos_otorgados) * qty;

      if (Number(viewer.saldo_coins) < totalCoins) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "saldo insuficiente" });
      }

      // Alinear secuencias para evitar PK duplicadas
      await client.query(
        `SELECT setval(pg_get_serial_sequence('envios_regalo','id'),
                       GREATEST((SELECT COALESCE(MAX(id),0) FROM envios_regalo),
                                (SELECT last_value FROM envios_regalo_id_seq)), true)`
      );
      await client.query(
        `SELECT setval(pg_get_serial_sequence('movimientos_billetera','id'),
                       GREATEST((SELECT COALESCE(MAX(id),0) FROM movimientos_billetera),
                                (SELECT last_value FROM movimientos_billetera_id_seq)), true)`
      );
      await client.query(
        `SELECT setval(pg_get_serial_sequence('mensajes_chat','id'),
                       GREATEST((SELECT COALESCE(MAX(id),0) FROM mensajes_chat),
                                (SELECT last_value FROM mensajes_chat_id_seq)), true)`
      );

      const billeteraRes = await client.query(
        `UPDATE billeteras
         SET saldo_coins = saldo_coins - $1, actualizado_en = NOW()
         WHERE id = $2 AND saldo_coins >= $1
         RETURNING saldo_coins` ,
        [totalCoins, viewer.billetera_id]
      );
      if (!billeteraRes.rowCount) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "saldo insuficiente" });
      }

      const envioRes = await client.query(
        `INSERT INTO envios_regalo (gift_id, stream_id, remitente_id, streamer_id, cantidad, coins_gastados, puntos_generados, mensaje, creado_en)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         RETURNING id, creado_en`,
        [regalo.id, stream.id, viewer.id, stream.streamer_id, qty, totalCoins, totalPuntos, msgText]
      );

      await client.query(
        `INSERT INTO movimientos_billetera (billetera_id, tipo, monto, referencia_tipo, referencia_id, creado_en)
         VALUES ($1, 'regalo', $2, 'envio_regalo', $3, NOW())`,
        [viewer.billetera_id, -totalCoins, envioRes.rows[0].id]
      );

      const puntosRes = await client.query(
        `UPDATE perfiles_viewer
         SET puntos = puntos + $1
         WHERE id = $2
         RETURNING puntos`,
        [totalPuntos, viewer.id]
      );

      await client.query(
        `INSERT INTO mensajes_chat (stream_id, usuario_id, tipo, mensaje, gift_id, envio_regalo_id, badge, nivel_usuario, creado_en)
         VALUES ($1, $2, 'regalo', $3, $4, $5, 'none', $6, NOW())`,
        [stream.id, viewer.usuario_id, msgText ?? null, regalo.id, envioRes.rows[0].id, viewer.nivel_actual]
      );

      await client.query("COMMIT");
      return res.status(201).json({
        envioId: envioRes.rows[0].id,
        streamId: stream.id,
        streamerId: stream.streamer_id,
        viewerId: viewer.id,
        coins_gastados: totalCoins,
        puntos_generados: totalPuntos,
        puntos_totales: Number(puntosRes.rows[0].puntos),
        saldo_restante: Number(billeteraRes.rows[0].saldo_coins),
        creado_en: envioRes.rows[0].creado_en,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      next(err);
    } finally {
      client.release();
    }
  }
);

export default router;
