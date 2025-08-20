const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./DOT_data.db', (err) => {
  if (err) {
    console.error(err.message);
    return;
  }
  console.log('Conectado a la base de datos.');
});

db.all('SELECT * FROM users', [], (err, rows) => {
  if (err) {
    console.error(err.message);
    return;
  }
  
  console.log('\n--- USUARIOS REGISTRADOS ---');
  rows.forEach((row) => {
    console.log(`ID: ${row.id}, Usuario: ${row.username}`);
  });
  
  db.close();
});