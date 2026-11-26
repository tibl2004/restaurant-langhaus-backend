
const jwt = require("jsonwebtoken");

// ======================================
// AUTHENTICATION
// ======================================

const authenticateToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        error: "Kein Token vorhanden."
      });
    }

    // Bearer Token oder direktes Token
    let token = authHeader;

    if (authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }

    if (!token || token.trim() === "") {
      return res.status(401).json({
        error: "Token fehlt."
      });
    }

    // JWT überprüfen
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET,
      {
        issuer: "restaurant-backend",
        audience: "admin"
      }
    );

    // Benutzerinformationen speichern
    req.user = {
      id: decoded.id,
      username: decoded.username,
      userTypes: Array.isArray(decoded.userTypes)
        ? decoded.userTypes
        : []
    };

    next();

  } catch (err) {
    console.error("AUTH ERROR:", err.message);

    return res.status(403).json({
      error: "Token ungültig oder abgelaufen."
    });
  }
};

// ======================================
// ADMIN AUTHORIZATION
// ======================================

const requireAdmin = (req, res, next) => {

  if (!req.user) {
    return res.status(401).json({
      error: "Nicht authentifiziert."
    });
  }

  if (!req.user.userTypes.includes("admin")) {
    return res.status(403).json({
      error: "Keine Admin-Berechtigung."
    });
  }

  next();
};

// ======================================
// EXPORTS
// ======================================

module.exports = authenticateToken;
module.exports.authenticateToken = authenticateToken;
module.exports.requireAdmin = requireAdmin;
