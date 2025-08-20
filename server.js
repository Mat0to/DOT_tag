const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json()); // Para manejar JSON

app.use(session({
  secret: 'clave-secreta', // cambiar por algo seguro
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 600000 } // 10 minutos
}));

// Conexión a la base de datos SQLite
const db = new sqlite3.Database('./DOT_data.db', (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Conectado a la base de datos SQLite.');
});

// Crear tabla users si no existe
db.run(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL
)`, (err) => {
  if (err) {
    console.error("Error creando tabla users:", err.message);
  } else {
    console.log("Tabla users lista");
  }
});

// Crear tabla device_data actualizada con campos del formulario
db.run(`CREATE TABLE IF NOT EXISTS device_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE NOT NULL,
  full_name TEXT,
  blood_type TEXT,
  allergies TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  medical_conditions TEXT,
  vital_medications TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
)`, (err) => {
  if (err) {
    console.error("Error creando tabla device_data:", err.message);
  } else {
    console.log("Tabla device_data lista");
  }
});

// Registro (signup)
app.post('/signup', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).send("Faltan datos");

  bcrypt.hash(password, 10, (err, hash) => {
    if (err) return res.status(500).send("Error al encriptar");

    db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hash], function(err) {
      if (err) {
        return res.status(500).send("Usuario ya existe o error");
      }
      res.send("Usuario registrado");
    });
  });
});

// Login actualizado con redirección
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) return res.status(500).send("Error base de datos");
    if (!user) return res.status(401).send("Usuario no encontrado");

    bcrypt.compare(password, user.password, (err, match) => {
      if (err) return res.status(500).send("Error al verificar password");
      if (!match) return res.status(401).send("Contraseña incorrecta");

      req.session.userId = user.id;
      req.session.username = username; // Guardamos también el username
      
      // Respuesta con información de redirección
      res.json({
        success: true,
        message: "Login exitoso",
        redirectTo: "/simulation.html", // Cambia esta ruta por donde quieras redirigir
        user: {
          id: user.id,
          username: username
        }
      });
    });
  });
});

// NUEVA RUTA: Guardar datos del formulario médico
app.post('/save-medical-data', checkAuth, (req, res) => {
  const { 
    full_name, 
    blood_type, 
    allergies, 
    emergency_contact_name, 
    emergency_contact_phone, 
    medical_conditions, 
    vital_medications 
  } = req.body;

  // Verificar si ya existe un registro para este usuario
  db.get(`SELECT id FROM device_data WHERE user_id = ?`, [req.session.userId], (err, row) => {
    if (err) {
      console.error(err.message);
      return res.status(500).json({ error: "Error verificando datos existentes" });
    }

    if (row) {
      // Actualizar registro existente
      db.run(`UPDATE device_data SET 
              full_name = ?, blood_type = ?, allergies = ?, 
              emergency_contact_name = ?, emergency_contact_phone = ?, 
              medical_conditions = ?, vital_medications = ?, 
              updated_at = CURRENT_TIMESTAMP
              WHERE user_id = ?`,
        [full_name, blood_type, allergies, emergency_contact_name, 
         emergency_contact_phone, medical_conditions, vital_medications, req.session.userId],
        function(err) {
          if (err) {
            console.error(err.message);
            return res.status(500).json({ error: "Error actualizando datos" });
          }
          res.json({ success: true, message: "Datos actualizados correctamente" });
        }
      );
    } else {
      // Crear nuevo registro
      db.run(`INSERT INTO device_data 
              (user_id, full_name, blood_type, allergies, emergency_contact_name, 
               emergency_contact_phone, medical_conditions, vital_medications)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.session.userId, full_name, blood_type, allergies, emergency_contact_name, 
         emergency_contact_phone, medical_conditions, vital_medications],
        function(err) {
          if (err) {
            console.error(err.message);
            return res.status(500).json({ error: "Error guardando datos" });
          }
          res.json({ success: true, message: "Datos guardados correctamente" });
        }
      );
    }
  });
});

// NUEVA RUTA: Obtener datos médicos del usuario
app.get('/get-medical-data', checkAuth, (req, res) => {
  db.get(`SELECT full_name, blood_type, allergies, emergency_contact_name, 
          emergency_contact_phone, medical_conditions, vital_medications, 
          created_at, updated_at FROM device_data WHERE user_id = ?`, 
    [req.session.userId], (err, row) => {
    if (err) {
      console.error(err.message);
      return res.status(500).json({ error: "Error obteniendo datos" });
    }
    res.json(row || null);
  });
});

// Ruta legacy (mantener compatibilidad)
app.post('/save-device-data', checkAuth, (req, res) => {
  const { blood_type, allergies, emergency_contact, medications } = req.body;

  // Guardar datos en la base de datos
  db.run(`INSERT INTO device_data (user_id, blood_type, allergies, emergency_contact_phone, vital_medications)
          VALUES (?, ?, ?, ?, ?)`,
    [req.session.userId, blood_type, allergies, emergency_contact, medications],
    function(err) {
      if (err) {
        console.error(err.message);
        return res.status(500).send("Error guardando datos");
      }
      res.send("Datos guardados con éxito");
    }
  );
});

// Ruta legacy (mantener compatibilidad)
app.get('/get-device-data', checkAuth, (req, res) => {
  db.get(`SELECT * FROM device_data WHERE user_id = ?`, [req.session.userId], (err, row) => {
    if (err) {
      console.error(err.message);
      return res.status(500).send("Error obteniendo datos");
    }
    res.json(row || {});
  });
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).send("Error cerrando sesión");
    res.send("Logout exitoso");
  });
});

// Middleware para proteger rutas
function checkAuth(req, res, next) {
  if (req.session.userId) {
    next();
  } else {
    res.status(401).json({ error: "No autorizado" });
  }
}

// Ejemplo ruta protegida
app.get('/dashboard', checkAuth, (req, res) => {
  res.send(`Bienvenido usuario ${req.session.username || req.session.userId}`);
});

// Ruta para verificar sesión (útil para páginas protegidas)
app.get('/check-auth', (req, res) => {
  if (req.session.userId) {
    res.json({
      authenticated: true,
      user: {
        id: req.session.userId,
        username: req.session.username
      }
    });
  } else {
    res.json({ authenticated: false });
  }
});

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Página principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index'));
});

// Ruta para login.html
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login'));
});

// Ruta para simulador (página protegida opcional)
app.get('/simulation.html', checkAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'simulation'));
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});