import pool from "../config/db.js";

export const createReservation = async (req, res) => {
  const { product_id, quantity, pickup_date } = req.body;
  const restaurant_id = req.user.id;

  if (!product_id || !quantity || !pickup_date) {
    return res.status(400).json({ error: "Sva polja su obavezna." });
  }
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const products = await client.query(
      "SELECT * FROM products WHERE id = $1 FOR UPDATE",
      [product_id],
    );
    if (products.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Proizvod nije pronađen." });
    }
    const reserved = await client.query(
      "SELECT COALESCE(SUM(quantity), 0) AS total_reserved FROM reservations WHERE product_id = $1 AND status IN ('Pending', 'Confirmed')",
      [product_id],
    );
    const availableQuantity =
      parseFloat(products.rows[0].quantity) -
      parseFloat(reserved.rows[0].total_reserved);
    const requestedQuantity = parseFloat(quantity);
    if (availableQuantity < requestedQuantity) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Nema dovoljno proizvoda na raspolaganju." });
    }

    const result = await client.query(
      "INSERT INTO reservations (product_id, restaurant_id, quantity, status, pickup_date) VALUES ($1, $2, $3, 'Pending', $4) RETURNING *",
      [product_id, restaurant_id, quantity, pickup_date],
    );
    await client.query(
      `INSERT INTO notifications (user_id, message) VALUES ($1, $2)`,
      [
        products.rows[0].store_id,
        `Novi zahtjev za rezervaciju: ${quantity}${products.rows[0].unit} ${products.rows[0].name}`,
      ],
    );
    await client.query("COMMIT");
    return res.status(201).json({
      message: "Rezervacija uspješno kreirana.",
      reservation: result.rows[0],
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Greška prilikom kreiranja rezervacije:", error);
    return res
      .status(500)
      .json({ error: "Došlo je do greške prilikom kreiranja rezervacije." });
  } finally {
    if (client) client.release();
  }
};

export const getMineReservations = async (req, res) => {
  const restaurant_id = req.user.id;
  const { status, name, business_name } = req.query;
  try {
    let query = `SELECT 
    reservations.id, 
    reservations.restaurant_id, 
    reservations.quantity, 
    reservations.status, 
    reservations.pickup_date, 
    reservations.created_at, 
    reservations.updated_at, 
    products.name AS product_name, 
    products.description, 
    products.discounted_price, 
    products.original_price, 
    products.category, 
    users.business_name, 
    users.city
  FROM reservations 
  JOIN products ON reservations.product_id = products.id
  JOIN users ON products.store_id = users.id
  WHERE reservations.restaurant_id = $1`;
    let values = [restaurant_id];

    if (status) {
      values.push(status);
      query += ` AND reservations.status = $${values.length}`;
    }
    if (name) {
      values.push(`%${name}%`);
      query += ` AND products.name ILIKE $${values.length}`;
    }
    if (business_name) {
      values.push(`%${business_name}%`);
      query += ` AND users.business_name ILIKE $${values.length}`;
    }

    query += ` ORDER BY 
  CASE 
    WHEN reservations.status = 'Pending' THEN 0
    WHEN reservations.status = 'Confirmed' THEN 1
    WHEN reservations.status = 'Completed' THEN 2
    WHEN reservations.status = 'Cancelled' THEN 3
  END,
  reservations.created_at DESC`;

    const result = await pool.query(query, values);
    return res.status(200).json({
      message: "Rezervacije uspješno dohvaćene.",
      reservations: result.rows,
    });
  } catch (error) {
    console.error("Greška prilikom dohvatanja rezervacija:", error);
    return res
      .status(500)
      .json({ error: "Došlo je do greške prilikom dohvatanja rezervacija." });
  }
};

export const getStoreReservations = async (req, res) => {
  const store_id = req.user.id;
  const { status, name, city } = req.query;
  try {
    let query = `SELECT 
        reservations.id, 
        reservations.restaurant_id, 
        reservations.quantity, 
        reservations.status, 
        reservations.pickup_date, 
        reservations.created_at, 
        reservations.updated_at, 
        products.name AS product_name, 
        products.description, 
        products.discounted_price, 
        products.original_price, 
        products.category, 
        users.business_name, 
        users.city
      FROM reservations 
      JOIN products ON reservations.product_id = products.id
      JOIN users ON reservations.restaurant_id = users.id
      WHERE products.store_id = $1`;
    let values = [store_id];

    if (status) {
      values.push(status);
      query += ` AND reservations.status = $${values.length}`;
    }
    if (name) {
      values.push(`%${name}%`);
      query += ` AND products.name ILIKE $${values.length}`;
    }
    if (city) {
      values.push(`%${city}%`);
      query += ` AND users.city ILIKE $${values.length}`;
    }

    query += ` ORDER BY 
      CASE WHEN reservations.status = 'Pending' THEN 0 ELSE 1 END,
      reservations.created_at DESC`;

    const result = await pool.query(query, values);

    return res.status(200).json({
      message: "Rezervacije uspješno dohvaćene.",
      reservations: result.rows,
    });
  } catch (error) {
    console.error("Greška prilikom dohvatanja rezervacija:", error);
    return res
      .status(500)
      .json({ error: "Došlo je do greške prilikom dohvatanja rezervacija." });
  }
};

