import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db";

const router = Router();

// GET /api/streamers/:streamerId/progreso-nivel
// Devuelve horas restantes y porcentaje hacia el siguiente nivel del streamer.
router.get(
  "/streamers/:streamerId/progreso-nivel",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const streamerId = Number(req.params.streamerId);
      if (Number.isNaN(streamerId)) {
        return res.status(400).json({ message: "streamerId invalido" });
      }

      const perfilRes = await db.query(
        `SELECT id, nivel_actual, horas_totales
         FROM perfiles_streamer
         WHERE id = $1`,
        [streamerId]
      );
      if (!perfilRes.rowCount) {
        return res.status(404).json({ message: "streamer no encontrado" });
      }
      const perfil = perfilRes.rows[0];
      const nivelActual = Number(perfil.nivel_actual);
      const horasTotales = Number(perfil.horas_totales);

      const reglaRes = await db.query(
        `SELECT nivel, horas_requeridas
         FROM reglas_nivel_streamer
         WHERE streamer_id = $1
           AND activo = TRUE
           AND nivel > $2
         ORDER BY nivel ASC
         LIMIT 1`,
        [streamerId, nivelActual]
      );

      if (!reglaRes.rowCount) {
        return res.json({
          streamerId,
          nivel_actual: nivelActual,
          horas_totales: horasTotales,
          siguiente_nivel: null,
          horas_objetivo: null,
          horas_restantes: 0,
          avance_porcentaje: 100,
          mensaje: "Ya estas en el nivel maximo segun reglas configuradas",
        });
      }

      const regla = reglaRes.rows[0];
      const siguienteNivel = Number(regla.nivel);
      const horasObjetivo = Number(regla.horas_requeridas);
      const horasRestantes = Math.max(0, horasObjetivo - horasTotales);
      const avancePorcentaje =
        horasObjetivo > 0
          ? Math.min(100, Number(((horasTotales / horasObjetivo) * 100).toFixed(2)))
          : 0;

      return res.json({
        streamerId,
        nivel_actual: nivelActual,
        horas_totales: horasTotales,
        siguiente_nivel: siguienteNivel,
        horas_objetivo: horasObjetivo,
        horas_restantes: horasRestantes,
        avance_porcentaje: avancePorcentaje,
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/streamers/:streamerId/overlays/regalos
// Devuelve los envios de regalo recientes para mostrar overlay en el directo.
router.get(
  "/streamers/:streamerId/overlays/regalos",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const streamerId = Number(req.params.streamerId);
      const streamId = req.query.streamId ? Number(req.query.streamId) : null;
      const limit = req.query.limit ? Number(req.query.limit) : 20;

      if (Number.isNaN(streamerId)) return res.status(400).json({ message: "streamerId invalido" });
      if (req.query.streamId && Number.isNaN(Number(req.query.streamId)))
        return res.status(400).json({ message: "streamId invalido" });
      if (Number.isNaN(limit) || limit <= 0 || limit > 100)
        return res.status(400).json({ message: "limit debe ser entre 1 y 100" });

      const streamerRes = await db.query(
        `SELECT id FROM perfiles_streamer WHERE id = $1`,
        [streamerId]
      );
      if (!streamerRes.rowCount) return res.status(404).json({ message: "streamer no encontrado" });

      const params: any[] = [streamerId];
      let streamFilter = "";
      if (streamId) {
        streamFilter = "AND er.stream_id = $2";
        params.push(streamId);
      }
      params.push(limit);

      const { rows } = await db.query(
        `SELECT er.id AS envio_id,
                er.stream_id,
                s.titulo AS stream_titulo,
                er.remitente_id AS viewer_id,
                u.id AS usuario_id,
                u.nombre AS viewer_nombre,
                u.avatar_url AS viewer_avatar_url,
                er.gift_id,
                g.nombre AS gift_nombre,
                er.cantidad,
                er.coins_gastados,
                er.puntos_generados,
                er.mensaje,
                er.creado_en
         FROM envios_regalo er
         JOIN regalos g ON g.id = er.gift_id
         JOIN perfiles_viewer pv ON pv.id = er.remitente_id
         JOIN usuarios u ON u.id = pv.usuario_id
         LEFT JOIN streams s ON s.id = er.stream_id
         WHERE er.streamer_id = $1
           ${streamFilter}
         ORDER BY er.creado_en DESC
         LIMIT $${params.length}`,
        params
      );

      return res.json(
        rows.map((row) => ({
          envioId: row.envio_id,
          streamId: row.stream_id,
          streamTitulo: row.stream_titulo,
          streamerId,
          viewerId: row.viewer_id,
          viewerUsuarioId: row.usuario_id,
          viewerNombre: row.viewer_nombre,
          viewerAvatarUrl: row.viewer_avatar_url,
          giftId: row.gift_id,
          giftNombre: row.gift_nombre,
          cantidad: row.cantidad,
          coins_gastados: row.coins_gastados,
          puntos_generados: row.puntos_generados,
          mensaje: row.mensaje,
          creado_en: row.creado_en,
        }))
      );
    } catch (err) {
      next(err);
    }
  }
);

export default router;
