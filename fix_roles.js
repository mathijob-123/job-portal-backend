const db = require('./db');
setTimeout(() => {
  db.run("UPDATE users SET role = 'admin' WHERE role = 'Admin'", function(err) {
    if (err) console.error(err);
    else console.log('Fixed ' + this.changes + ' admin accounts role to lowercase');
    
    db.all("SELECT id, email, role FROM users", [], (err, rows) => {
      if (!err) console.log('All users:', JSON.stringify(rows, null, 2));
      process.exit(0);
    });
  });
}, 500);
