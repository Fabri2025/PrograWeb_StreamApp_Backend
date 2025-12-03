import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db";

const router = Router();

const alignSequence = async (
  client: Awaited<ReturnType<typeof db.getClient>>,
  table: string,
  column: string = "id"
) => {
  await client.query(
    `SELECT setval(pg_get_serial_sequence($1, $2),
                   (SELECT COALESCE(MAX(${column}),0) FROM ${table}),
                   true)`,
    [table, column]
  );
};

const parseDateOrNow = (value?: unknown) => {
  if (typeof value === "string") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
};

// POST /api/streams/:streamId/start
// Marca inicio de una sesion RTMP; idempotente si ya existe una sesion abierta.
router.post(
  "/streams/:streamId/start",
  async (req: Request, res: Response, next: NextFunction) => {
    const streamId = Number(req.params.streamId);
    const { streamerId, startedAt } = req.body || {};
    if (Number.isNaN(streamId)) return res.status(400).json({ message: "streamId invalido" });
    if (Number.isNaN(Number(streamerId)))
      return res.status(400).json({ message: "streamerId invalido" });

    const client = await db.getClient();
    try {
      await client.query("BEGIN");

      const streamRes = await client.query(
        `SELECT id, streamer_id, estado, inicio_en, fin_en
         FROM streams
         WHERE id = $1
         FOR UPDATE`,
        [streamId]
      );
      if (!streamRes.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "stream no encontrado" });
      }
      const stream = streamRes.rows[0];
      if (stream.streamer_id !== Number(streamerId)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "stream no pertenece a streamer" });
      }

      const openSession = await client.query(
        `SELECT id, inicio
         FROM sesiones_stream
         WHERE stream_id = $1 AND fin IS NULL
         ORDER BY inicio DESC
         LIMIT 1`,
        [streamId]
      );
      if (openSession.rowCount) {
        await client.query("COMMIT");
        const s = openSession.rows[0];
        return res.json({
          sessionId: s.id,
          streamId,
          inicio: s.inicio,
          estado_stream: stream.estado,
          mensaje: "sesion ya abierta",
        });
      }

      await alignSequence(client, "sesiones_stream");
      const inicioDate = parseDateOrNow(startedAt);

      const sessionRes = await client.query(
        `INSERT INTO sesiones_stream (stream_id, inicio)
         VALUES ($1, $2)
         RETURNING id, inicio`,
        [streamId, inicioDate]
      );

      await client.query(
        `UPDATE streams
         SET estado = 'en_vivo',
             inicio_en = COALESCE(inicio_en, $1)
         WHERE id = $2`,
        [inicioDate, streamId]
      );

      await client.query("COMMIT");
      return res.status(201).json({
        sessionId: sessionRes.rows[0].id,
        streamId,
        inicio: sessionRes.rows[0].inicio,
        estado_stream: "en_vivo",
      });
    } catch (err) {
      await client.query("ROLLBACK");
      next(err);
    } finally {
      client.release();
    }
  }
);

// POST /api/streams/:streamId/stop
// Cierra la sesion abierta, calcula duracion y actualiza horas_totales del streamer.
router.post(
  "/streams/:streamId/stop",
  async (req: Request, res: Response, next: NextFunction) => {
    const streamId = Number(req.params.streamId);
    const { streamerId, endedAt } = req.body || {};
    if (Number.isNaN(streamId)) return res.status(400).json({ message: "streamId invalido" });
    if (Number.isNaN(Number(streamerId)))
      return res.status(400).json({ message: "streamerId invalido" });

    const client = await db.getClient();
    try {
      await client.query("BEGIN");

      const streamRes = await client.query(
        `SELECT id, streamer_id, estado, inicio_en
         FROM streams
         WHERE id = $1
         FOR UPDATE`,
        [streamId]
      );
      if (!streamRes.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "stream no encontrado" });
      }
      const stream = streamRes.rows[0];
      if (stream.streamer_id !== Number(streamerId)) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "stream no pertenece a streamer" });
      }

      const sessionRes = await client.query(
        `SELECT id, inicio
         FROM sesiones_stream
         WHERE stream_id = $1 AND fin IS NULL
         ORDER BY inicio DESC
         LIMIT 1
         FOR UPDATE`,
        [streamId]
      );
      if (!sessionRes.rowCount) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "no hay sesion abierta para cerrar" });
      }
      const session = sessionRes.rows[0];
      const finDate = parseDateOrNow(endedAt);
      const finSafe = finDate.getTime() < new Date(session.inicio).getTime() ? new Date(session.inicio) : finDate;

      const closeRes = await client.query(
        `UPDATE sesiones_stream
         SET fin = $1,
             duracion_horas = GREATEST(EXTRACT(EPOCH FROM ($1 - inicio)) / 3600, 0)
         WHERE id = $2
         RETURNING duracion_horas, inicio, fin`,
        [finSafe, session.id]
      );

      await client.query(
        `UPDATE streams
         SET estado = 'finalizado',
             fin_en = $1
         WHERE id = $2`,
        [finSafe, streamId]
      );

      await client.query(
        `UPDATE perfiles_streamer
         SET horas_totales = horas_totales + $1,
             ultimo_stream_en = $2
         WHERE id = $3`,
        [Number(closeRes.rows[0].duracion_horas), finSafe, stream.streamer_id]
      );

      await client.query("COMMIT");
      return res.json({
        sessionId: session.id,
        streamId,
        inicio: closeRes.rows[0].inicio,
        fin: closeRes.rows[0].fin,
        duracion_horas: Number(closeRes.rows[0].duracion_horas),
        estado_stream: "finalizado",
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
