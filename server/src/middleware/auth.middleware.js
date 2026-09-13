import jwt from 'jsonwebtoken';

export const authenticate = (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ error: 'Niste prijavljeni.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; 
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token je nevažeći ili je istekao.' });
  }
};

export const authorize = (allowedRole) => {
  return (req, res, next) => {

   const role = req.user.role
  
   if (role !== allowedRole) {
   return res.status(403).json({error: "Nemate odgovarajuću rolu za ovu akciju."})
   }
   next()
  };
};