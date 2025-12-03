import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db";

const router = Router();

// GET /api/viewers/:viewerId/saldo
router.get("/viewers/:viewerId/saldo", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const viewerId = Number(req.params.viewerId);
    if (Number.isNaN(viewerId)) return res.status(400).json({ message: "viewerId invalido" });

    const { rows } = await db.query(
      `SELECT pv.id AS viewer_id,
              u.id AS usuario_id,
              b.saldo_coins
       FROM perfiles_viewer pv
       JOIN usuarios u ON u.id = pv.usuario_id
       JOIN billeteras b ON b.usuario_id = u.id
       WHERE pv.id = $1`,
      [viewerId]
    );

    if (!rows.length) return res.status(404).json({ message: "viewer no encontrado" });

    const row = rows[0];
    res.json({
      viewerId: row.viewer_id,
      usuarioId: row.usuario_id,
      saldo_coins: Number(row.saldo_coins),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/viewers/:viewerId/progreso
// Devuelve nivel y puntos actuales del espectador (con avance al siguiente nivel).
router.get("/viewers/:viewerId/progreso", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const viewerId = Number(req.params.viewerId);
    if (Number.isNaN(viewerId)) return res.status(400).json({ message: "viewerId invalido" });

    const perfilRes = await db.query(
      `SELECT pv.id AS viewer_id,
              u.id AS usuario_id,
              pv.nivel_actual,
              pv.puntos,
              pv.horas_vistas,
              b.saldo_coins
       FROM perfiles_viewer pv
       JOIN usuarios u ON u.id = pv.usuario_id
       JOIN billeteras b ON b.usuario_id = u.id
       WHERE pv.id = $1`,
      [viewerId]
    );
    if (!perfilRes.rowCount) return res.status(404).json({ message: "viewer no encontrado" });

    const perfil = perfilRes.rows[0];

    const reglaRes = await db.query(
      `SELECT nivel, puntos_requeridos
       FROM reglas_nivel_viewer
       WHERE activo = TRUE AND nivel > $1
       ORDER BY nivel ASC
       LIMIT 1`,
      [perfil.nivel_actual]
    );

    let siguiente_nivel: number | null = null;
    let puntos_objetivo: number | null = null;
    let puntos_restantes: number | null = null;
    let avance_porcentaje = 100;

    if (reglaRes.rowCount) {
      const regla = reglaRes.rows[0];
      siguiente_nivel = Number(regla.nivel);
      puntos_objetivo = Number(regla.puntos_requeridos);
      puntos_restantes = Math.max(0, puntos_objetivo - Number(perfil.puntos));
      avance_porcentaje = puntos_objetivo > 0
        ? Math.min(100, Number(((Number(perfil.puntos) / puntos_objetivo) * 100).toFixed(2)))
        : 0;
    }

    return res.json({
      viewerId: perfil.viewer_id,
      usuarioId: perfil.usuario_id,
      nivel_actual: Number(perfil.nivel_actual),
      puntos: Number(perfil.puntos),
      horas_vistas: Number(perfil.horas_vistas),
      saldo_coins: Number(perfil.saldo_coins),
      siguiente_nivel,
      puntos_objetivo,
      puntos_restantes,
      avance_porcentaje,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/viewers/:viewerId/notificaciones-nivel
// Obtiene las notificaciones de subida de nivel generadas en chat (tipo sistema).
router.get(
  "/viewers/:viewerId/notificaciones-nivel",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const viewerId = Number(req.params.viewerId);
      if (Number.isNaN(viewerId)) return res.status(400).json({ message: "viewerId invalido" });

      const viewerRes = await db.query(
        `SELECT pv.id, u.id AS usuario_id
         FROM perfiles_viewer pv
         JOIN usuarios u ON u.id = pv.usuario_id
         WHERE pv.id = $1`,
        [viewerId]
      );
      if (!viewerRes.rowCount) return res.status(404).json({ message: "viewer no encontrado" });

      const usuarioId = viewerRes.rows[0].usuario_id;
      const { rows } = await db.query(
        `SELECT mc.id, mc.stream_id, mc.mensaje, mc.nivel_usuario, mc.creado_en, s.titulo
         FROM mensajes_chat mc
         LEFT JOIN streams s ON s.id = mc.stream_id
         WHERE mc.usuario_id = $1
           AND mc.tipo = 'sistema'
           AND mc.gift_id IS NULL
           AND mc.envio_regalo_id IS NULL
         ORDER BY mc.creado_en DESC
         LIMIT 30`,
        [usuarioId]
      );

      return res.json(
        rows.map((row) => ({
          notificacionId: row.id,
          streamId: row.stream_id,
          streamTitulo: row.titulo,
          mensaje: row.mensaje,
          nivel: row.nivel_usuario,
          creado_en: row.creado_en,
        }))
      );
    } catch (err) {
      next(err);
    }
  }
);

export default router;
