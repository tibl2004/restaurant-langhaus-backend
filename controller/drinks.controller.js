const pool = require("../database/index");
const jwt = require("jsonwebtoken");

const drinksController = {

  /* =====================================================
     🔐 JWT AUTH
  ===================================================== */
  authenticateToken: (req, res, next) => {

    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token)
      return res.status(401).json({
        error: "Kein Token"
      });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {

      if (err)
        return res.status(403).json({
          error: "Ungültiger Token"
        });

      req.user = user;
      next();
    });
  },

  /* =====================================================
     📄 GET DRINKS MENU
     GET /api/drinks
  ===================================================== */
  getDrinksMenu: async (req, res) => {

    try {

      const [[menu]] = await pool.query(
        `SELECT * FROM drinks_menu LIMIT 1`
      );

      if (!menu)
        return res.status(404).json({
          error: "Getränkekarte nicht gefunden"
        });

      const [categories] = await pool.query(
        `SELECT * 
         FROM drinks_category
         WHERE drinks_menu_id = ?
         ORDER BY sort_order, id`,
        [menu.id]
      );

      for (const cat of categories) {

        const [items] = await pool.query(
          `SELECT *
           FROM drinks_item
           WHERE category_id = ?
           ORDER BY sort_order, nummer, id`,
          [cat.id]
        );

        for (const item of items) {

          const [sizes] = await pool.query(
            `SELECT id, volume, price
             FROM drinks_size
             WHERE drink_id = ?
             ORDER BY id`,
            [item.id]
          );

          item.sizes = sizes;
        }

        cat.items = items;
      }

      res.json({
        menu,
        categories
      });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error: "Fehler beim Laden der Getränkekarte"
      });
    }
  },

  /* =====================================================
     📂 GET CATEGORIES
  ===================================================== */
  getCategories: async (req, res) => {

    try {

      const [[menu]] = await pool.query(
        `SELECT id FROM drinks_menu LIMIT 1`
      );

      const [categories] = await pool.query(
        `SELECT *
         FROM drinks_category
         WHERE drinks_menu_id = ?
         ORDER BY sort_order, id`,
        [menu.id]
      );

      res.json(categories);

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error: "Fehler beim Laden der Kategorien"
      });
    }
  },

  /* =====================================================
     📂 CREATE CATEGORY
  ===================================================== */
  createCategory: async (req, res) => {

    try {

      const { name, sort_order } = req.body;

      if (!name)
        return res.status(400).json({
          error: "Name erforderlich"
        });

      const [[menu]] = await pool.query(
        `SELECT id FROM drinks_menu LIMIT 1`
      );

      const [result] = await pool.query(
        `INSERT INTO drinks_category
        (drinks_menu_id, name, sort_order)
        VALUES (?, ?, ?)`,
        [
          menu.id,
          name,
          sort_order || 0
        ]
      );

      res.json({
        id: result.insertId,
        name
      });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error: "Fehler beim Erstellen"
      });
    }
  },

  /* =====================================================
     📂 UPDATE CATEGORY
  ===================================================== */
  updateCategory: async (req, res) => {

    try {

      const { categoryId } = req.params;
      const { name, sort_order } = req.body;

      await pool.query(
        `UPDATE drinks_category
         SET
         name = COALESCE(?, name),
         sort_order = COALESCE(?, sort_order)
         WHERE id = ?`,
        [
          name || null,
          sort_order || null,
          categoryId
        ]
      );

      res.json({ success: true });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error: "Fehler beim Update"
      });
    }
  },

  /* =====================================================
     📂 DELETE CATEGORY
  ===================================================== */
  deleteCategory: async (req, res) => {

    try {

      const { categoryId } = req.params;

      await pool.query(
        `DELETE FROM drinks_category WHERE id = ?`,
        [categoryId]
      );

      res.json({ success: true });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error: "Fehler beim Löschen"
      });
    }
  },

  /* =====================================================
     🍺 CREATE DRINK
  ===================================================== */
  createDrink: async (req, res) => {

    try {

      const { categoryId } = req.params;

      const {
        nummer,
        name,
        alcohol,
        description,
        sort_order,
        sizes
      } = req.body;

      if (!name)
        return res.status(400).json({
          error: "Name erforderlich"
        });

      const [result] = await pool.query(
        `INSERT INTO drinks_item
        (
          category_id,
          nummer,
          name,
          alcohol,
          description,
          sort_order
        )
        VALUES (?, ?, ?, ?, ?, ?)`,
        [
          categoryId,
          nummer || null,
          name,
          alcohol || null,
          description || null,
          sort_order || 0
        ]
      );

      const drinkId = result.insertId;

      if (sizes && sizes.length > 0) {

        for (const size of sizes) {

          await pool.query(
            `INSERT INTO drinks_size
             (drink_id, volume, price)
             VALUES (?, ?, ?)`,
            [
              drinkId,
              size.volume,
              size.price
            ]
          );
        }
      }

      res.json({ id: drinkId });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error: "Fehler beim Erstellen Getränk"
      });
    }
  },

  /* =====================================================
     🍺 GET DRINKS BY CATEGORY
  ===================================================== */
  getDrinksByCategory: async (req, res) => {

    try {

      const { categoryId } = req.params;

      const [drinks] = await pool.query(
        `SELECT *
         FROM drinks_item
         WHERE category_id = ?
         ORDER BY sort_order, nummer, id`,
        [categoryId]
      );

      for (const drink of drinks) {

        const [sizes] = await pool.query(
          `SELECT volume, price
           FROM drinks_size
           WHERE drink_id = ?`,
          [drink.id]
        );

        drink.sizes = sizes;
      }

      res.json(drinks);

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error: "Fehler beim Laden Getränke"
      });
    }
  },

  /* =====================================================
     🍺 UPDATE DRINK
  ===================================================== */
  updateDrink: async (req, res) => {

    try {

      const { drinkId } = req.params;

      const {
        nummer,
        name,
        alcohol,
        description,
        sort_order,
        sizes
      } = req.body;

      await pool.query(
        `UPDATE drinks_item SET
          nummer = COALESCE(?, nummer),
          name = COALESCE(?, name),
          alcohol = COALESCE(?, alcohol),
          description = COALESCE(?, description),
          sort_order = COALESCE(?, sort_order)
        WHERE id = ?`,
        [
          nummer || null,
          name || null,
          alcohol || null,
          description || null,
          sort_order || null,
          drinkId
        ]
      );

      if (sizes) {

        await pool.query(
          `DELETE FROM drinks_size WHERE drink_id = ?`,
          [drinkId]
        );

        for (const size of sizes) {

          await pool.query(
            `INSERT INTO drinks_size
             (drink_id, volume, price)
             VALUES (?, ?, ?)`,
            [
              drinkId,
              size.volume,
              size.price
            ]
          );
        }
      }

      res.json({ success: true });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error: "Fehler beim Update"
      });
    }
  },

  /* =====================================================
     🍺 DELETE DRINK
  ===================================================== */
  deleteDrink: async (req, res) => {

    try {

      const { drinkId } = req.params;

      await pool.query(
        `DELETE FROM drinks_size WHERE drink_id = ?`,
        [drinkId]
      );

      await pool.query(
        `DELETE FROM drinks_item WHERE id = ?`,
        [drinkId]
      );

      res.json({ success: true });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error: "Fehler beim Löschen"
      });
    }
  }

};

module.exports = drinksController;