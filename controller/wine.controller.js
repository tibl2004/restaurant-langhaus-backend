const pool = require("../database");
const jwt = require("jsonwebtoken");

const wineController = {

    authenticateToken: (req, res, next) => {

        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(" ")[1];

        if (!token) {
            return res.status(401).json({
                error: "Kein Token"
            });
        }

        jwt.verify(token, process.env.JWT_SECRET, (err, user) => {

            if (err) {
                return res.status(403).json({
                    error: "Ungültiger Token"
                });
            }

            req.user = user;

            next();

        });

    },

    getWines: async (req, res) => {

        try {

            const [rows] = await pool.query(`
                SELECT

                    w.id,
                    w.nummer,
                    w.name,
                    w.alcohol,
                    w.description,
                    w.body_level,
                    w.sweetness,

                    c.name AS category,

                    co.name AS country,

                    r.name AS region,

                    p.name AS producer

                FROM wines w

                LEFT JOIN wine_categories c
                    ON c.id = w.category_id

                LEFT JOIN wine_countries co
                    ON co.id = w.country_id

                LEFT JOIN wine_regions r
                    ON r.id = w.region_id

                LEFT JOIN wine_producers p
                    ON p.id = w.producer_id

                ORDER BY w.name
            `);

            for (const wine of rows) {

                const [sizes] = await pool.query(`
                    SELECT
                        id,
                        volume,
                        price_dl,
                        price_bottle
                    FROM wine_sizes
                    WHERE wine_id = ?
                    ORDER BY volume
                `, [wine.id]);

                wine.sizes = sizes;

            }

            res.json(rows);

        } catch (err) {

            console.error(err);

            res.status(500).json({
                error: "Fehler beim Laden."
            });

        }

    },

    getWineById: async (req, res) => {

        try {

            const { wineId } = req.params;

            const [[wine]] = await pool.query(`

                SELECT

                    w.*,

                    c.name AS category,

                    co.name AS country,

                    r.name AS region,

                    p.name AS producer

                FROM wines w

                LEFT JOIN wine_categories c
                    ON c.id = w.category_id

                LEFT JOIN wine_countries co
                    ON co.id = w.country_id

                LEFT JOIN wine_regions r
                    ON r.id = w.region_id

                LEFT JOIN wine_producers p
                    ON p.id = w.producer_id

                WHERE w.id = ?

            `, [wineId]);

            if (!wine) {

                return res.status(404).json({
                    error: "Wein nicht gefunden."
                });

            }

            const [sizes] = await pool.query(`

                SELECT
                    id,
                    volume,
                    price_dl,
                    price_bottle
                FROM wine_sizes
                WHERE wine_id = ?

            `, [wineId]);

            wine.sizes = sizes;

            res.json(wine);

        } catch (err) {

            console.error(err);

            res.status(500).json({
                error: "Fehler."
            });

        }

    },

    createWine: async (req, res) => {

      try {

          const {

              nummer,
              category,
              name,
              alcohol,
              description,
              country,
              region,
              producer,
              body_level,
              sweetness,
              sizes

          } = req.body;

          if (!name || !category) {

              return res.status(400).json({
                  error: "Name und Kategorie sind erforderlich."
              });

          }

          // Kategorie suchen oder erstellen

          let categoryId = null;

          const [[existingCategory]] = await pool.query(`
              SELECT id
              FROM wine_categories
              WHERE name = ?
          `, [category]);

          if (existingCategory) {

              categoryId = existingCategory.id;

          } else {

              const [result] = await pool.query(`
                  INSERT INTO wine_categories (name)
                  VALUES (?)
              `, [category]);

              categoryId = result.insertId;

          }

          // Land suchen oder erstellen

          let countryId = null;

          if (country) {

              const [[existingCountry]] = await pool.query(`
                  SELECT id
                  FROM wine_countries
                  WHERE name = ?
              `, [country]);

              if (existingCountry) {

                  countryId = existingCountry.id;

              } else {

                  const [result] = await pool.query(`
                      INSERT INTO wine_countries (name)
                      VALUES (?)
                  `, [country]);

                  countryId = result.insertId;

              }

          }

          // Region suchen oder erstellen

          let regionId = null;

          if (region && countryId) {

              const [[existingRegion]] = await pool.query(`
                  SELECT id
                  FROM wine_regions
                  WHERE name = ?
                  AND country_id = ?
              `, [region, countryId]);

              if (existingRegion) {

                  regionId = existingRegion.id;

              } else {

                  const [result] = await pool.query(`
                      INSERT INTO wine_regions (
                          country_id,
                          name
                      )
                      VALUES (?, ?)
                  `, [
                      countryId,
                      region
                  ]);

                  regionId = result.insertId;

              }

          }

          // Produzent suchen oder erstellen

          let producerId = null;

          if (producer) {

              const [[existingProducer]] = await pool.query(`
                  SELECT id
                  FROM wine_producers
                  WHERE name = ?
              `, [producer]);

              if (existingProducer) {

                  producerId = existingProducer.id;

              } else {

                  const [result] = await pool.query(`
                      INSERT INTO wine_producers (name)
                      VALUES (?)
                  `, [producer]);

                  producerId = result.insertId;

              }

          }

          // Wein speichern

          const [wineResult] = await pool.query(`
              INSERT INTO wines (

                  nummer,
                  category_id,
                  producer_id,
                  country_id,
                  region_id,
                  name,
                  alcohol,
                  description,
                  body_level,
                  sweetness

              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [

              nummer || null,
              categoryId,
              producerId,
              countryId,
              regionId,
              name,
              alcohol || null,
              description || null,
              body_level ?? 50,
              sweetness ?? 50

          ]);

          const wineId = wineResult.insertId;

          // Größen speichern

          if (Array.isArray(sizes)) {

              for (const size of sizes) {

                  await pool.query(`
                      INSERT INTO wine_sizes (

                          wine_id,
                          volume,
                          price_dl,
                          price_bottle

                      )
                      VALUES (?, ?, ?, ?)
                  `, [

                      wineId,
                      size.volume,
                      size.price_dl,
                      size.price_bottle

                  ]);

              }

          }

          res.json({

              success: true,
              wineId

          });

      } catch (err) {

          console.error(err);

          res.status(500).json({

              error: "Fehler beim Erstellen."

          });

      }

  },
  updateWine: async (req, res) => {

    try {

        const { wineId } = req.params;

        const {

            nummer,
            category,
            name,
            alcohol,
            description,
            country,
            region,
            producer,
            body_level,
            sweetness,
            sizes

        } = req.body;

        // Kategorie

        let categoryId = null;

        const [[existingCategory]] = await pool.query(`
            SELECT id
            FROM wine_categories
            WHERE name = ?
        `, [category]);

        if (existingCategory) {

            categoryId = existingCategory.id;

        } else {

            const [result] = await pool.query(`
                INSERT INTO wine_categories (name)
                VALUES (?)
            `, [category]);

            categoryId = result.insertId;

        }

        // Land

        let countryId = null;

        if (country) {

            const [[existingCountry]] = await pool.query(`
                SELECT id
                FROM wine_countries
                WHERE name = ?
            `, [country]);

            if (existingCountry) {

                countryId = existingCountry.id;

            } else {

                const [result] = await pool.query(`
                    INSERT INTO wine_countries (name)
                    VALUES (?)
                `, [country]);

                    countryId = result.insertId;

            }

        }

        // Region

        let regionId = null;

        if (region && countryId) {

            const [[existingRegion]] = await pool.query(`
                SELECT id
                FROM wine_regions
                WHERE name = ?
                AND country_id = ?
            `, [region, countryId]);

            if (existingRegion) {

                regionId = existingRegion.id;

            } else {

                const [result] = await pool.query(`
                    INSERT INTO wine_regions (
                        country_id,
                        name
                    )
                    VALUES (?, ?)
                `, [
                    countryId,
                    region
                ]);

                regionId = result.insertId;

            }

        }

        // Produzent

        let producerId = null;

        if (producer) {

            const [[existingProducer]] = await pool.query(`
                SELECT id
                FROM wine_producers
                WHERE name = ?
            `, [producer]);

            if (existingProducer) {

                producerId = existingProducer.id;

            } else {

                const [result] = await pool.query(`
                    INSERT INTO wine_producers (name)
                    VALUES (?)
                `, [producer]);

                producerId = result.insertId;

            }

        }

        await pool.query(`
            UPDATE wines
            SET

                nummer = ?,
                category_id = ?,
                producer_id = ?,
                country_id = ?,
                region_id = ?,
                name = ?,
                alcohol = ?,
                description = ?,
                body_level = ?,
                sweetness = ?

            WHERE id = ?
        `, [

            nummer || null,
            categoryId,
            producerId,
            countryId,
            regionId,
            name,
            alcohol || null,
            description || null,
            body_level ?? 50,
            sweetness ?? 50,
            wineId

        ]);

        await pool.query(`
            DELETE FROM wine_sizes
            WHERE wine_id = ?
        `, [wineId]);

        if (Array.isArray(sizes)) {

            for (const size of sizes) {

                await pool.query(`
                    INSERT INTO wine_sizes (

                        wine_id,
                        volume,
                        price_dl,
                        price_bottle

                    )
                    VALUES (?, ?, ?, ?)
                `, [

                    wineId,
                    size.volume,
                    size.price_dl,
                    size.price_bottle

                ]);

            }

        }

        res.json({

            success: true

        });

    } catch (err) {

        console.error(err);

        res.status(500).json({

            error: "Fehler beim Aktualisieren."

        });

    }

},

deleteWine: async (req, res) => {

    try {

        const { wineId } = req.params;

        await pool.query(`
            DELETE FROM wine_sizes
            WHERE wine_id = ?
        `, [wineId]);

        await pool.query(`
            DELETE FROM wines
            WHERE id = ?
        `, [wineId]);

        res.json({

            success: true

        });

    } catch (err) {

        console.error(err);

        res.status(500).json({

            error: "Fehler beim Löschen."

        });

    }

}

};

module.exports = wineController;
