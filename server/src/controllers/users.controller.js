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
