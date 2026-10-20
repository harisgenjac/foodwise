// Dates relative to today, so the tests do not start failing once a fixed date has passed.
export const futureDate = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const EXPIRY_DATE = futureDate(30);
export const PICKUP_DATE = `${futureDate(29)}T10:00:00.000Z`;

export const registerAndLogin = async (request, app, email, role) => {
  await request(app).post("/api/auth/register").send({
    first_name: "Test",
    last_name: "User",
    email,
    password: "test12345",
    role,
  });
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email, password: "test12345" });
  return agent;
};

export const productBody = (overrides = {}) => ({
  name: "Piletina",
  description: "Test description",
  category: "Meat",
  original_price: 10,
  discounted_price: 5,
  quantity: 10,
  unit: "kg",
  expiry_date: EXPIRY_DATE,
  ...overrides,
});
