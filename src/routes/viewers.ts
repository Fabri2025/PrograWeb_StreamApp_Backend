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

export default router;