export const acceptReservation = async (req, res) => {
  const reservationId = req.params.id;
  const store_id = req.user.id;

  if (!reservationId) {
    return res.status(400).json({ error: "ID rezervacije je obavezan." });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const result = await client.query(
      "SELECT * FROM reservations WHERE id = $1 FOR UPDATE",
      [reservationId],
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Rezervacija nije pronađena." });
    }

    const productResult = await client.query(
      "SELECT * FROM products WHERE id = $1 FOR UPDATE",
      [result.rows[0].product_id],
    );

    if (productResult.rows[0].store_id !== store_id) {
      await client.query("ROLLBACK");
      return res
        .status(403)
        .json({ error: "Nemate ovlasti za prihvatanje ove rezervacije." });
    }

    if (result.rows[0].status !== "Pending") {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Rezervacija nije u statusu 'Pending'." });
    }

    await client.query(
      "UPDATE reservations SET status = 'Confirmed' WHERE id = $1",
      [reservationId],
    );
    await client.query(
      `INSERT INTO notifications (user_id, message) VALUES ($1, $2)`,
      [result.rows[0].restaurant_id, `Vaša rezervacija je prihvaćena.`],
    );

    const confirmedSum = await client.query(
      "SELECT COALESCE(SUM(quantity), 0) AS total_confirmed FROM reservations WHERE product_id = $1 AND status = 'Confirmed'",
      [result.rows[0].product_id],
    );

    const totalConfirmed = parseFloat(confirmedSum.rows[0].total_confirmed);
    const productQuantity = parseFloat(productResult.rows[0].quantity);

    if (totalConfirmed >= productQuantity) {
      await client.query("UPDATE products SET status = 'Sold' WHERE id = $1", [
        result.rows[0].product_id,
      ]);
    }

    await client.query("COMMIT");
    return res
      .status(200)
      .json({ message: "Rezervacija je uspješno prihvaćena." });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Greška prilikom prihvatanja rezervacije:", error);
    return res
      .status(500)
      .json({ error: "Došlo je do greške prilikom prihvatanja rezervacije." });
  } finally {
    if (client) client.release();
  }
};

export const rejectReservation = async (req, res) => {
  const reservationId = req.params.id;
  const store_id = req.user.id;
  try {
    if (!reservationId) {
      return res.status(400).json({ error: "ID rezervacije je obavezan." });
    }
    const result = await pool.query(
      "SELECT * FROM reservations WHERE id = $1",
      [reservationId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Rezervacija nije pronađena." });
    }

    const productResult = await pool.query(
      "SELECT * FROM products WHERE id = $1",
      [result.rows[0].product_id],
    );

    if (productResult.rows[0].store_id !== store_id) {
      return res
        .status(403)
        .json({ error: "Nemate ovlasti za odbijanje ove rezervacije." });
    }

    if (result.rows[0].status !== "Pending") {
      return res
        .status(400)
        .json({ error: "Rezervacija nije u statusu 'Pending'." });
    }
    await pool.query(
      "UPDATE reservations SET status = 'Cancelled' WHERE id = $1",
      [reservationId],
    );
    await pool.query(
      `INSERT INTO notifications (user_id, message) VALUES ($1, $2)`,
      [result.rows[0].restaurant_id, `Vaša rezervacija je odbijena.`],
    );
    return res
      .status(200)
      .json({ message: "Rezervacija je uspješno odbijena." });
  } catch (error) {
    console.error("Greška prilikom odbijanje rezervacije:", error);
    return res
      .status(500)
      .json({ error: "Došlo je do greške prilikom odbijanja rezervacije." });
  }
};

export const cancelReservation = async (req, res) => {
  const reservationId = req.params.id;
  const restaurant_id = req.user.id;
  try {
    if (!reservationId) {
      return res.status(400).json({ error: "ID rezervacije je obavezan." });
    }
    const result = await pool.query(
      `SELECT 
    reservations.id, 
    reservations.status, 
    reservations.restaurant_id,
    products.store_id 
   FROM reservations 
   JOIN products ON reservations.product_id = products.id 
   WHERE reservations.id = $1`,
      [reservationId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Rezervacija nije pronađena." });
    }

    if (result.rows[0].restaurant_id !== restaurant_id) {
      return res
        .status(403)
        .json({ error: "Nemate ovlasti za otkazivanje ove rezervacije." });
    }

    if (result.rows[0].status !== "Pending") {
      return res
        .status(400)
        .json({ error: "Rezervacija nije u statusu 'Pending'." });
    }

    await pool.query(
      "UPDATE reservations SET status = 'Cancelled' WHERE id = $1",
      [reservationId],
    );
    await pool.query(
      "INSERT INTO notifications (user_id, message) VALUES ($1, $2)",
      [result.rows[0].store_id, "Rezervacija vašeg proizvoda je otkazana"],
    );
    return res
      .status(200)
      .json({ message: "Rezervacija je uspješno otkazana." });
  } catch (error) {
    console.error("Greška prilikom otkazivanja rezervacije:", error);
    return res
      .status(500)
      .json({ error: "Došlo je do greške prilikom otkazivanja rezervacije." });
  }
};
