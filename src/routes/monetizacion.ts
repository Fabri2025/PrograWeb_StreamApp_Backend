import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db";

const router = Router();
const PRECIO_BASE_POR_MONEDA = 0.04; 

// Obtener paquetes disponibles
router.get("/paquetes", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await db.query("SELECT * FROM paquetes_monedas WHERE activo = true ORDER BY coins ASC");
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Ruta temporal para ajustar la BD (permite paquete_id null)
router.get("/fix-db", async (_req, res) => {
  try {
    await db.query("ALTER TABLE ordenes_monedas ALTER COLUMN paquete_id DROP NOT NULL;");
    res.send("Listo. La base de datos ha sido actualizada. Ahora intenta comprar de nuevo.");
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Req 28: Compra de Monedas (Paquete o Personalizado) ---
router.post("/comprar", async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Aceptamos 'paqueteId' O 'cantidadPersonalizada'
    const { usuarioId, paqueteId, cantidadPersonalizada } = req.body;

    let coins = 0;
    let precio = 0;
    let paqueteRef: number | null = null; 

    if (paqueteId) {
      // Opción A: Compra de Paquete
      const packRes = await db.query("SELECT * FROM paquetes_monedas WHERE id = $1", [paqueteId]);
      if (!packRes.rows.length) return res.status(404).json({ message: "Paquete no encontrado" });

      const paquete = packRes.rows[0];
      coins = paquete.coins;
      precio = Number(paquete.precio);
      paqueteRef = paquete.id;
    } else if (cantidadPersonalizada && cantidadPersonalizada > 0) {
      // Opción B: Compra Personalizada
      coins = cantidadPersonalizada;
      precio = coins * PRECIO_BASE_POR_MONEDA;
    } else {
      return res.status(400).json({ message: "Debes especificar un paquete o una cantidad" });
    }

    
    // NOTA: 'comprobante' es simulado; en producción vendría de la pasarela de pago (Stripe/PayPal)
    const ordenRes = await db.query(
      `INSERT INTO ordenes_monedas (usuario_id, paquete_id, coins_entregados, precio_pagado, estado, comprobante)
       VALUES ($1, $2, $3, $4, 'pagado', 'RECIBO-' || floor(random() * 1000000)) 
       RETURNING id, comprobante`,
      [usuarioId, paqueteRef, coins, precio]
    );
    const recibo = ordenRes.rows[0].comprobante;

    // 2. Buscar/crear billetera del usuario
    const walletRes = await db.query("SELECT id FROM billeteras WHERE usuario_id = $1", [usuarioId]);
    let walletId: number;
    if (walletRes.rows.length === 0) {
      const newWallet = await db.query(
        "INSERT INTO billeteras (usuario_id, saldo_coins) VALUES ($1, 0) RETURNING id",
        [usuarioId]
      );
      walletId = newWallet.rows[0].id;
    } else {
      walletId = walletRes.rows[0].id;
    }

    // 3. Registrar el movimiento en el historial
    await db.query(
      `INSERT INTO movimientos_billetera (billetera_id, tipo, monto, referencia_tipo, referencia_id)
       VALUES ($1, 'recarga', $2, 'orden_monedas', $3)`,
      [walletId, coins, ordenRes.rows[0].id]
    );

    // 4. Actualizar el saldo final
    await db.query(`UPDATE billeteras SET saldo_coins = saldo_coins + $1 WHERE id = $2`, [coins, walletId]);

    res.json({
      success: true,
      message: "Compra realizada con éxito",
      coinsAgregadas: coins,
      recibo,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
