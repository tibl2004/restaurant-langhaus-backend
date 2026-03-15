const pool = require("../database/index");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const loginController = {

  authenticateToken: (req,res,next)=>{

    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if(!token){
      return res.status(401).json({error:"Kein Token bereitgestellt"});
    }

    jwt.verify(token,process.env.JWT_SECRET,(err,user)=>{

      if(err){
        return res.status(403).json({error:"Token ungültig"});
      }

      req.user = user;
      next();

    });

  },

  login: async(req,res)=>{

    try{

      const {username,password} = req.body;

      if(!username || !password){
        return res.status(400).json({
          error:"Benutzername und Passwort erforderlich"
        });
      }

      const [rows] = await pool.query(
        "SELECT * FROM admin WHERE username=?",
        [username]
      );

      if(rows.length===0){
        return res.status(401).json({error:"Login fehlgeschlagen"});
      }

      const admin = rows[0];

      const valid = await bcrypt.compare(password,admin.passwort);

      if(!valid){
        return res.status(401).json({error:"Login fehlgeschlagen"});
      }

      const token = jwt.sign({

        id:admin.id,
        username:admin.username,
        role:"admin"

      },
      process.env.JWT_SECRET,
      {
        expiresIn:process.env.JWT_EXPIRES,
        issuer:"restaurant-backend"
      });

      res.json({
        message:"Login erfolgreich",
        token
      });

    }catch(err){

      console.error(err);

      res.status(500).json({
        error:"Server Fehler beim Login"
      });

    }

  }

};

module.exports = loginController;