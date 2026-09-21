import pool from "../config/db.js";

export const getUser = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      "SELECT id, first_name, last_name, email, role, business_name, logo_url, address, city, opening_hours, pickup_hours, description, phone, created_at FROM users WHERE id = $1",
      [userId],
    );
    return res.status(200).json({ user: result.rows[0] });
  } catch (error) {
    console.error("Greška prilikom dohvatanja korisnika:", error);
    return res
      .status(500)
      .json({ error: "Došlo je do greške prilikom dohvatanja korisnika." });
  }
};

export const updateUser = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      first_name,
      last_name,
      business_name,
      logo_url,
      address,
      city,
      opening_hours,
      pickup_hours,
      description,
      phone,
    } = req.body;

    if (!first_name || !last_name || !business_name || !city || !phone) {
      return res.status(400).json({
        error: "Ime, prezime, naziv biznisa, grad i telefon su obavezni.",
      });
    }

    const result = await pool.query(
      `UPDATE users SET 
  first_name = $1, 
  last_name = $2, 
  business_name = $3, 
  logo_url = COALESCE($4, logo_url), 
  address = COALESCE($5, address), 
  city = $6, 
  opening_hours = COALESCE($7, opening_hours), 
  pickup_hours = COALESCE($8, pickup_hours), 
  description = COALESCE($9, description), 
  phone = $10
       WHERE id = $11
       RETURNING id, first_name, last_name, email, role, business_name, logo_url, address, city, opening_hours, pickup_hours, description, phone`,
      [
        first_name,
        last_name,
        business_name,
        logo_url,
        address,
        city,
        opening_hours,
        pickup_hours,
        description,
        phone,
        userId,
      ],
    );
    return res
      .status(200)
      .json({ message: "Profil uspješno ažuriran.", user: result.rows[0] });
  } catch (error) {
    console.error("Greška prilikom uređivanja korisnika:", error);
    return res
      .status(500)
      .json({ error: "Došlo je do greške prilikom uređivanja korisnika." });
  }
};

export const getStores = async (req, res) => {
  try {
    const { city, business_name } = req.query;
    let query = `SELECT id, business_name, city, address, logo_url, 
     description, opening_hours, pickup_hours, phone 
     FROM users WHERE role = 'STORE'`;

    let values = [];

    if (city) {
      values.push(`%${city}%`);
      query += ` AND city ILIKE $${values.length}`;
    }

    if (business_name) {
      values.push(`%${business_name}%`);
      query += ` AND business_name ILIKE $${values.length}`;
    }

    query += " ORDER BY business_name ASC";
    const result = await pool.query(query, values);

    return res
      .status(200)
      .json({ message: "Uspješno dohvaćene prodavnice", stores: result.rows });
  } catch (error) {
    console.error("Greška prilikom dohvatanja prodavnica:", error);
    return res
      .status(500)
      .json({ error: "Došlo je do greške prilikom dohvatanja prodavnica." });
  }
};

export const getStoreDetails = async (req, res) => {
  try {
    const storeId = req.params.id;
    const userRole = req.user.role;

    if (userRole === "STORE") {
      return res.status(403).json({ error: "Nemate permisiju za ovu akciju." });
    }

    const result = await pool.query(
      `SELECT id, business_name, city, address, logo_url, 
       description, opening_hours, pickup_hours, phone 
       FROM users WHERE id = $1 AND role = 'STORE'`,
      [storeId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Prodavnica nije pronađena." });
    }

    const products = await pool.query(
      `
      SELECT 
        products.*, 
        products.quantity - COALESCE(
          (SELECT SUM(quantity) FROM reservations 
           WHERE reservations.product_id = products.id 
           AND reservations.status IN ('Pending', 'Confirmed')),
          0
        ) AS available_quantity,
        products.expiry_date - CURRENT_DATE AS days_until_expiry
      FROM products 
      WHERE store_id = $1 AND status = 'Available'
      AND expiry_date >= CURRENT_DATE
    `,
      [storeId],
    );

    const stats = await pool.query(
      `SELECT 
     COUNT(DISTINCT id) FILTER (WHERE status = 'Sold') AS sold_articles,
     (SELECT COUNT(*) FROM reservations r JOIN products p ON r.product_id = p.id WHERE p.store_id = $1 AND r.status = 'Confirmed') AS successful_reservations
   FROM products WHERE store_id = $1`,
      [storeId],
    );

    const myReservations = await pool.query(
      `SELECT COUNT(*) AS my_reservations_count
   FROM reservations r
   JOIN products p ON r.product_id = p.id
   WHERE p.store_id = $1 AND r.restaurant_id = $2 AND r.status IN ('Confirmed', 'Completed')`,
      [storeId, req.user.id],
    );
    return res.status(200).json({
      message: "Uspješno dohvaćena prodavnica",
      store: result.rows[0],
      products: products.rows,
      stats: stats.rows[0],
      myReservations: myReservations.rows[0],
    });
  } catch (error) {
    console.error("Greška prilikom dohvatanja prodavnice:", error);
    return res
      .status(500)
      .json({ error: "Došlo je do greške prilikom dohvatanja prodavnice." });
  }
};

export const uploadLogo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Slika nije poslana." });
    }

    const userId = req.user.id;
    const logoUrl = `/uploads/logos/${req.file.filename}`;

    const result = await pool.query(
      `UPDATE users SET logo_url = $1 WHERE id = $2 RETURNING id, logo_url`,
      [logoUrl, userId],
    );

    return res.status(200).json({
      message: "Slika uspješno postavljena.",
      logo_url: result.rows[0].logo_url,
    });
  } catch (error) {
    console.error("Greška prilikom uploada slike:", error);
    return res
      .status(500)
      .json({ error: "Došlo je do greške prilikom uploada slike." });
  }
};
